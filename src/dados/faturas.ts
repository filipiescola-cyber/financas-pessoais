// Faturas de cartão (§2.1, §4.2). O miolo da Fase 2.
//
// Decisão que atravessa este módulo: `faturas.valor_total` NÃO é a fonte da
// verdade enquanto a fatura está aberta. Saldo e total são calculados, não
// armazenados (§13.2) — guardar o total numa coluna cria dessincronização na
// primeira edição de transação antiga.
//
// A coluna existe e é usada como INSTANTÂNEO: quando a fatura fecha, o total
// daquele momento é gravado. Enquanto aberta, quem pergunta soma as transações.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, type DataISO } from '../dominio/datas';
import { faturaDeReferencia, faturaDoMes, proximasFaturas, type ConfiguracaoDoCartao } from '../dominio/fatura';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type LinhaFatura = Database['public']['Tables']['faturas']['Row'];

export type StatusFatura = 'aberta' | 'fechada' | 'paga';

export type Fatura = {
  id: string;
  cartaoId: string;
  mesReferencia: DataISO;
  dataFechamento: DataISO;
  dataVencimento: DataISO;
  /** Instantâneo gravado no fechamento. Enquanto aberta, use `total`. */
  valorTotalGravado: Centavos;
  status: StatusFatura;
  transacaoPagamentoId: string | null;
};

function daLinha(linha: LinhaFatura): Fatura {
  return {
    id: linha.id,
    cartaoId: linha.cartao_id,
    mesReferencia: linha.mes_referencia,
    dataFechamento: linha.data_fechamento,
    dataVencimento: linha.data_vencimento,
    valorTotalGravado: paraCentavos(linha.valor_total),
    status: linha.status as StatusFatura,
    transacaoPagamentoId: linha.transacao_pagamento_id,
  };
}

/**
 * Garante que as próximas N faturas do cartão existam (§4.2).
 * Idempotente: o índice único (cartao_id, mes_referencia) impede duplicata, e
 * rodar dez vezes produz o mesmo estado — exigência do §13.3 para tudo que é
 * disparado na abertura do app.
 */
export async function garantirFaturas(
  cartaoId: string,
  configuracao: ConfiguracaoDoCartao,
  quantidade = 12,
  aPartirDe: DataISO = hoje(),
): Promise<void> {
  const faturas = proximasFaturas(aPartirDe, configuracao, quantidade);

  const { error } = await supabase.from('faturas').upsert(
    faturas.map((fatura) => ({
      cartao_id: cartaoId,
      mes_referencia: fatura.mesReferencia,
      data_fechamento: fatura.dataFechamento,
      data_vencimento: fatura.dataVencimento,
    })),
    { onConflict: 'cartao_id,mes_referencia', ignoreDuplicates: true },
  );

  if (error) throw new Error(error.message);
}

/**
 * Id da fatura em que uma compra cai, criando-a se ainda não existir.
 * Compra com data antiga ou parcelamento longo pode apontar para um mês fora da
 * janela de 12 — por isso a criação sob demanda, em vez de confiar na janela.
 */
export async function idDaFatura(
  cartaoId: string,
  competencia: DataISO,
  configuracao: ConfiguracaoDoCartao,
): Promise<string> {
  const calculada = faturaDeReferencia(competencia, configuracao);

  const { data: existente, error: erroBusca } = await supabase
    .from('faturas')
    .select('id')
    .eq('cartao_id', cartaoId)
    .eq('mes_referencia', calculada.mesReferencia)
    .maybeSingle();
  if (erroBusca) throw new Error(erroBusca.message);
  if (existente) return existente.id;

  const { data, error } = await supabase
    .from('faturas')
    .insert({
      cartao_id: cartaoId,
      mes_referencia: calculada.mesReferencia,
      data_fechamento: calculada.dataFechamento,
      data_vencimento: calculada.dataVencimento,
    })
    .select('id')
    .single();

  if (error) {
    // Corrida com outra aba: alguém criou entre a busca e a inserção.
    const { data: recuperada } = await supabase
      .from('faturas')
      .select('id')
      .eq('cartao_id', cartaoId)
      .eq('mes_referencia', calculada.mesReferencia)
      .maybeSingle();
    if (recuperada) return recuperada.id;
    throw new Error(error.message);
  }

  return data.id;
}

