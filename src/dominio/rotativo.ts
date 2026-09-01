// Rotativo do cartão (§2.1, §4.7).
//
// Não pagar a fatura inteira não é uma fatura menor: é um empréstimo, e o mais
// caro que existe no varejo brasileiro. Enquanto o app tratava o resto como
// "fatura em aberto" sem juros, ele dizia que a dívida era o valor que sobrou —
// quando no mês seguinte ela chega maior.
//
// Errava para MENOS, que é o pior lado para errar: fazia o rotativo parecer uma
// forma barata de adiar. A regra aqui é a mesma do §4.7 para financiamento —
// só os juros são custo novo; o principal que rola já foi contado como despesa
// quando a compra aconteceu, e recontá-lo dobraria o mês.

import { taxaAnualDeMensal } from './divida';
import type { Centavos } from './dinheiro';

export type CustoDoRotativo = {
  /** O que rola para a fatura seguinte. Já foi despesa: não conta de novo. */
  principal: Centavos;
  /** Custo novo, este sim. */
  juros: Centavos;
  /** O que a próxima fatura vai cobrar por causa disto. */
  total: Centavos;
  /** A mesma taxa ao ano. É este número que costuma surpreender. */
  taxaAnual: number;
};

export function custoDoRotativo(restante: Centavos, taxaMensal: number): CustoDoRotativo {
  const principal = Math.max(0, Math.round(Math.abs(restante)));
  const taxa = Math.max(0, taxaMensal);
  const juros = Math.round(principal * taxa);

  return {
    principal,
    juros,
    total: principal + juros,
    taxaAnual: taxaAnualDeMensal(taxa),
  };
}

/**
 * Quanto a dívida vira rolando por N meses sem pagar nada.
 *
 * É o número que a fatura não mostra e que decide a escolha entre rotativo e
 * parcelamento. Não é previsão: é a conta dos juros sobre juros, que ninguém
 * faz de cabeça porque a intuição soma quando a matemática multiplica.
 */
export function rolandoPorMeses(
  restante: Centavos,
  taxaMensal: number,
  meses: number,
): Centavos {
  const principal = Math.max(0, Math.round(Math.abs(restante)));
  const taxa = Math.max(0, taxaMensal);
  if (meses <= 0) return principal;

  return Math.round(principal * (1 + taxa) ** meses);
}
