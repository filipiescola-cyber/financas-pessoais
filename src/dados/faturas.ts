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
import { hoje, type DataISO } from '../dominio/datas';
import {
  faturaEscolhida,
  proximasFaturas,
  saldoDaFatura,
  type ConfiguracaoDoCartao,
} from '../dominio/fatura';
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
  /** Ajuste manual em meses sobre a fatura calculada (§2.1). */
  deslocamento = 0,
): Promise<string> {
  const calculada = faturaEscolhida(competencia, configuracao, deslocamento);

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
  deslocamento = 0,
): Promise<Map<DataISO, string>> {
  const mapa = new Map<DataISO, string>();
  for (const competencia of competencias) {
    if (mapa.has(competencia)) continue;
    mapa.set(competencia, await idDaFatura(cartaoId, competencia, configuracao, deslocamento));
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
/**
 * Quanto ainda se deve num cartão, partido em duas metades (§2.1).
 *
 * `cobravel` é o que já venceu e não foi pago — dívida de agora. `futura` é o
 * que ainda vai vencer, quase sempre parcelamento em curso. A divisão existe
 * porque só a primeira metade impede encerrar o cartão: a segunda é dívida
 * conhecida, e exigir quitá-la deixaria o cartão morto na lista por um ano.
 *
 * Valores vêm negativos, como as próprias transações de despesa.
 */
export async function dividaDoCartao(
  cartaoId: string,
): Promise<{ cobravel: Centavos; futura: Centavos }> {
  const { data: faturas, error } = await supabase
    .from('faturas')
    .select('id, data_vencimento')
    .eq('cartao_id', cartaoId)
    .neq('status', 'paga');
  if (error) throw error;
  if (!faturas || faturas.length === 0) return { cobravel: 0, futura: 0 };

  const { data: linhas, error: erroLinhas } = await supabase
    .from('transacoes')
    .select('valor, fatura_id')
    .in(
      'fatura_id',
      faturas.map((f) => f.id),
    )
    // Filha de divisão não soma: o pai já está na fatura (§5.5).
    .is('transacao_pai_id', null);
  if (erroLinhas) throw erroLinhas;

  const vencimento = new Map(faturas.map((f) => [f.id, f.data_vencimento]));
  const referencia = hoje();

  let cobravel = 0;
  let futura = 0;
  for (const linha of linhas ?? []) {
    const venc = linha.fatura_id === null ? undefined : vencimento.get(linha.fatura_id);
    if (venc === undefined) continue;
    if (venc <= referencia) cobravel += paraCentavos(linha.valor);
    else futura += paraCentavos(linha.valor);
  }

  return { cobravel, futura };
}

/**
 * Cartões que ainda têm fatura por pagar, encerrados ou não.
 *
 * A tela de faturas usa isto para continuar mostrando um cartão encerrado
 * enquanto sobrar dívida: some do seletor de lançamento, mas não da tela onde
 * a dívida se paga. Dívida que sai da vista não é dívida resolvida.
 */
export type DividaDoCartao = {
  /** O que ainda não foi pago, sempre positivo: é dívida, não saldo. */
  total: Centavos;
  /** Vencimento da fatura não paga mais próxima. */
  proximoVencimento: DataISO | null;
};

/**
 * Quanto se deve em cada cartão (§2.1).
 *
 * Positivo de propósito. As transações estão gravadas negativas, porque são
 * despesa — mas na tela isto responde "quanto você deve", e dívida com sinal
 * de menos é a mesma armadilha do §2.6: o número lido ao contrário do que
 * significa.
 *
 * Uma consulta para todos os cartões em vez de uma por cartão: são poucas
 * faturas em aberto, e a tela de contas precisa de todas de uma vez.
 */
/**
 * O status de um punhado de faturas, pelo id.
 *
 * A lista de lançamentos precisa saber quais faturas ainda não foram pagas:
 * uma fatura em aberto é saída de caixa que vai acontecer, e o saldo previsto
 * do dia tem que contar com ela. A paga não — nessa o dinheiro já saiu pela
 * transferência da quitação, e somar de novo tiraria o valor duas vezes.
 */
export async function statusDasFaturas(
  ids: readonly string[],
): Promise<Map<string, StatusFatura>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('faturas')
    .select('id, status')
    .in('id', [...ids]);
  if (error) throw error;

  return new Map((data ?? []).map((f) => [f.id, f.status as StatusFatura]));
}

export async function dividasDosCartoes(): Promise<Map<string, DividaDoCartao>> {
  const { data: faturas, error } = await supabase
    .from('faturas')
    .select('id, cartao_id, data_vencimento')
    .neq('status', 'paga');
  if (error) throw error;
  if (!faturas || faturas.length === 0) return new Map();

  const ids = faturas.map((f) => f.id);

  const [compras, pagamentos] = await Promise.all([
    supabase
      .from('transacoes')
      .select('valor, fatura_id')
      // Filha de divisão não soma: o pai já está na fatura (§5.5).
      .is('transacao_pai_id', null)
      .in('fatura_id', ids),
    // Pagamento parcial abate sem quitar. Sem descontá-lo aqui, "o que você
    // deve" mostraria a fatura cheia depois de já ter pago metade dela.
    supabase.from('transacoes').select('valor, fatura_paga_id').in('fatura_paga_id', ids),
  ]);

  if (compras.error) throw compras.error;
  if (pagamentos.error) throw pagamentos.error;

  const linhas = compras.data;

  const daFatura = new Map(faturas.map((f) => [f.id, f]));
  const porCartao = new Map<string, { total: Centavos; vencimentos: DataISO[] }>();

  for (const linha of linhas ?? []) {
    const fatura = linha.fatura_id === null ? undefined : daFatura.get(linha.fatura_id);
    if (fatura === undefined) continue;
    const atual = porCartao.get(fatura.cartao_id) ?? { total: 0, vencimentos: [] };
    atual.total += Math.abs(paraCentavos(linha.valor));
    atual.vencimentos.push(fatura.data_vencimento);
    porCartao.set(fatura.cartao_id, atual);
  }

  for (const linha of pagamentos.data ?? []) {
    const fatura = linha.fatura_paga_id === null ? undefined : daFatura.get(linha.fatura_paga_id);
    if (fatura === undefined) continue;
    const atual = porCartao.get(fatura.cartao_id);
    if (!atual) continue;
    // Nunca abaixo de zero: pagar a mais não vira crédito (§2.1).
    atual.total = Math.max(0, atual.total - Math.abs(paraCentavos(linha.valor)));
  }

  return new Map(
    [...porCartao.entries()]
      .filter(([, v]) => v.total !== 0)
      .map(([cartaoId, v]) => [
        cartaoId,
        { total: v.total, proximoVencimento: v.vencimentos.sort()[0] ?? null },
      ]),
  );
}

export async function cartoesComFaturaPendente(): Promise<string[]> {
  const { data: faturas, error } = await supabase
    .from('faturas')
    .select('id, cartao_id')
    .neq('status', 'paga');
  if (error) throw error;
  if (!faturas || faturas.length === 0) return [];

  const { data: linhas, error: erroLinhas } = await supabase
    .from('transacoes')
    .select('valor, fatura_id')
    .in(
      'fatura_id',
      faturas.map((f) => f.id),
    )
    .is('transacao_pai_id', null);
  if (erroLinhas) throw erroLinhas;

  const doCartao = new Map(faturas.map((f) => [f.id, f.cartao_id]));
  const total = new Map<string, Centavos>();
  for (const linha of linhas ?? []) {
    const cartaoId = linha.fatura_id === null ? undefined : doCartao.get(linha.fatura_id);
    if (cartaoId === undefined) continue;
    total.set(cartaoId, (total.get(cartaoId) ?? 0) + paraCentavos(linha.valor));
  }

  return [...total.entries()].filter(([, valor]) => valor !== 0).map(([cartaoId]) => cartaoId);
}

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
/**
 * Desfaz o pagamento de uma fatura (§2.1).
 *
 * Existe porque pagamento errado acontece — conta trocada, valor digitado a
 * mais, data do mês anterior — e sem volta o jeito de consertar seria apagar
 * lançamento na mão, que é justamente o que este app não pede de ninguém.
 *
 * A ordem importa: a fatura aponta para a transação do pagamento e a transação
 * aponta de volta para o par. Apagar antes de soltar o vínculo esbarra na
 * restrição do banco.
 *
 * O status volta a `fechada` ou `aberta` conforme a data de fechamento já
 * tenha passado — e não sempre para `aberta`, senão uma fatura de três meses
 * atrás reabriria como se ainda aceitasse compra.
 */
/**
 * Desfaz UM pagamento — o mais recente (§2.1).
 *
 * Com pagamento parcial há vários, e apagar todos por causa de um clique seria
 * destruir o que não foi pedido. Desfazer duas vezes desfaz dois.
 *
 * O status não é escolhido aqui: `acertarStatusDaFatura` recalcula depois da
 * remoção. Se ainda restava outro pagamento cobrindo tudo, a fatura continua
 * paga — e isso é o certo.
 */
export async function desfazerPagamentoDeFatura(faturaId: string): Promise<void> {
  const { data: pagamentos, error } = await supabase
    .from('transacoes')
    .select('id, transferencia_par_id')
    .eq('fatura_paga_id', faturaId)
    .order('data_caixa', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const entrada = pagamentos?.[0];
  if (!entrada) throw new Error('Esta fatura não tem pagamento registrado.');

  // Solta o vínculo antes de apagar: a fatura ainda pode referenciar a saída.
  const { error: erroSolta } = await supabase
    .from('faturas')
    .update({ transacao_pagamento_id: null })
    .eq('id', faturaId);
  if (erroSolta) throw new Error(erroSolta.message);

  const paraApagar = [entrada.id, entrada.transferencia_par_id].filter(
    (id): id is string => typeof id === 'string',
  );
  if (paraApagar.length === 0) return;

  // O par também aponta de volta: desfaz os dois lados antes de excluir.
  const { error: erroPar } = await supabase
    .from('transacoes')
    .update({ transferencia_par_id: null })
    .in('id', paraApagar);
  if (erroPar) throw new Error(erroPar.message);

  const { error: erroApagar } = await supabase.from('transacoes').delete().in('id', paraApagar);
  if (erroApagar) throw new Error(erroApagar.message);

  await acertarStatusDaFatura(faturaId);
}

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
      // nenhuma: `fatura_id` fica nulo, senão o pagamento reduziria o próprio
      // total que ele está pagando. Quem guarda a ligação é `fatura_paga_id`.
      { ...comum, conta_id: dados.cartaoId, valor: paraNumerico(valor), fatura_paga_id: dados.faturaId },
    ])
    .select('id');

  if (error) throw new Error(error.message);

  const [saida, entrada] = data ?? [];
  if (!saida || !entrada) throw new Error('Pagamento gravado pela metade.');

  await Promise.all([
    supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id),
    supabase.from('transacoes').update({ transferencia_par_id: saida.id }).eq('id', entrada.id),
  ]);

  await acertarStatusDaFatura(dados.faturaId, saida.id);
}

