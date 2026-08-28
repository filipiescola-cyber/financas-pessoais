// Gravação da importação de extrato (§6.5).
//
// Duas garantias que a spec exige e que moram aqui:
//
//   Nada entra sem passar pelo preview. Esta camada só recebe linhas que o
//   usuário já viu e confirmou.
//
//   Todo lote é desfazível. O registro em `importacoes` existe para isso: um
//   `importacao_id` por lote, e o botão de desfazer apaga por ele.
//
// Conciliação NÃO cria transação: preenche `fitid` e `descricao_original` na
// transação manual que já existe (§6.4). É o que impede o histórico de duplicar.

import { paraNumerico, type Centavos } from '../dominio/dinheiro';
import type { DataISO } from '../dominio/datas';
import type { LinhaDoPreview } from '../import/conciliacao';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];

export type Importacao = {
  id: string;
  contaId: string;
  nomeArquivo: string;
  formato: 'ofx' | 'csv';
  periodoInicio: DataISO | null;
  periodoFim: DataISO | null;
  totalLinhas: number;
  importadas: number;
  ignoradasDuplicadas: number;
  conciliadas: number;
  importadoEm: string;
};

/** FITIDs já gravados nesta conta. É a base da deduplicação do §6.3. */
export async function fitidsExistentes(contaId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('fitid')
    .eq('conta_id', contaId)
    .not('fitid', 'is', null);
  if (error) throw error;

  return new Set((data ?? []).map((linha) => linha.fitid).filter((f): f is string => f !== null));
}

/**
 * Lançamentos manuais candidatos à conciliação: da conta escolhida, dentro do
 * período do arquivo com folga, e ainda sem `fitid`.
 */
export async function candidatosAConciliacao(
  contaId: string,
  de: DataISO,
  ate: DataISO,
): Promise<
  { id: string; valor: Centavos; dataCaixa: DataISO; descricao: string | null; fitid: null }[]
> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('id, valor, data_caixa, descricao')
    .eq('conta_id', contaId)
    .is('fitid', null)
    // Transferência tem duas pontas e vínculo próprio; conciliar uma ponta com
    // uma linha de extrato desalinharia o par (§2.3).
    .neq('tipo', 'transferencia')
    .gte('data_caixa', de)
    .lte('data_caixa', ate);
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    valor: Math.round(Number(linha.valor) * 100),
    dataCaixa: linha.data_caixa,
    descricao: linha.descricao,
    fitid: null,
  }));
}

export type ResultadoDaImportacao = {
  importacaoId: string;
  criadas: number;
  conciliadas: number;
  ignoradas: number;
};

