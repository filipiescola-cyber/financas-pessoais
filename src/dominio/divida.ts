// Financiamentos e empréstimos (§4.7).
//
// A diferença entre modelar dívida com e sem juros não é preciosismo. Num
// financiamento de imóvel de 30 anos, tratar a parcela inteira como abatimento
// erra o saldo devedor em centenas de milhares de reais — e erra para menos,
// que é o pior sentido: o app diria que você está quase quitando quando ainda
// falta metade.
//
// Os dois sistemas usados no Brasil:
//
//   PRICE — a parcela é constante. No começo quase tudo é juros; a amortização
//   cresce mês a mês. É o do crédito pessoal, do carro e do consignado.
//
//   SAC — a amortização é constante e a parcela CAI ao longo do tempo, porque
//   os juros incidem sobre um saldo cada vez menor. É o padrão do
//   financiamento imobiliário, e paga menos juros no total.
//
// O saldo devedor NÃO é armazenado (§13.2): ele é a tabela mais quantas
// parcelas já foram pagas. Guardá-lo criaria a mesma armadilha de sempre — o
// mesmo fato em dois lugares, e um deles ficando para trás.

import type { Centavos } from './dinheiro';

export type SistemaDeAmortizacao = 'price' | 'sac';

export type ParcelaDaDivida = {
  numero: number;
  juros: Centavos;
  amortizacao: Centavos;
  /** Juros mais amortização. Constante no Price, decrescente no SAC. */
  valor: Centavos;
  /** O que ainda se deve DEPOIS de pagar esta parcela. */
  saldoDevedor: Centavos;
};

/** 12% ao ano não é 1% ao mês: juros compõem. */
export function taxaMensalDeAnual(taxaAnual: number): number {
  return (1 + taxaAnual) ** (1 / 12) - 1;
}

export function taxaAnualDeMensal(taxaMensal: number): number {
  return (1 + taxaMensal) ** 12 - 1;
}

/** A parcela fixa do sistema Price. Com taxa zero, é a divisão simples. */
export function parcelaPrice(principal: Centavos, taxaMensal: number, parcelas: number): Centavos {
  if (parcelas <= 0) return 0;
  if (taxaMensal <= 0) return Math.round(principal / parcelas);

  const fator = taxaMensal / (1 - (1 + taxaMensal) ** -parcelas);
  return Math.round(principal * fator);
}

/**
 * A tabela inteira, parcela a parcela.
 *
 * A última parcela absorve o resto do arredondamento, para a soma das
 * amortizações bater EXATAMENTE com o valor financiado — mesma regra do
 * parcelamento de cartão (§13.1). Sem isso a dívida terminaria devendo três
 * centavos, para sempre.
 */
export function tabelaDeAmortizacao(
  principal: Centavos,
  taxaMensal: number,
  parcelas: number,
  sistema: SistemaDeAmortizacao,
): ParcelaDaDivida[] {
  if (principal <= 0 || parcelas <= 0) return [];

  const taxa = Math.max(0, taxaMensal);
  const fixaDoPrice = sistema === 'price' ? parcelaPrice(principal, taxa, parcelas) : 0;
  const amortizacaoDoSac = Math.floor(principal / parcelas);

  const linhas: ParcelaDaDivida[] = [];
  let saldo = principal;

  for (let numero = 1; numero <= parcelas; numero += 1) {
    const juros = Math.round(saldo * taxa);
    const ultima = numero === parcelas;

    const amortizacao = ultima
      ? saldo
      : sistema === 'price'
        ? Math.max(0, fixaDoPrice - juros)
        : amortizacaoDoSac;

    saldo -= amortizacao;

    linhas.push({
      numero,
      juros,
      amortizacao,
      valor: juros + amortizacao,
      saldoDevedor: saldo,
    });
  }

  return linhas;
}

export type ResumoDaDivida = {
  saldoDevedor: Centavos;
  parcelasPagas: number;
  parcelasRestantes: number;
  jurosJaPagos: Centavos;
  jurosAindaAPagar: Centavos;
  /** Soma das parcelas que faltam. */
  totalAindaAPagar: Centavos;
  /** A próxima a vencer, ou null quando a dívida está quitada. */
  proxima: ParcelaDaDivida | null;
};

export function resumoDaDivida(
  tabela: readonly ParcelaDaDivida[],
  parcelasPagas: number,
): ResumoDaDivida {
  const pagas = Math.min(Math.max(0, Math.trunc(parcelasPagas)), tabela.length);
  const quitadas = tabela.slice(0, pagas);
  const faltando = tabela.slice(pagas);

  const somar = (linhas: readonly ParcelaDaDivida[], campo: 'juros' | 'valor' | 'amortizacao') =>
    linhas.reduce((total, linha) => total + linha[campo], 0);

  return {
    saldoDevedor: pagas === 0 ? somar(tabela, 'amortizacao') : (tabela[pagas - 1]?.saldoDevedor ?? 0),
    parcelasPagas: pagas,
    parcelasRestantes: faltando.length,
    jurosJaPagos: somar(quitadas, 'juros'),
    jurosAindaAPagar: somar(faltando, 'juros'),
    totalAindaAPagar: somar(faltando, 'valor'),
    proxima: faltando[0] ?? null,
  };
}

/**
 * A taxa que ninguém sabe de cabeça, deduzida do que todo mundo sabe.
 *
 * O banco informa o valor financiado, o número de parcelas e quanto se paga por
 * mês; a taxa fica no contrato. Como a fórmula do Price não se inverte em
 * álgebra, a busca é por bisseção — e ela é monótona, então converge sempre.
 *
 * Devolve null quando não existe taxa possível: parcela vezes prazo menor ou
 * igual ao financiado significa juro zero ou negativo, e um número inventado
 * aqui contaminaria o saldo devedor inteiro (§13.5).
 */
export function taxaImplicita(
  principal: Centavos,
  parcela: Centavos,
  parcelas: number,
): number | null {
  if (principal <= 0 || parcela <= 0 || parcelas <= 0) return null;
  if (parcela * parcelas <= principal) return null;
  // Acima de 100% ao mês não é financiamento, é erro de digitação.
  if (parcela > principal * 1.5) return null;

  let baixo = 0;
  let alto = 1;

  for (let i = 0; i < 200; i += 1) {
    const meio = (baixo + alto) / 2;
    if (parcelaPrice(principal, meio, parcelas) < parcela) baixo = meio;
    else alto = meio;
  }

  // Devolve o lado ALTO, não o ponto médio. `alto` é mantido como a menor taxa
  // cuja parcela já alcança a informada, então recalcular a parcela com ela dá
  // exatamente o número que o usuário digitou. O ponto médio pode cair um
  // centavo abaixo — e um centavo de diferença aqui vira dezenas de reais de
  // saldo devedor errado ao longo de 360 parcelas.
  return alto > 0 ? alto : null;
}
