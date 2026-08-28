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

import { diaNoMes, hoje, primeiroDiaDoMes, somarMeses, type DataISO } from '../dominio/datas';
import { faturaDeReferencia } from '../dominio/fatura';
import { idDaFatura } from './faturas';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];

/** Quantos meses para trás vale a pena acertar. Um ano é mais do que suficiente. */
const JANELA_RETROATIVA = 12;

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

  let geradas = 0;

  for (const recorrencia of recorrencias) {
    const criadaEm = (recorrencia.created_at ?? referencia).slice(0, 10);
    const vencimentos = vencimentosPendentes(criadaEm, referencia, recorrencia.dia);

    for (const competencia of vencimentos) {
      const { count, error: erroBusca } = await supabase
        .from('transacoes')
        .select('id', { count: 'exact', head: true })
        .eq('recorrencia_id', recorrencia.id)
        .eq('data_competencia', competencia);
      if (erroBusca) throw erroBusca;
      if ((count ?? 0) > 0) continue;

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
      geradas += 1;
    }
  }

  return geradas;
}

/**
 * Datas em que a recorrência já deveria ter acontecido e ainda não passou de
 * hoje. Dia 31 em fevereiro cai no último dia do mês, mesma regra do cartão.
 */
export function vencimentosPendentes(
  desde: DataISO,
  ate: DataISO,
  dia: number,
): DataISO[] {
  const primeiro = primeiroDiaDoMes(desde);
  const datas: DataISO[] = [];

  for (let i = 0; i < JANELA_RETROATIVA + 1; i += 1) {
    const mes = somarMeses(primeiro, i);
    if (mes > ate) break;

    const vencimento = diaNoMes(mes, dia);
    // Não gera antes de a recorrência existir, nem no futuro.
    if (vencimento < desde) continue;
    if (vencimento > ate) break;

    datas.push(vencimento);
  }

  return datas;
}