export async function importarLote(dados: {
  contaId: string;
  nomeArquivo: string;
  periodoInicio: DataISO | null;
  periodoFim: DataISO | null;
  linhas: LinhaDoPreview[];
  /** Categoria escolhida pelo usuário no preview, por fitid. */
  categoriaPorFitid: Record<string, string | null>;
  cartao?: { diaFechamento: number; diaVencimento: number } | null;
}): Promise<ResultadoDaImportacao> {
  const selecionadas = dados.linhas.filter((l) => l.importar);
  const paraCriar = selecionadas.filter((l) => l.situacao === 'nova');
  const paraConciliar = selecionadas.filter((l) => l.situacao === 'conciliada');

  const { data: lote, error: erroLote } = await supabase
    .from('importacoes')
    .insert({
      conta_id: dados.contaId,
      nome_arquivo: dados.nomeArquivo,
      formato: 'ofx',
      periodo_inicio: dados.periodoInicio,
      periodo_fim: dados.periodoFim,
      total_linhas: dados.linhas.length,
      importadas: paraCriar.length,
      ignoradas_duplicadas: dados.linhas.filter((l) => l.situacao === 'duplicada').length,
      conciliadas: paraConciliar.length,
    })
    .select('id')
    .single();

  if (erroLote) throw new Error(erroLote.message);

  // 1. Conciliação: não cria nada, só carimba o que já existe (§6.4).
  for (const linha of paraConciliar) {
    const candidata = linha.candidatas[0];
    if (!candidata) continue;

    const { error } = await supabase
      .from('transacoes')
      .update({
        fitid: linha.transacao.fitid,
        // descricao_original nunca sobrescreve a descrição do usuário (§3).
        descricao_original: linha.transacao.descricao,
        importacao_id: lote.id,
      })
      .eq('id', candidata.id)
      .is('fitid', null);
    if (error) throw new Error(error.message);
  }

  // 2. Novas transações.
  if (paraCriar.length > 0) {
    const novas: InsercaoTransacao[] = paraCriar.map((linha) => ({
      conta_id: dados.contaId,
      categoria_id: dados.categoriaPorFitid[linha.transacao.fitid] ?? null,
      descricao: linha.transacao.descricao || null,
      descricao_original: linha.transacao.descricao,
      valor: paraNumerico(linha.transacao.valor),
      tipo: linha.transacao.valor >= 0 ? 'receita' : 'despesa',
      data_competencia: linha.transacao.data,
      data_caixa: linha.transacao.data,
      fitid: linha.transacao.fitid,
      importacao_id: lote.id,
      origem: 'importacao',
      // Importado entra para revisão: o usuário confere categoria depois (§6.5).
      revisado: false,
    }));

    const { error } = await supabase.from('transacoes').insert(novas);
    if (error) throw new Error(error.message);
  }

  return {
    importacaoId: lote.id,
    criadas: paraCriar.length,
    conciliadas: paraConciliar.length,
    ignoradas: dados.linhas.length - selecionadas.length,
  };
}

export async function listarImportacoes(): Promise<Importacao[]> {
  const { data, error } = await supabase
    .from('importacoes')
    .select('*')
    .order('importado_em', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    contaId: linha.conta_id,
    nomeArquivo: linha.nome_arquivo,
    formato: linha.formato as 'ofx' | 'csv',
    periodoInicio: linha.periodo_inicio,
    periodoFim: linha.periodo_fim,
    totalLinhas: linha.total_linhas,
    importadas: linha.importadas,
    ignoradasDuplicadas: linha.ignoradas_duplicadas,
    conciliadas: linha.conciliadas,
    importadoEm: linha.importado_em,
  }));
}

/**
 * Desfazer importação (§6.5). "Obrigatório — vai ser usado."
 *
 * Apaga as transações criadas pelo lote e reverte a conciliação: as manuais
 * voltam a ficar sem `fitid`, prontas para casar de novo numa importação futura.
 * Sem essa reversão, desfazer deixaria o histórico num estado pior do que antes.
 */
export async function desfazerImportacao(importacaoId: string): Promise<number> {
  const { data: doLote, error } = await supabase
    .from('transacoes')
    .select('id, origem')
    .eq('importacao_id', importacaoId);
  if (error) throw error;

  const criadas = (doLote ?? []).filter((t) => t.origem === 'importacao').map((t) => t.id);
  const conciliadas = (doLote ?? []).filter((t) => t.origem !== 'importacao').map((t) => t.id);

  if (conciliadas.length > 0) {
    const { error: erroReversao } = await supabase
      .from('transacoes')
      .update({ fitid: null, descricao_original: null, importacao_id: null })
      .in('id', conciliadas);
    if (erroReversao) throw new Error(erroReversao.message);
  }

  if (criadas.length > 0) {
    const { error: erroExclusao } = await supabase.from('transacoes').delete().in('id', criadas);
    if (erroExclusao) throw new Error(erroExclusao.message);
  }

  const { error: erroLote } = await supabase.from('importacoes').delete().eq('id', importacaoId);
  if (erroLote) throw new Error(erroLote.message);

  return criadas.length + conciliadas.length;
}
