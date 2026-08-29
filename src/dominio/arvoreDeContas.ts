// Contas em dois níveis: principal e subcontas (§4).
//
// Caixinha do Nubank, cofrinho do Mercado Pago. São contas de verdade, com
// saldo próprio — o que muda é só onde elas aparecem na lista.
//
// O SALDO NÃO É AFETADO. Cada conta continua com o dela, e o consolidado
// continua somando todas (§13.2). Se a principal passasse a "conter" o saldo da
// subconta, ou a soma dobraria, ou o saldo da conta corrente mentiria sobre
// quanto está de fato lá.

export type ContaDaArvore = {
  id: string;
  contaPaiId: string | null;
};

export type NoDaArvore<T> = { conta: T; subcontas: T[] };

/**
 * Organiza a lista plana em principais com suas subcontas.
 *
 * A ordem das principais é a que chegou — a consulta já ordena por nome, e
 * reordenar aqui seria decidir duas vezes a mesma coisa.
 *
 * Subconta cuja principal não está na lista sobe para o topo em vez de sumir.
 * Acontece quando a principal foi filtrada, arquivada ou encerrada: some da
 * lista, e o filho ficaria órfão — invisível, com saldo entrando na soma. Erro
 * que não dá erro é o pior tipo, e este módulo existe para não criar um.
 */
export function agruparEmArvore<T extends ContaDaArvore>(contas: readonly T[]): NoDaArvore<T>[] {
  const presentes = new Set(contas.map((c) => c.id));

  const filhosDe = new Map<string, T[]>();
  for (const conta of contas) {
    if (conta.contaPaiId === null || !presentes.has(conta.contaPaiId)) continue;
    filhosDe.set(conta.contaPaiId, [...(filhosDe.get(conta.contaPaiId) ?? []), conta]);
  }

  return contas
    .filter((conta) => conta.contaPaiId === null || !presentes.has(conta.contaPaiId))
    .map((conta) => ({ conta, subcontas: filhosDe.get(conta.id) ?? [] }));
}

/**
 * As contas que podem receber uma subconta.
 *
 * Fica de fora quem já é subconta (a lista mostra um nível só), a própria conta
 * sendo editada, e quem já tem filhos não pode virar filho — as três regras que
 * o gatilho do banco também impõe. Aqui elas existem para a tela não oferecer
 * uma escolha que o banco vai recusar.
 */
export function principaisPossiveis<T extends ContaDaArvore>(
  contas: readonly T[],
  contaEditadaId: string | null,
): T[] {
  const temSubcontas = (id: string) => contas.some((c) => c.contaPaiId === id);

  // Quem já tem subcontas não pode virar subconta de ninguém: daria o terceiro
  // nível, que a lista não desenha. Nesse caso não há escolha a oferecer.
  if (contaEditadaId !== null && temSubcontas(contaEditadaId)) return [];

  return contas.filter((c) => c.contaPaiId === null && c.id !== contaEditadaId);
}
