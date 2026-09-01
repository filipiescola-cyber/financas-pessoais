// Investimento que tem quantidade e preço (§7.1, §7.4).
//
// Renda variável não tem fórmula de rendimento: o valor depende de cotação, e o
// app não busca cotação (§9.6 — nenhuma API pode virar caminho crítico). Até
// aqui isso virava um saldo digitado à mão, que não dizia de onde veio: não dava
// para saber quantas unidades são, por quanto foram adquiridas, nem quanto do
// valor é ganho.
//
// Com quantidade e preço as três perguntas se respondem, e o preço mensal
// informado é tão estimativa quanto o CDI de ontem — o §7.3 já diz que valor
// calculado é estimativa até ser conferido. A honestidade está em mostrar a
// data da cotação, não em ter o número de hoje.
//
// A moeda não é multi-moeda (§8.9): o razão continua inteiro em reais, e o
// dólar vive só aqui, na conversão de unidade.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

/**
 * Como a unidade entrou na posição. É a distinção que decide o que a venda
 * vira, e ela não é cosmética.
 *
 *   compra      — saiu dinheiro de uma conta. A venda devolve o que saiu.
 *   recebimento — ação da empresa, bonificação. Dinheiro nenhum saiu de lugar
 *                 nenhum, então a venda inteira é dinheiro novo.
 */
export type OrigemDaUnidade = 'compra' | 'recebimento';

export type MovimentoDeUnidade = {
  data: DataISO;
  /** Positiva entrando, positiva saindo — o tipo diz a direção. */
  quantidade: number;
  /** Preço por unidade no dia, na moeda do ativo. */
  preco: number;
  /** Quantos reais valia uma unidade da moeda no dia. 1 quando é real. */
  cambio: number;
  tipo: 'entrada' | 'saida';
  origem: OrigemDaUnidade;
};

/** Quantidade × preço × câmbio, em centavos. Arredonda uma vez só. */
export function valorEmReais(quantidade: number, preco: number, cambio: number): Centavos {
  return Math.round(quantidade * preco * cambio * 100);
}

export type PosicaoPorCotacao = {
  quantidade: number;
  /** O que custou, somando tudo que entrou — inclusive o que não custou caixa. */
  custoTotal: Centavos;
  /** A parte do custo que saiu de uma conta de verdade. */
  custoEmCaixa: Centavos;
  /** Quantidade × última cotação conhecida. */
  valorAtual: Centavos;
  /** O que ainda não foi realizado. Negativo quando o ativo caiu. */
  ganhoNaoRealizado: Centavos;
};

/**
 * A posição hoje, a partir dos movimentos.
 *
 * O custo sai por MÉDIA, que é a convenção brasileira para ação e a única que
 * não obriga a escolher qual lote foi vendido. Vender reduz o custo na mesma
 * proporção da quantidade: quem vende um terço leva um terço do custo.
 *
 * Nada disso é guardado (§13.2). Guardar quantidade numa coluna criaria o mesmo
 * fato em dois lugares, e o segundo ficaria para trás na primeira correção de
 * um recebimento antigo.
 */
export function posicaoPorCotacao(
  movimentos: readonly MovimentoDeUnidade[],
  precoAtual: number | null,
  cambioAtual: number | null,
): PosicaoPorCotacao {
  let quantidade = 0;
  let custoTotal = 0;
  let custoEmCaixa = 0;

  const ordenados = [...movimentos].sort((a, b) => a.data.localeCompare(b.data));

  for (const movimento of ordenados) {
    if (movimento.tipo === 'entrada') {
      const custo = valorEmReais(movimento.quantidade, movimento.preco, movimento.cambio);
      quantidade += movimento.quantidade;
      custoTotal += custo;
      if (movimento.origem === 'compra') custoEmCaixa += custo;
      continue;
    }

    // Venda: leva a mesma fração do custo que levou da quantidade.
    if (quantidade <= 0) continue;
    const fracaoQueSai = Math.min(1, movimento.quantidade / quantidade);

    custoTotal -= Math.round(custoTotal * fracaoQueSai);
    custoEmCaixa -= Math.round(custoEmCaixa * fracaoQueSai);
    quantidade = Math.max(0, quantidade - movimento.quantidade);
  }

  // Sem cotação informada, o valor de hoje é o custo: é o último número que
  // alguém realmente afirmou. Fingir zero seria pior, e inventar outro também.
  const valorAtual =
    precoAtual === null || cambioAtual === null
      ? custoTotal
      : valorEmReais(quantidade, precoAtual, cambioAtual);

  return {
    quantidade,
    custoTotal,
    custoEmCaixa,
    valorAtual,
    ganhoNaoRealizado: valorAtual - custoTotal,
  };
}

export type ContasDaVenda = {
  /** Quanto entra na conta. */
  bruto: Centavos;
  /** Devolução do que saiu do caixa um dia: transferência, não receita (§7.4). */
  devolucaoDeCaixa: Centavos;
  /** O que foi recebido e nunca passou pelo caixa. Vira renda ao ser vendido. */
  remuneracao: Centavos;
  /** O que o ativo rendeu além do custo. Negativo quando deu prejuízo. */
  ganho: Centavos;
};

/**
 * O que a venda vira em lançamento (§7.4, §2.7).
 *
 * Três destinos porque são três naturezas diferentes, e somá-las num só número
 * apagaria a única informação que decide o que fazer com o dinheiro:
 *
 *   Ação COMPRADA devolve o que você pagou — transferência, o dinheiro só
 *   voltou de onde saiu. Só o que passou disso é receita.
 *
 *   Ação RECEBIDA nunca teve contrapartida em caixa: a venda inteira é dinheiro
 *   novo. E não era receita antes, no recebimento, porque não dava para gastar
 *   (§2.7) — é agora que ela entra.
 *
 * O ganho sai da média, e a média é justamente o que impede escolher o lote que
 * dá o melhor número.
 */
export function contasDaVenda(
  posicao: PosicaoPorCotacao,
  quantidadeVendida: number,
  preco: number,
  cambio: number,
): ContasDaVenda {
  const fracao =
    posicao.quantidade <= 0 ? 0 : Math.min(1, quantidadeVendida / posicao.quantidade);

  const bruto = valorEmReais(quantidadeVendida, preco, cambio);
  const custoQueSai = Math.round(posicao.custoTotal * fracao);
  const devolucaoDeCaixa = Math.round(posicao.custoEmCaixa * fracao);

  return {
    bruto,
    devolucaoDeCaixa,
    remuneracao: custoQueSai - devolucaoDeCaixa,
    ganho: bruto - custoQueSai,
  };
}
