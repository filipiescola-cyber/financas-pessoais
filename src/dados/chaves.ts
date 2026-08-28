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
