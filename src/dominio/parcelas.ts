// Parcelamento (§2.2, §13.1).
//
// A regra inteira cabe em uma frase: a soma das parcelas tem que bater com o
// total, sempre. A diferença do arredondamento vai na ÚLTIMA parcela.
// R$ 100 em 3x = 33,33 + 33,33 + 33,34.
//
// Como o app trabalha em centavos inteiros, isso é aritmética exata: não há
// arredondamento nenhum acontecendo aqui, só distribuição de resto.
//
// Vale igual para a divisão de transação (§5.5).

import type { Centavos } from './dinheiro';
import { somarMeses, type DataISO } from './datas';

export type Parcela = {
  numero: number;
  total: number;
  valor: Centavos;
  dataCompetencia: DataISO;
};

/**
 * Divide um valor em N partes cujo somatório é exatamente o valor original.
 * Funciona com valor negativo (despesa, §3) sem espalhar o resto pelo sinal.
 */
export function dividirEmParcelas(total: Centavos, quantidade: number): Centavos[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error(`Quantidade de parcelas inválida: ${quantidade}`);
  }
  if (!Number.isInteger(total)) {
    throw new Error(`Valor precisa estar em centavos inteiros: ${total}`);
  }

  const sinal = total < 0 ? -1 : 1;
  const absoluto = Math.abs(total);
  const base = Math.floor(absoluto / quantidade);
  const resto = absoluto - base * quantidade;

  const valores: Centavos[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const ehUltima = i === quantidade - 1;
    valores.push(sinal * (ehUltima ? base + resto : base));
  }
  return valores;
}

/**
 * Gera as N parcelas de uma compra, uma por mês a partir da data informada.
 * Elas nascem como transações de data futura (§13.2) e compartilham o mesmo
 * grupo_parcelamento_id, atribuído por quem grava.
 */
export function gerarParcelas(
  total: Centavos,
  quantidade: number,
  primeiraCompetencia: DataISO,
): Parcela[] {
  return dividirEmParcelas(total, quantidade).map((valor, indice) => ({
    numero: indice + 1,
    total: quantidade,
    valor,
    dataCompetencia: somarMeses(primeiraCompetencia, indice),
  }));
}

/**
 * Parcelamento já em andamento, informado no onboarding (§4.1, passo 5):
 * o usuário diz o valor da parcela e quantas faltam. Aqui não se divide nada —
 * o valor da parcela é dado, e só as restantes são geradas.
 */
export function gerarParcelasRestantes(
  valorDaParcela: Centavos,
  jaPagas: number,
  totalDeParcelas: number,
  competenciaDaProxima: DataISO,
): Parcela[] {
  if (!Number.isInteger(jaPagas) || jaPagas < 0) {
    throw new Error(`Parcelas já pagas inválido: ${jaPagas}`);
  }
  if (!Number.isInteger(totalDeParcelas) || totalDeParcelas <= jaPagas) {
    throw new Error(
      `Total de parcelas (${totalDeParcelas}) precisa ser maior que as já pagas (${jaPagas}).`,
    );
  }

  const restantes: Parcela[] = [];
  for (let numero = jaPagas + 1; numero <= totalDeParcelas; numero += 1) {
    restantes.push({
      numero,
      total: totalDeParcelas,
      valor: valorDaParcela,
      dataCompetencia: somarMeses(competenciaDaProxima, numero - jaPagas - 1),
    });
  }
  return restantes;
}
