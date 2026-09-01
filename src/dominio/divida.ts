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

import { somarMeses, type DataISO } from './datas';
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
  // Parcela vezes prazo até o financiado seria juro zero ou negativo.
  if (parcela * parcelas <= principal) return null;

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
  // A busca vive em [0, 100% ao mês]. Parcela alta demais para caber nessa
  // faixa devolve null em vez de um número plausível e errado — antes havia um
  // corte arbitrário em "parcela acima de 1,5x o financiado", que recusava
  // casos legítimos de prazo curto e ainda deixava passar os impossíveis.
  if (parcelaPrice(principal, alto, parcelas) !== parcela) return null;

  return alto > 0 ? alto : null;
}

/**
 * Amortização extraordinária: dinheiro a mais, fora da parcela (§4.7).
 *
 * Ela quebra a premissa da tabela original — "o contrato mais quantas parcelas
 * foram pagas" deixa de descrever a dívida no instante em que se paga um extra.
 * Por isso é registrada como EVENTO, e a tabela passa a ser calculada em
 * segmentos: até a amortização vale o contrato, dali em diante vale um contrato
 * novo com o saldo que sobrou.
 *
 * Os dois modos, e os dois existem no Brasil:
 *
 *   PRAZO — a parcela continua a mesma e o financiamento acaba antes. Economiza
 *   mais juros, porque juros correm sobre tempo. É o que o banco chama de
 *   "reduzir prazo" e o que quase sempre compensa.
 *
 *   PARCELA — o prazo continua e a parcela cai. Alivia o mês, economiza menos.
 *
 * O número de parcelas que somem vem do BANCO, não de uma conta nossa: cada
 * instituição arredonda de um jeito, e recalcular por fora daria um cronograma
 * que não bate com o extrato — que é justamente o que este app não pode fazer.
 */
export type AmortizacaoExtra = {
  /** Depois de qual parcela ela entrou. 0 = antes da primeira. */
  aposParcela: number;
  valor: Centavos;
  modo: 'prazo' | 'parcela';
  /** Só no modo prazo: quantas parcelas sumiram, como o banco informou. */
  parcelasReduzidas: number;
};

/**
 * A tabela inteira considerando as amortizações extraordinárias.
 *
 * Sem nenhuma, devolve exatamente `tabelaDeAmortizacao` — quem não amortizou
 * não pode ver o número mudar.
 */
export function tabelaComAmortizacoes(
  principal: Centavos,
  taxaMensal: number,
  parcelas: number,
  sistema: SistemaDeAmortizacao,
  amortizacoes: readonly AmortizacaoExtra[],
): ParcelaDaDivida[] {
  if (amortizacoes.length === 0) {
    return tabelaDeAmortizacao(principal, taxaMensal, parcelas, sistema);
  }

  const ordenadas = [...amortizacoes].sort((a, b) => a.aposParcela - b.aposParcela);

  const linhas: ParcelaDaDivida[] = [];
  let saldo = principal;
  let restantes = parcelas;
  let numero = 0;
  let usadas = 0;

  // Cada volta gera o trecho até a próxima amortização e então recomeça o
  // cálculo com o saldo e o prazo novos. É o que o banco faz: refaz o contrato.
  while (restantes > 0 && saldo > 0) {
    // As amortizações que caem exatamente aqui, antes de gerar a próxima.
    while (usadas < ordenadas.length && ordenadas[usadas]!.aposParcela <= numero) {
      const extra = ordenadas[usadas]!;
      saldo = Math.max(0, saldo - Math.abs(extra.valor));

      // O saldo da última parcela gerada precisa refletir a amortização: é
      // dele que sai o "quanto ainda devo" do resumo, e sem isto amortizar o
      // saldo inteiro deixava a dívida quitada mostrando o valor de antes.
      const ultima = linhas[linhas.length - 1];
      if (ultima) ultima.saldoDevedor = saldo;

      if (extra.modo === 'prazo') {
        restantes = Math.max(0, restantes - Math.max(0, Math.trunc(extra.parcelasReduzidas)));
      }

      usadas += 1;
    }

    if (restantes <= 0 || saldo <= 0) break;

    const trecho = tabelaDeAmortizacao(saldo, taxaMensal, restantes, sistema);
    const proximaAmortizacao = ordenadas[usadas]?.aposParcela ?? Infinity;
    // Quantas parcelas cabem antes da próxima amortização.
    const quantas = Math.min(trecho.length, Math.max(0, proximaAmortizacao - numero));

    if (quantas === 0) break;

    for (let i = 0; i < quantas; i += 1) {
      const linha = trecho[i]!;
      numero += 1;
      restantes -= 1;
      saldo = linha.saldoDevedor;
      linhas.push({ ...linha, numero });
    }
  }

  return linhas;
}

