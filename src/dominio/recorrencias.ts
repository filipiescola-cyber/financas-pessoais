// Calendário de recorrência (§5.2, §13.3).
//
// Mora no domínio, não na camada de dados, porque é função pura — e porque o
// teste dela não pode arrastar o cliente do banco junto. O cliente Supabase
// lança erro ao ser carregado sem as variáveis de ambiente, o que fazia o
// arquivo de teste inteiro falhar em qualquer máquina sem `.env`.

import { diaNoMes, primeiroDiaDoMes, somarMeses, type DataISO } from './datas';
import { diaUtilDoMes, type Feriados } from './diasUteis';

/**
 * Como o dia do mês é escolhido.
 *
 *   fixo           — dia 10, dia 28. O `dia` é a data do calendário.
 *   dia_util       — 5º dia útil. O `dia` vira ORDINAL, contado do começo.
 *   dia_util_do_fim— 3º dia útil antes do fim. Ordinal contado de trás.
 *
 * O campo `dia` serve aos três de propósito: é sempre "o quanto", e o que muda
 * é de onde se conta. Uma coluna a mais para o ordinal criaria duas fontes para
 * o mesmo fato, e uma delas ia ficar para trás.
 */
export type RegraDoDia = 'fixo' | 'dia_util' | 'dia_util_do_fim';

/**
 * A data em que a recorrência cai naquele mês.
 *
 * `feriados` é o calendário da tabela (§9.2), o mesmo do rendimento. Vazio,
 * sobra o fim de semana — a regra continua funcionando, só fica um dia otimista
 * nos meses com feriado.
 */
export function dataDaOcorrencia(
  mes: DataISO,
  dia: number,
  regra: RegraDoDia,
  feriados: Feriados,
): DataISO {
  if (regra === 'fixo') return diaNoMes(mes, dia);
  return diaUtilDoMes(mes, dia, regra === 'dia_util' ? 'inicio' : 'fim', feriados);
}

/** Os três campos que respondem "quando", juntos porque nunca viajam sozinhos. */
export type Agenda = {
  dia: number;
  regra: RegraDoDia;
  /** Prazo: a data da última ocorrência. `null` quando não tem fim. */
  terminaEm: DataISO | null;
};

/**
 * Ocorrências que o usuário apagou de propósito (§13.3).
 *
 * A idempotência da geração se apoia na EXISTÊNCIA da transação: sem esta
 * lista, apagar um lançamento gerado não adianta nada — a próxima abertura
 * conclui que a ocorrência falta e a cria de novo, e a única saída fica sendo
 * arquivar a recorrência inteira, perdendo os outros meses junto.
 */
export type Puladas = ReadonlySet<string>;

/** A mesma chave da geração: recorrência mais competência. */
export function chaveDaOcorrencia(recorrenciaId: string, data: DataISO): string {
  return `${recorrenciaId}|${data}`;
}

const ORDINAIS = ['', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];

function ordinal(n: number): string {
  return ORDINAIS[n] ?? `${n}º`;
}

/** Como a regra se lê numa lista. */
export function rotuloDoDia(dia: number, regra: RegraDoDia): string {
  if (regra === 'fixo') return `todo dia ${dia}`;
  if (regra === 'dia_util') return `${ordinal(dia)} dia útil`;
  return dia === 1 ? 'último dia útil' : `${ordinal(dia)} dia útil antes do fim`;
}

/** A primeira ocorrência em `desde` ou depois. */
export function proximaOcorrencia(
  desde: DataISO,
  dia: number,
  regra: RegraDoDia,
  feriados: Feriados,
): DataISO {
  const mes = primeiroDiaDoMes(desde);
  const neste = dataDaOcorrencia(mes, dia, regra, feriados);
  return neste >= desde ? neste : dataDaOcorrencia(somarMeses(mes, 1), dia, regra, feriados);
}

/**
 * A data da última parcela, dado um número de repetições.
 *
 * O banco guarda só o TÉRMINO, nunca a contagem: "36x" e "até dez/2028" são a
 * mesma informação dita de dois jeitos, e guardar as duas colocaria o app na
 * situação que já quebrou meia dúzia de coisas aqui — o mesmo fato em dois
 * lugares, com um deles ficando para trás. A contagem se recupera da data
 * quando alguém quiser vê-la assim.
 */
export function terminoParaRepeticoes(
  desde: DataISO,
  dia: number,
  regra: RegraDoDia,
  repeticoes: number,
  feriados: Feriados,
): DataISO {
  const primeira = proximaOcorrencia(desde, dia, regra, feriados);
  const quantas = Math.max(1, Math.trunc(repeticoes));
  return dataDaOcorrencia(
    somarMeses(primeiroDiaDoMes(primeira), quantas - 1),
    dia,
    regra,
    feriados,
  );
}

/** Quantas ocorrências ainda faltam, de `de` até o término, inclusive. */
export function repeticoesRestantes(
  de: DataISO,
  terminaEm: DataISO,
  dia: number,
  regra: RegraDoDia,
  feriados: Feriados,
): number {
  let total = 0;

  for (let mes = primeiroDiaDoMes(de); mes <= terminaEm; mes = somarMeses(mes, 1)) {
    const data = dataDaOcorrencia(mes, dia, regra, feriados);
    if (data >= de && data <= terminaEm) total += 1;
  }

  return total;
}

/**
 * Quantos meses para trás vale a pena acertar.
 *
 * Existe para o caso da recorrência antiga e abandonada: sem limite, reativar
 * uma de dois anos atrás despejaria dois anos de lançamentos de uma vez.
 */
export const JANELA_RETROATIVA = 12;

/**
 * Datas em que a recorrência já deveria ter acontecido e ainda não passou de
 * hoje. Dia 31 em fevereiro cai no último dia do mês, mesma regra do cartão.
 *
 * `terminaEm` é o prazo: depois dele a recorrência não gera mais nada. É o que
 * faz o financiamento de 36x parar sozinho na 36ª — sem ninguém precisar
 * lembrar de arquivar a recorrência no mês certo.
 */
export function vencimentosPendentes(
  desde: DataISO,
  ate: DataISO,
  agenda: Agenda,
  feriados: Feriados,
): DataISO[] {
  const primeiro = primeiroDiaDoMes(desde);
  const datas: DataISO[] = [];

  for (let i = 0; i < JANELA_RETROATIVA + 1; i += 1) {
    const mes = somarMeses(primeiro, i);
    if (mes > ate) break;

    const vencimento = dataDaOcorrencia(mes, agenda.dia, agenda.regra, feriados);
    // Não gera antes de a recorrência existir, nem no futuro, nem depois do prazo.
    if (agenda.terminaEm !== null && vencimento > agenda.terminaEm) break;
    if (vencimento < desde) continue;
    if (vencimento > ate) break;

    datas.push(vencimento);
  }

  return datas;
}
