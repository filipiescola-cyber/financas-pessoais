// Chaves de cache do TanStack Query.
//
// Centralizadas porque saldo é calculado, nunca armazenado (§13.2): toda escrita
// de transação precisa invalidar a leitura de saldo. Com as chaves espalhadas
// pelas telas, alguma invalidação escapa e o usuário vê saldo velho — que num
// app financeiro é pior do que erro visível.

export const chaves = {
  contas: {
    todas: ['contas'] as const,
    lista: (incluirArquivadas: boolean) => ['contas', 'lista', incluirArquivadas] as const,
    comSaldo: ['contas', 'com-saldo'] as const,
    uma: (id: string) => ['contas', 'uma', id] as const,
  },
  cartoes: {
    todos: ['cartoes'] as const,
    lista: ['cartoes', 'lista'] as const,
  },
  categorias: {
    todas: ['categorias'] as const,
    lista: (incluirArquivadas: boolean) => ['categorias', 'lista', incluirArquivadas] as const,
  },
  config: {
    tudo: ['config'] as const,
    chave: (chave: string) => ['config', chave] as const,
  },
} as const;

/**
 * Tudo que muda quando uma transação é criada, editada ou apagada.
 *
 * Existe porque a lista feita à mão em cada tela sempre fica incompleta: cada
 * consulta nova precisava ser lembrada em nove lugares, e a que ficasse de fora
 * serviria dado velho até a página ser recarregada — sem erro, sem aviso, só um
 * número errado na tela.
 *
 * Saldo é calculado e não armazenado (§13.2), então praticamente todo número do
 * app deriva de transação. Invalidar demais custa uma consulta; invalidar de
 * menos custa confiança no número.
 */
export const DERIVADO_DE_TRANSACAO: readonly (readonly string[])[] = [
  ['transacoes'],
  ['transacoes-fatura'],
  ['saldo-abertura'],
  ['movimentos-caixa'],
  ['contas'],
  ['faturas'],
  ['fatura-total'],
  ['vencimentos'],
  ['projecao'],
  ['alertas'],
  ['orcamentos'],
  ['categorias-mais-usadas'],
  ['investimentos'],
];