/**
 * Quando a parcela N vence.
 *
 * O DIA importa e vinha sendo jogado fora: a dívida guardava a data da primeira
 * parcela e o app só usava o mês dela, para dizer em que mês a dívida acaba.
 * Quem cadastrava "primeira parcela dia 1º" não via nada acontecer no dia 1º.
 */
export function vencimentoDaParcela(primeiraParcela: DataISO, numero: number): DataISO {
  return somarMeses(primeiraParcela, Math.max(0, numero - 1));
}

/**
 * As parcelas que já venceram e ainda não foram registradas (§13.3).
 *
 * A janela retroativa existe pelo mesmo motivo da recorrência: quem cadastra
 * uma dívida antiga e esquece de informar quantas já pagou não deve receber
 * quarenta lançamentos de uma vez. O que passa da janela continua no contrato —
 * o saldo devedor sai da tabela, não dos lançamentos —, só não vira lançamento
 * retroativo sozinho.
 */
export function parcelasVencidas(
  primeiraParcela: DataISO,
  parcelas: number,
  parcelasPagas: number,
  hoje: DataISO,
  janela = 12,
): number[] {
  const pendentes: number[] = [];

  for (let numero = parcelasPagas + 1; numero <= parcelas; numero += 1) {
    const vencimento = vencimentoDaParcela(primeiraParcela, numero);
    if (vencimento > hoje) break;
    pendentes.push(numero);
  }

  return pendentes.slice(-janela);
}

export type ParcelaPrevista = {
  dividaId: string;
  nome: string;
  numero: number;
  parcelas: number;
  vencimento: DataISO;
  /** Amortização mais juros: é o que sai da conta naquele dia. */
  valor: Centavos;
};

/**
 * As parcelas que ainda vão vencer num período (§4.7, §13.2).
 *
 * A lista de lançamentos não sabia nada de dívida. Num mês futuro o saldo
 * previsto ignorava as parcelas inteiras — três empréstimos somavam quase
 * novecentos reais por mês que simplesmente não apareciam, e o mês seguinte
 * parecia bem mais folgado do que é.
 *
 * Só as NÃO pagas entram. As pagas já viraram lançamento de verdade e contam
 * pelo caminho normal; contá-las aqui de novo tiraria o valor duas vezes.
 */
export function parcelasPrevistas(
  divida: {
    id: string;
    nome: string;
    primeiraParcela: DataISO;
    parcelas: number;
    parcelasPagas: number;
  },
  tabela: readonly ParcelaDaDivida[],
  de: DataISO,
  ate: DataISO,
): ParcelaPrevista[] {
  const previstas: ParcelaPrevista[] = [];

  for (let numero = divida.parcelasPagas + 1; numero <= tabela.length; numero += 1) {
    const vencimento = vencimentoDaParcela(divida.primeiraParcela, numero);
    if (vencimento > ate) break;
    if (vencimento < de) continue;

    const parcela = tabela[numero - 1];
    if (!parcela) continue;

    previstas.push({
      dividaId: divida.id,
      nome: divida.nome,
      numero,
      parcelas: divida.parcelas,
      vencimento,
      valor: parcela.amortizacao + parcela.juros,
    });
  }

  return previstas;
}