/** Resolve várias competências de uma vez — o caso do parcelamento em 12x. */
export async function idsDasFaturas(
  cartaoId: string,
  competencias: DataISO[],
  configuracao: ConfiguracaoDoCartao,
): Promise<Map<DataISO, string>> {
  const mapa = new Map<DataISO, string>();
  for (const competencia of competencias) {
    if (mapa.has(competencia)) continue;
    mapa.set(competencia, await idDaFatura(cartaoId, competencia, configuracao));
  }
  return mapa;
}

export async function listarFaturas(cartaoId: string): Promise<Fatura[]> {
  const { data, error } = await supabase
    .from('faturas')
    .select('*')
    .eq('cartao_id', cartaoId)
    .order('mes_referencia');
  if (error) throw error;
  return (data ?? []).map(daLinha);
}

/** Total de uma fatura somando as transações. Não lê `valor_total` (§13.2). */
export async function totalDaFatura(faturaId: string): Promise<Centavos> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('valor, transacao_pai_id')
    .eq('fatura_id', faturaId);
  if (error) throw error;

  // Filha de divisão não soma: o pai já está na fatura (§5.5).
  return (data ?? [])
    .filter((linha) => linha.transacao_pai_id === null)
    .reduce((total, linha) => total + paraCentavos(linha.valor), 0);
}

/**
 * Fecha as faturas cuja data de fechamento já passou (§13.3).
 *
 * Idempotente e retroativa: se o usuário ficar 40 dias sem abrir o app, ao
 * voltar todas as faturas vencidas fecham de uma vez, sem duplicar nada. O total
 * é gravado aqui, como instantâneo do momento do fechamento.
 */
export async function fecharFaturasVencidas(referencia: DataISO = hoje()): Promise<number> {
  const { data, error } = await supabase
    .from('faturas')
    .select('id')
    .eq('status', 'aberta')
    .lt('data_fechamento', referencia);
  if (error) throw error;

  const aFechar = data ?? [];
  for (const fatura of aFechar) {
    const total = await totalDaFatura(fatura.id);
    const { error: erroFechamento } = await supabase
      .from('faturas')
      .update({ status: 'fechada', valor_total: paraNumerico(total) })
      .eq('id', fatura.id)
      // Só fecha o que ainda está aberta: evita reabrir uma fatura já paga se
      // duas abas rodarem a rotina ao mesmo tempo.
      .eq('status', 'aberta');
    if (erroFechamento) throw new Error(erroFechamento.message);
  }

  return aFechar.length;
}

/**
 * Pagamento de fatura é TRANSFERÊNCIA, nunca despesa (§2.1, §14).
 *
 * "A despesa já foi contabilizada nas compras. Contar as duas coisas = despesa
 * dobrada. Este é o erro mais comum em apps de finanças."
 */
