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
  ['ocorrencias-geradas'],
  ['situacao-conta'],
  ['cartoes-com-fatura-pendente'],
  ['dividas-cartoes'],
  ['status-faturas'],
  // Meta vinculada a uma conta lê o saldo real dela (§8.8): qualquer lançamento
  // muda o "quanto já tem", e sem isto a barra de progresso só se acertava ao
  // recarregar a página.
  ['metas'],
  // A memória de autocomplete cresce a cada lançamento (§5.2).
  ['sugestoes-descricao'],
  // O histórico de lotes importados é feito de transações.
  ['importacoes'],
  ['recorrencias'],
  ['investimentos'],
  /*
    Abaixo, tudo que também nasce de transação e estava faltando.

    O comentário no topo desta lista já previa o defeito — "cada consulta nova
    precisava ser lembrada" — e ele aconteceu do mesmo jeito. O caso mais caro
    era a conferência (§5.3): registrar o ajuste criava o lançamento e a tela
    continuava mostrando a MESMA diferença, porque o saldo dela vinha de
    `saldo-ate`, que ninguém invalidava. Quem confia no que está na tela
    registra o ajuste de novo, e aí a diferença passa a existir de verdade,
    dobrada e ao contrário.
  */
  // Saldo de uma conta numa data — é o número que a conferência compara.
  ['saldo-ate'],
  // Quanto já foi pago de uma fatura, e o que sobra dela (§2.1).
  ['fatura-pago'],
  ['rotativo'],
  // A ponte entre o mês de hoje e um mês futuro, na lista de lançamentos.
  ['faturas-ponte'],
  ['pagamentos-ponte'],
  // Histórico de aportes e resgates de uma aplicação (§7.4).
  ['movimentos-investimento'],
  // Quantos lançamentos uma recorrência já gerou — a tela de exclusão mostra
  // esse número antes de perguntar o que fazer com eles.
  ['recorrencia-gerados'],
  // Parcela de dívida grava transação e mexe no contador de pagas (§4.7).
  ['dividas'],
  ['amortizacoes'],
  // As partes de uma transação dividida (§5.5).
  ['filhas-da-transacao'],
  // Quantas transações uma categoria tem, na prévia de exclusão (§4.8).
  ['categoria-previa-exclusao'],
  ['investimento-previa-exclusao'],
];
