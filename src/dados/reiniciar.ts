// Recomeçar do zero.
//
// Apaga os SEUS dados e preserva os dados de referência. A diferença importa:
//
//   Some: contas, cartões, faturas, lançamentos, recorrências, modelos,
//   memória de autocomplete, orçamentos, metas, investimentos e importações.
//
//   Fica: categorias, tabela de IR, feriados e taxas. São dados de referência —
//   apagar as categorias deixaria o app sem o conjunto padrão, que só é
//   recriado por migration, e você teria que cadastrar as 25 na mão.
//
// A ordem das exclusões não é estética: o banco tem ON DELETE RESTRICT nas
// chaves de conta e categoria (§4.8), então apagar na ordem errada é recusado
// pela metade e deixa o banco num estado pior do que estava.

import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

// O nome da tabela precisa ser literal: é assim que o cliente tipado impede
// apagar uma tabela que não existe por causa de um erro de digitação.
type Tabela = keyof Database['public']['Tables'];

export type ResultadoDaReinicializacao = {
  tabelasLimpas: Tabela[];
};

/**
 * Nem toda tabela tem coluna `id`: `cartoes` é identificada por `conta_id`.
 * O filtro precisa nomear a chave certa — filtrar por uma coluna inexistente
 * falharia NO MEIO da limpeza, deixando o banco pela metade.
 */
const CHAVE_DA_TABELA: Partial<Record<Tabela, string>> = {
  cartoes: 'conta_id',
};

/** PostgREST recusa DELETE sem filtro; "chave não é nula" é o filtro que pega tudo. */
async function limpar(tabela: Tabela): Promise<void> {
  const chave = CHAVE_DA_TABELA[tabela] ?? 'id';
  const { error } = await supabase.from(tabela).delete().not(chave, 'is', null);
  if (error) throw new Error(`Falha ao limpar ${tabela}: ${error.message}`);
}

export async function recomecarDoZero(): Promise<ResultadoDaReinicializacao> {
  const limpas: Tabela[] = [];

  // 1. Investimentos primeiro: rendimentos e movimentações apontam para eles,
  //    e as movimentações apontam também para transações.
  const investimentos: Tabela[] = ['rendimentos', 'movimentacoes_investimento', 'investimentos'];
  for (const tabela of investimentos) {
    await limpar(tabela);
    limpas.push(tabela);
  }

  // 2. Quebra o ciclo entre fatura e transação antes de apagar qualquer uma das
  //    duas: a fatura aponta para a transação do pagamento, e a transação
  //    aponta de volta para a fatura.
  const { error: erroCiclo } = await supabase
    .from('faturas')
    .update({ transacao_pagamento_id: null })
    .not('id', 'is', null);
  if (erroCiclo) throw new Error(`Falha ao desfazer o vínculo de pagamento: ${erroCiclo.message}`);

  // 3. Transações antes de tudo que elas referenciam. As filhas de divisão saem
  //    junto por cascata, e o par de transferência por SET NULL.
  await limpar('transacoes');
  limpas.push('transacoes');

  // 4. Agora o que as transações referenciavam.
  const dependentes: Tabela[] = [
    'faturas',
    'cartoes',
    'importacoes',
    'perfis_importacao',
    'recorrencias',
    'modelos',
    'memoria_descricao',
    'orcamentos',
    'metas',
  ];
  for (const tabela of dependentes) {
    await limpar(tabela);
    limpas.push(tabela);
  }

  // 5. Contas por último: praticamente tudo aponta para elas.
  await limpar('contas');
  limpas.push('contas');

  // 6. Config volta ao estado de app recém-instalado, para o onboarding
  //    reaparecer. As sementes de renda e a marca da última execução das
  //    rotinas somem junto — elas descrevem dados que não existem mais.
  const { error: erroConfig } = await supabase
    .from('config')
    .delete()
    .in('chave', ['sementes_renda', 'ultima_execucao_rotinas']);
  if (erroConfig) throw new Error(`Falha ao limpar a configuração: ${erroConfig.message}`);

  const { error: erroOnboarding } = await supabase.from('config').upsert(
    {
      chave: 'onboarding_status',
      valor: { concluido: false, passoAtual: 'carteira', pulados: [] },
    },
    { onConflict: 'usuario_id,chave' },
  );
  if (erroOnboarding) throw new Error(`Falha ao reiniciar o onboarding: ${erroOnboarding.message}`);

  limpas.push('config');

  // 7. O que mora no navegador: fila offline, última conta usada e a preferência
  //    de modo privado. Deixar a fila para trás faria lançamentos de um app que
  //    já não existe subirem depois.
  try {
    localStorage.removeItem('fila-de-sincronizacao');
    localStorage.removeItem('ultima-conta');
    localStorage.removeItem('modo-privado');
  } catch {
    // Armazenamento bloqueado. O banco já está limpo, que é o que importa.
  }

  return { tabelasLimpas: limpas };
}
