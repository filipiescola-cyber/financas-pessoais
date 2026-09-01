// Os passos do fechamento mensal (§8.7).
//
// "Ritual de 10 minutos, uma vez por mês. É o que mantém o app vivo depois que
// o entusiasmo inicial passa."
//
// A lista mora aqui, e não na tela, porque duas perguntas dependem dela e as
// duas erram silenciosamente se as respostas divergirem: "este mês está
// fechado?" e "quantos passos faltam?". Enquanto a lista era um punhado de
// strings soltas no meio do JSX, a segunda pergunta era respondida por um
// `feitos.size >= 4` escrito à mão — que continuava dizendo "concluído" depois
// de um passo novo ser acrescentado.

export type IdDoPasso =
  | 'conferencia'
  | 'categorias'
  | 'recorrencias'
  | 'resumo'
  | 'orcamento'
  | 'backup';

export const PASSOS: readonly IdDoPasso[] = [
  'conferencia',
  'categorias',
  'recorrencias',
  'resumo',
  'orcamento',
  'backup',
];

/**
 * O que os DADOS já resolvem sozinhos.
 *
 * Três passos são perguntas sobre o estado, não sobre a vontade de alguém: não
 * há conta por conferir, não há lançamento sem categoria, não há recorrência
 * que faltou. Guardar a resposta deles criaria o mesmo fato em dois lugares
 * (§13.2), e o guardado ficaria para trás no instante em que um lançamento
 * fosse recategorizado.
 *
 * Os outros três são atos: olhar o resumo, preparar o mês novo, baixar o
 * backup. Esses só uma pessoa pode dar por feitos.
 */
export type PendenciasDoMes = {
  contasPorConferir: number;
  lancamentosSemCategoria: number;
  recorrenciasQueFaltaram: number;
};

export function passoResolvidoPelosDados(
  passo: IdDoPasso,
  pendencias: PendenciasDoMes,
): boolean {
  if (passo === 'conferencia') return pendencias.contasPorConferir === 0;
  if (passo === 'categorias') return pendencias.lancamentosSemCategoria === 0;
  if (passo === 'recorrencias') return pendencias.recorrenciasQueFaltaram === 0;
  return false;
}

export function passoEstaFeito(
  passo: IdDoPasso,
  marcados: ReadonlySet<string>,
  pendencias: PendenciasDoMes,
): boolean {
  return marcados.has(passo) || passoResolvidoPelosDados(passo, pendencias);
}

export type ProgressoDoFechamento = {
  feitos: number;
  total: number;
  concluido: boolean;
  /** O primeiro que falta. É para onde a tela deve levar quem voltou. */
  proximo: IdDoPasso | null;
};

export function progressoDoFechamento(
  marcados: ReadonlySet<string>,
  pendencias: PendenciasDoMes,
): ProgressoDoFechamento {
  const feitos = PASSOS.filter((passo) => passoEstaFeito(passo, marcados, pendencias));
  const proximo = PASSOS.find((passo) => !passoEstaFeito(passo, marcados, pendencias)) ?? null;

  return {
    feitos: feitos.length,
    total: PASSOS.length,
    concluido: feitos.length === PASSOS.length,
    proximo,
  };
}

/**
 * O que era para ter saído do caixa no mês e não saiu (§8.6, §2.4).
 *
 * O corte é pelo CAIXA, não pela competência, e a diferença aparece toda no
 * cartão: a assinatura cobrada em 10/08 não é conta esquecida em agosto — ela
 * entra na fatura que vence em setembro, e dinheiro nenhum devia ter saído no
 * mês que se está fechando. Listá-la aqui manda procurar um problema que não
 * existe, e ainda por cima justamente no passo cujo valor é apontar o que
 * existe.
 */
export function faltaramNoMes<T extends { situacao: string; dataCaixa: string }>(
  previstos: readonly T[],
  fimDoMes: string,
): T[] {
  return previstos.filter(
    (item) => item.situacao === 'atrasado' && item.dataCaixa <= fimDoMes,
  );
}
