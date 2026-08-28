// Fatura de cartão (§2.1, §4.2).
//
// Esta é a função que a Fase 2 vai usar para agrupar transações em fatura. Ela
// nasce aqui, na Fase 1, por um motivo prático: o cadastro de cartão precisa
// mostrar a prévia legível ("Compras de 05/set a 04/out entram na fatura que
// vence em 10/out"), e essa prévia é exatamente o resultado deste cálculo.
// Errar aqui é errar o app inteiro em silêncio, então ela já entra testada.
//
// Três regras, todas do §2.1 e §4.2:
//
//   1. Compra APÓS o fechamento entra na fatura do mês seguinte. Compra no dia
//      do fechamento ainda entra na fatura que fecha naquele dia.
//   2. Vencimento menor que o fechamento cai no mês seguinte ao fechamento.
//      É o caso comum: fecha dia 28, vence dia 5.
//   3. Fechamento no dia 31 vira o último dia do mês em meses mais curtos.
//
// A fatura é identificada pela data em que FECHA. "Fatura de outubro" é a que
// fecha em outubro, independente de quando vence.

import { diaNoMes, primeiroDiaDoMes, somarDias, somarMeses, type DataISO } from './datas';

export type Fatura = {
  /** Primeiro dia do mês de referência, como o banco guarda (`mes_referencia`). */
  mesReferencia: DataISO;
  dataFechamento: DataISO;
  dataVencimento: DataISO;
  /** Janela de compras que cai nesta fatura. */
  periodoInicio: DataISO;
  periodoFim: DataISO;
};

export type ConfiguracaoDoCartao = {
  diaFechamento: number;
  diaVencimento: number;
};

export function ehDiaValido(dia: number): boolean {
  return Number.isInteger(dia) && dia >= 1 && dia <= 31;
}

/** Em qual fatura cai uma compra feita nesta data. */
export function faturaDeReferencia(
  dataDaCompra: DataISO,
  { diaFechamento, diaVencimento }: ConfiguracaoDoCartao,
): Fatura {
  if (!ehDiaValido(diaFechamento) || !ehDiaValido(diaVencimento)) {
    throw new Error(
      `Dias de fechamento e vencimento precisam estar entre 1 e 31 (recebido ${diaFechamento} e ${diaVencimento}).`,
    );
  }

  const fechamentoDesteMes = diaNoMes(dataDaCompra, diaFechamento);
  // Compra depois do fechamento vai para a fatura do mês seguinte.
  const mesDaFatura =
    dataDaCompra <= fechamentoDesteMes
      ? primeiroDiaDoMes(dataDaCompra)
      : somarMeses(primeiroDiaDoMes(dataDaCompra), 1);

  return faturaDoMes(mesDaFatura, { diaFechamento, diaVencimento });
}

/** A fatura que fecha no mês indicado. */
/**
 * A fatura em que a compra cai, com o ajuste manual do usuário (§2.1).
 *
 * O app calcula pelo dia de fechamento e acerta quase sempre. Quase: compra
 * feita no próprio dia do fechamento, ou lançada pelo banco um dia depois,
 * cai na outra fatura — e o usuário é quem tem a fatura na mão para saber.
 *
 * `deslocamento` é em meses a partir da calculada: -1 é a fatura anterior, +1
 * a seguinte. Guardar o deslocamento e não a fatura escolhida mantém a regra
 * do §2.1 no comando: mudar a data da compra continua movendo a fatura junto.
 */
export function faturaEscolhida(
  dataDaCompra: DataISO,
  configuracao: ConfiguracaoDoCartao,
  deslocamento = 0,
): Fatura {
  const calculada = faturaDeReferencia(dataDaCompra, configuracao);
  if (deslocamento === 0) return calculada;
  return faturaDoMes(somarMeses(calculada.mesReferencia, deslocamento), configuracao);
}

export function faturaDoMes(
  mes: DataISO,
  { diaFechamento, diaVencimento }: ConfiguracaoDoCartao,
): Fatura {
  const mesReferencia = primeiroDiaDoMes(mes);
  const dataFechamento = diaNoMes(mesReferencia, diaFechamento);

  // Fecha dia 28 e vence dia 5: o vencimento é no mês seguinte. A comparação usa
  // os dias configurados, não as datas já ajustadas — senão fevereiro, que trunca
  // o fechamento para 28, mudaria a resposta.
  const mesesAteVencer = diaVencimento < diaFechamento ? 1 : 0;
  const dataVencimento = diaNoMes(somarMeses(mesReferencia, mesesAteVencer), diaVencimento);

  const fechamentoAnterior = diaNoMes(somarMeses(mesReferencia, -1), diaFechamento);

  return {
    mesReferencia,
    dataFechamento,
    dataVencimento,
    periodoInicio: somarDias(fechamentoAnterior, 1),
    periodoFim: dataFechamento,
  };
}

/**
 * As próximas N faturas a partir de uma data. Usado no cadastro do cartão para
 * gerar 12 meses de faturas abertas (§4.2) — o que acontece de fato na Fase 2.
 */
export function proximasFaturas(
  aPartirDe: DataISO,
  configuracao: ConfiguracaoDoCartao,
  quantidade: number,
): Fatura[] {
  const primeira = faturaDeReferencia(aPartirDe, configuracao);
  const faturas: Fatura[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    faturas.push(faturaDoMes(somarMeses(primeira.mesReferencia, i), configuracao));
  }
  return faturas;
}

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function diaEMes(data: DataISO): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${MESES_CURTOS[Number(mes) - 1]}`;
}

/**
 * A frase que o §4.2 exige na tela de cadastro. "Corta erro de cadastro pela
 * metade" — o usuário confere a regra em português em vez de deduzir dos números.
 */
export function descreverFatura(fatura: Fatura): string {
  return `Compras de ${diaEMes(fatura.periodoInicio)} a ${diaEMes(fatura.periodoFim)} entram na fatura que vence em ${diaEMes(fatura.dataVencimento)}.`;
}
