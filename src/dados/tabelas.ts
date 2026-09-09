// A lista de tabelas do backup (§10.2).
//
// Mora sozinha, sem o cliente do banco junto, para que um teste possa
// compará-la com as migrations sem arrastar o Supabase para dentro do Vitest
// (§13.4). Não é preciosismo: a lista já ficou seis tabelas atrasada uma vez, e
// tabela esquecida aqui é tabela que NÃO VOLTA no restore — dívidas, aportes de
// meta e amortizações sumiriam sem nenhum erro aparecer.

/**
 * Todas as tabelas do schema, inclusive as dormentes.
 *
 * Explícita de propósito, e não derivada de nada que possa mudar em silêncio.
 * A garantia de que está completa é o teste, não a memória de quem edita.
 *
 * A ORDEM é a do restore: pai antes de filho, senão a chave estrangeira recusa
 * a linha e o backup vira um arquivo bonito que não volta.
 */
export const TABELAS = [
  // Globais e sem dependência.
  'feriados',
  'aliquotas_ir',
  'indexadores',
  'config',
  // Estrutura.
  'categorias',
  'contas',
  'cartoes',
  'faturas',
  'recorrencias',
  'dividas',
  'investimentos',
  // O que aponta para a estrutura.
  'importacoes',
  'perfis_importacao',
  'transacoes',
  'modelos',
  'memoria_descricao',
  'orcamentos',
  'metas',
  'aportes_meta',
  'metas_investimentos',
  'movimentacoes_investimento',
  'rendimentos',
  'amortizacoes_divida',
  'ocorrencias_puladas',
  'fechamentos',
  // O que a migration da idempotência removeu, guardado inteiro (§4.8). Entra
  // no backup como qualquer outra: é justamente a tabela cuja perda deixaria a
  // limpeza irreversível.
  'transacoes_removidas_por_duplicidade',
] as const;

export type Tabela = (typeof TABELAS)[number];

/** A migration mais nova que o export conhece. Vira ruído se ficar para trás. */
export const VERSAO_DO_SCHEMA = '20260902120000';
