// Geração automática dos lançamentos de recorrência (§5.2, §13.3).
//
// Aluguel, internet, assinatura, salário: cadastrados uma vez, aparecem sozinhos
// no dia certo. É o que sustenta o hábito no mês 3 — sem isso o usuário digita
// as mesmas dez linhas todo mês e desiste.
//
// A regra do §13.3 manda aqui: idempotente e retroativa. Se o usuário ficar 40
// dias sem abrir, ao voltar tudo se acerta sem duplicar nada.
//
// Como a idempotência é garantida SEM guardar estado: antes de gerar, o app
// pergunta se já existe transação com aquela `recorrencia_id` naquela
// `data_competencia`. O par é a chave natural — não precisa de controle
// paralelo que possa dessincronizar.

import { hoje, type DataISO } from '../dominio/datas';
import { vencimentosPendentes } from '../dominio/recorrencias';
import { faturaDeReferencia } from '../dominio/fatura';
import { idDaFatura } from './faturas';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];

export async function gerarRecorrenciasPendentes(referencia: DataISO = hoje()): Promise<number> {
  const { data: recorrencias, error } = await supabase
    .from('recorrencias')
    .select('*')
    .eq('ativo', true)
    .eq('frequencia', 'mensal');
  if (error) throw error;

  if (!recorrencias || recorrencias.length === 0) return 0;

  // Cartão precisa da configuração para achar a fatura e a data de caixa.
  const { data: cartoes } = await supabase.from('cartoes').select('*');
  const porConta = new Map((cartoes ?? []).map((c) => [c.conta_id, c]));

  // Tudo que já foi gerado, numa consulta só.
  //
  // Antes isto era uma consulta por mês por recorrência: dez recorrências com um
  // ano de janela davam mais de cem idas ao banco na primeira abertura. O par
  // (recorrencia_id, data_competencia) continua sendo a chave da idempotência —
  // só a leitura ficou barata.
  const { data: jaExistentes, error: erroExistentes } = await supabase
    .from('transacoes')
    .select('recorrencia_id, data_competencia')
    .not('recorrencia_id', 'is', null);
  if (erroExistentes) throw erroExistentes;

  const jaGeradas = new Set(
    (jaExistentes ?? []).map((linha) => `${linha.recorrencia_id}|${linha.data_competencia}`),
  );

  let geradas = 0;

  for (const recorrencia of recorrencias) {
    const criadaEm = (recorrencia.created_at ?? referencia).slice(0, 10);
    const vencimentos = vencimentosPendentes(criadaEm, referencia, recorrencia.dia);

    for (const competencia of vencimentos) {
      if (jaGeradas.has(`${recorrencia.id}|${competencia}`)) continue;

      const cartao = porConta.get(recorrencia.conta_id);
      const configuracao = cartao
        ? { diaFechamento: cartao.dia_fechamento, diaVencimento: cartao.dia_vencimento }
        : null;

      const ehReceita = recorrencia.tipo === 'receita';
      const valorPrevisto = recorrencia.valor_previsto;
      // O banco já guarda em numeric; aqui só o sinal é decidido, pelo tipo.
      // Sem valor previsto entra zerado, para o usuário só ajustar o número.
      const valor = valorPrevisto === null ? 0 : (ehReceita ? 1 : -1) * Math.abs(valorPrevisto);

      const linha: InsercaoTransacao = {
        conta_id: recorrencia.conta_id,
        categoria_id: recorrencia.categoria_id,
        descricao: recorrencia.descricao,
        valor,
        tipo: ehReceita ? 'receita' : 'despesa',
        data_competencia: competencia,
        // No cartão o dinheiro só sai no vencimento da fatura (§2.1).
        data_caixa: configuracao
          ? faturaDeReferencia(competencia, configuracao).dataVencimento
          : competencia,
        fatura_id: configuracao
          ? await idDaFatura(recorrencia.conta_id, competencia, configuracao)
          : null,
        recorrencia_id: recorrencia.id,
        natureza: recorrencia.natureza,
        origem: 'recorrencia',
        // Valor fixo entra confirmado; valor variável entra para revisão (§5.2).
        revisado: valorPrevisto !== null,
      };

      const { error: erroInsercao } = await supabase.from('transacoes').insert(linha);
      if (erroInsercao) throw new Error(erroInsercao.message);
      jaGeradas.add(`${recorrencia.id}|${competencia}`);
      geradas += 1;
    }
  }

  return geradas;
}

/**
 * Gera UMA ocorrência, sob comando do usuário.
 *
 * A geração automática não cria vencimento anterior à data em que a recorrência
 * foi cadastrada — senão cadastrar uma conta antiga despejaria meses de
 * lançamentos que ninguém pediu. Esta função é a saída para o outro lado desse
 * cuidado: o salário que venceu ontem e foi cadastrado hoje, que o usuário vê
 * como pendência e decide lançar.
 *
 * Continua idempotente: se aquela ocorrência já existe, não cria a segunda.
 */
export async function gerarUmaOcorrencia(
  recorrenciaId: string,
  competencia: DataISO,
): Promise<'criada' | 'ja-existia'> {
  const { count, error: erroBusca } = await supabase
    .from('transacoes')
    .select('id', { count: 'exact', head: true })
    .eq('recorrencia_id', recorrenciaId)
    .eq('data_competencia', competencia);
  if (erroBusca) throw erroBusca;
  if ((count ?? 0) > 0) return 'ja-existia';

  const { data: recorrencia, error } = await supabase
    .from('recorrencias')
    .select('*')
    .eq('id', recorrenciaId)
    .single();
  if (error) throw new Error(error.message);

  const { data: cartao } = await supabase
    .from('cartoes')
    .select('*')
    .eq('conta_id', recorrencia.conta_id)
    .maybeSingle();

  const configuracao = cartao
    ? { diaFechamento: cartao.dia_fechamento, diaVencimento: cartao.dia_vencimento }
    : null;

  const ehReceita = recorrencia.tipo === 'receita';
  const valorPrevisto = recorrencia.valor_previsto;
  const valor = valorPrevisto === null ? 0 : (ehReceita ? 1 : -1) * Math.abs(valorPrevisto);

  const linha: InsercaoTransacao = {
    conta_id: recorrencia.conta_id,
    categoria_id: recorrencia.categoria_id,
    descricao: recorrencia.descricao,
    valor,
    tipo: ehReceita ? 'receita' : 'despesa',
    data_competencia: competencia,
    data_caixa: configuracao
      ? faturaDeReferencia(competencia, configuracao).dataVencimento
      : competencia,
    fatura_id: configuracao
      ? await idDaFatura(recorrencia.conta_id, competencia, configuracao)
      : null,
    recorrencia_id: recorrencia.id,
    natureza: recorrencia.natureza,
    origem: 'recorrencia',
    revisado: valorPrevisto !== null,
  };

  const { error: erroInsercao } = await supabase.from('transacoes').insert(linha);
  if (erroInsercao) throw new Error(erroInsercao.message);
  return 'criada';
}

/** O que já foi gerado no período, para saber o que ainda falta. */
export async function ocorrenciasJaGeradas(de: DataISO, ate: DataISO): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('recorrencia_id, data_competencia')
    .not('recorrencia_id', 'is', null)
    .gte('data_competencia', de)
    .lte('data_competencia', ate);
  if (error) throw error;

  return new Set(
    (data ?? []).map((linha) => `${linha.recorrencia_id}|${linha.data_competencia}`),
  );
}