/**
 * Recalcula o que a fatura deve e ajusta o status (§13.2).
 *
 * `paga` deixa de ser gravado por decisão de quem clicou: ele é o que sobra
 * quando não falta mais nada. Um pagamento parcial mantém a fatura devendo, e
 * é isso que faz o resto continuar aparecendo em "o que você deve".
 *
 * Não quitada, o status volta a ser o do ciclo — `fechada` se a data de
 * fechamento já passou, `aberta` se não. É a mesma regra que o gatilho de
 * reabertura usa: pagamento e ciclo são dimensões diferentes da mesma coluna, e
 * misturá-las foi o que criou o defeito.
 */
export async function acertarStatusDaFatura(
  faturaId: string,
  transacaoPagamentoId?: string | null,
): Promise<void> {
  const [total, pago, fatura] = await Promise.all([
    totalDaFatura(faturaId),
    totalPagoDaFatura(faturaId),
    supabase.from('faturas').select('data_fechamento').eq('id', faturaId).single(),
  ]);

  const saldo = saldoDaFatura(total, pago);
  const doCiclo =
    (fatura.data?.data_fechamento ?? hoje()) <= hoje() ? ('fechada' as const) : ('aberta' as const);

  const { error } = await supabase
    .from('faturas')
    .update({
      status: saldo.quitada ? 'paga' : doCiclo,
      valor_total: paraNumerico(total),
      ...(transacaoPagamentoId !== undefined
        ? { transacao_pagamento_id: transacaoPagamentoId }
        : {}),
    })
    .eq('id', faturaId);

  if (error) throw new Error(error.message);
}

/** Soma de tudo que já foi pago nesta fatura. Vários pagamentos somam. */
export async function totalPagoDaFatura(faturaId: string): Promise<Centavos> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('valor')
    .eq('fatura_paga_id', faturaId);
  if (error) throw error;

  return (data ?? []).reduce((soma, linha) => soma + Math.abs(paraCentavos(linha.valor)), 0);
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

