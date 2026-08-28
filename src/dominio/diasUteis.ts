// Dias úteis (§7.1).
//
// Renda fixa no Brasil usa a convenção de 252 dias úteis por ano. Rendimento só
// corre em dia útil: sábado, domingo e feriado não rendem.
//
// O §12 manda resolver isto ANTES do cálculo, e o motivo é direto: sem o
// calendário de feriados o rendimento erra cerca de 10 dias por ano — pouco por
// dia, muito no acumulado, e sempre para mais, o que é o pior sentido do erro.

import { somarDias, type DataISO } from './datas';

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
