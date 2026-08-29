// Dias úteis (§7.1).
//
// Renda fixa no Brasil usa a convenção de 252 dias úteis por ano. Rendimento só
// corre em dia útil: sábado, domingo e feriado não rendem.
//
// O §12 manda resolver isto ANTES do cálculo, e o motivo é direto: sem o
// calendário de feriados o rendimento erra cerca de 10 dias por ano — pouco por
// dia, muito no acumulado, e sempre para mais, o que é o pior sentido do erro.

import { primeiroDiaDoMes, somarDias, ultimoDiaDoMes, type DataISO } from './datas';

/** Convenção do mercado brasileiro para renda fixa. */
export const DIAS_UTEIS_NO_ANO = 252;

export type Feriados = ReadonlySet<DataISO>;

export function ehFimDeSemana(data: DataISO): boolean {
  const [ano, mes, dia] = data.split('-').map(Number);
  // Date.UTC é só calendário aqui: sem fuso envolvido (§13.1).
  const diaDaSemana = new Date(Date.UTC(ano!, mes! - 1, dia!)).getUTCDay();
  return diaDaSemana === 0 || diaDaSemana === 6;
}

export function ehDiaUtil(data: DataISO, feriados: Feriados): boolean {
  return !ehFimDeSemana(data) && !feriados.has(data);
}

/**
 * Dias úteis entre duas datas, contando o fim e não o começo.
 *
 * A aplicação feita hoje não rende hoje: ela rende a partir do próximo dia
 * útil. Contar os dois extremos daria um dia a mais de rendimento em toda
 * aplicação do app.
 */
export function diasUteisEntre(inicio: DataISO, fim: DataISO, feriados: Feriados): number {
  if (fim <= inicio) return 0;

  let contador = 0;
  let atual = somarDias(inicio, 1);

  // Trava de segurança: sem ela um erro de data vira laço infinito na tela.
  let voltas = 0;
  while (atual <= fim && voltas < 20_000) {
    if (ehDiaUtil(atual, feriados)) contador += 1;
    atual = somarDias(atual, 1);
    voltas += 1;
  }

  return contador;
}

/** Dias corridos entre duas datas. É o que a tabela de IR e a de IOF usam. */
export function diasCorridosEntre(inicio: DataISO, fim: DataISO): number {
  const [anoI, mesI, diaI] = inicio.split('-').map(Number);
  const [anoF, mesF, diaF] = fim.split('-').map(Number);
  const umDia = 86_400_000;
  return Math.max(
    0,
    Math.round(
      (Date.UTC(anoF!, mesF! - 1, diaF!) - Date.UTC(anoI!, mesI! - 1, diaI!)) / umDia,
    ),
  );
}

/** Todos os dias úteis do mês, em ordem. */
export function diasUteisDoMes(mes: DataISO, feriados: Feriados): DataISO[] {
  const ultimo = ultimoDiaDoMes(mes);
  const uteis: DataISO[] = [];

  for (let dia = primeiroDiaDoMes(mes); dia <= ultimo; dia = somarDias(dia, 1)) {
    if (ehDiaUtil(dia, feriados)) uteis.push(dia);
  }

  return uteis;
}

/**
 * O n-ésimo dia útil do mês, contado do começo ou do fim (§5.2).
 *
 * Existe porque "todo dia 5" e "no 5º dia útil" são coisas diferentes, e a
 * segunda é como a maior parte dos salários e dos boletos de empresa funciona.
 * Sem isto, quem recebe no 5º dia útil cadastrava "dia 7" e via a previsão
 * errar em todo mês cujo 7 caísse num sábado.
 *
 * `'fim'` conta para trás: ordinal 1 é o último dia útil do mês, 3 é o
 * antepenúltimo. É como se fala de aluguel e de fechamento de folha.
 *
 * Ordinal maior do que o mês comporta cai no último dia útil daquele lado —
 * mesma regra do "dia 31 em fevereiro" do resto do app. Um mês tem no máximo
 * 23 dias úteis, então isso só acontece com entrada fora de faixa.
 *
 * O calendário vem da tabela `feriados` (§9.2), a mesma que o rendimento usa:
 * um app, um calendário. Com a tabela vazia sobra o fim de semana, que é a
 * mesma degradação que o cálculo de investimento já aceita.
 */
export function diaUtilDoMes(
  mes: DataISO,
  ordinal: number,
  contadoDo: 'inicio' | 'fim',
  feriados: Feriados,
): DataISO {
  const uteis = diasUteisDoMes(mes, feriados);
  const posicao = Math.min(Math.max(ordinal, 1), uteis.length);

  return contadoDo === 'inicio' ? uteis[posicao - 1]! : uteis[uteis.length - posicao]!;
}