export async function pagarFatura(dados: {
  faturaId: string;
  cartaoId: string;
  contaOrigemId: string;
  valor: Centavos;
  data: DataISO;
}): Promise<void> {
  const valor = Math.abs(dados.valor);
  const comum = {
    tipo: 'transferencia' as const,
    data_competencia: dados.data,
    data_caixa: dados.data,
    descricao: 'Pagamento de fatura',
    origem: 'manual' as const,
    revisado: true,
  };

  const { data, error } = await supabase
    .from('transacoes')
    .insert([
      { ...comum, conta_id: dados.contaOrigemId, valor: paraNumerico(-valor) },
      // A entrada no cartão abate o que está devido. Não entra em fatura
      // nenhuma: fatura_id fica nulo, senão o pagamento reduziria o próprio
      // total que ele está pagando.
      { ...comum, conta_id: dados.cartaoId, valor: paraNumerico(valor) },
    ])
    .select('id');

  if (error) throw new Error(error.message);

  const [saida, entrada] = data ?? [];
  if (!saida || !entrada) throw new Error('Pagamento gravado pela metade.');

  await Promise.all([
    supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id),
    supabase.from('transacoes').update({ transferencia_par_id: saida.id }).eq('id', entrada.id),
  ]);

  const { error: erroFatura } = await supabase
    .from('faturas')
    .update({
      status: 'paga',
      transacao_pagamento_id: saida.id,
      valor_total: paraNumerico(await totalDaFatura(dados.faturaId)),
    })
    .eq('id', dados.faturaId);

  if (erroFatura) throw new Error(erroFatura.message);
}

/**
 * Backfill das transações de cartão lançadas na Fase 1, quando faturas ainda não
 * eram geradas (ver PLANO-FASE-0-1.md, 1.4).
 *
 * Determinístico: a fatura sai de `data_competencia` e dos dias do cartão, que
 * já estão gravados. Só toca em linha com `fatura_id` nulo, então rodar duas
 * vezes não muda nada — e nada é apagado.
 *
 * Mesmo assim: exportar em JSON antes (§13.6). É a primeira operação do projeto
 * a mexer em linha já gravada.
 */
export async function backfillFaturas(): Promise<{ atualizadas: number; cartoes: number }> {
  const { data: cartoes, error: erroCartoes } = await supabase.from('cartoes').select('*');
  if (erroCartoes) throw erroCartoes;

  let atualizadas = 0;
  let comPendencia = 0;

  for (const cartao of cartoes ?? []) {
    const configuracao = {
      diaFechamento: cartao.dia_fechamento,
      diaVencimento: cartao.dia_vencimento,
    };

    const { data: orfas, error } = await supabase
      .from('transacoes')
      .select('id, data_competencia')
      .eq('conta_id', cartao.conta_id)
      .is('fatura_id', null)
      // Pagamento de fatura é transferência e não pertence a fatura nenhuma.
      .neq('tipo', 'transferencia');
    if (error) throw error;

    if ((orfas ?? []).length === 0) continue;
    comPendencia += 1;

    const mapa = await idsDasFaturas(
      cartao.conta_id,
      (orfas ?? []).map((t) => t.data_competencia),
      configuracao,
    );

    // Agrupa por fatura: um update por fatura em vez de um por transação. Um
    // mês de compras dava dezenas de idas ao banco só para preencher a mesma
    // coluna com o mesmo valor.
    const porFatura = new Map<string, string[]>();
    for (const transacao of orfas ?? []) {
      const faturaId = mapa.get(transacao.data_competencia);
      if (!faturaId) continue;
      porFatura.set(faturaId, [...(porFatura.get(faturaId) ?? []), transacao.id]);
    }

    for (const [faturaId, ids] of porFatura) {
      const { error: erroUpdate } = await supabase
        .from('transacoes')
        .update({ fatura_id: faturaId })
        .in('id', ids)
        // A condição continua aqui: se outra aba já vinculou, esta não desfaz.
        .is('fatura_id', null);
      if (erroUpdate) throw new Error(erroUpdate.message);
      atualizadas += ids.length;
    }
  }

  return { atualizadas, cartoes: comPendencia };
}

/** A fatura corrente de um cartão: a que ainda não fechou. */
export function faturaCorrente(configuracao: ConfiguracaoDoCartao, referencia: DataISO = hoje()) {
  return faturaDeReferencia(referencia, configuracao);
}

export function faturaDoMesDeReferencia(
  mesReferencia: DataISO,
  configuracao: ConfiguracaoDoCartao,
) {
  return faturaDoMes(primeiroDiaDoMes(mesReferencia), configuracao);
}
