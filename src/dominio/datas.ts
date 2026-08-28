// Datas (§13.1).
//
// Duas decisões que evitam a maior parte dos bugs de data neste app:
//
// 1. Data é STRING 'AAAA-MM-DD', igual ao `date` do Postgres. Objeto Date do
//    JavaScript carrega hora e fuso, e é exatamente daí que vem o clássico
//    "lancei no dia 1 e apareceu no dia 31". Como o formato é ordenável,
//    comparar datas vira comparar strings.
//
// 2. "Hoje" é sempre America/Sao_Paulo, nunca o fuso do navegador nem UTC.
//    O servidor do Supabase roda em UTC: às 21h de Brasília já é o dia seguinte lá.
//
// A aritmética interna usa Date.UTC, que é só um calendário — sem fuso envolvido.

export type DataISO = string;

const FUSO = 'America/Sao_Paulo';

const FORMATADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type Partes = { ano: number; mes: number; dia: number };

const PADRAO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataValida(data: string): boolean {
  const encontrado = PADRAO.exec(data);
  if (!encontrado) return false;
  const ano = Number(encontrado[1]);
  const mes = Number(encontrado[2]);
  const dia = Number(encontrado[3]);
  if (mes < 1 || mes > 12) return false;
  return dia >= 1 && dia <= diasNoMes(ano, mes);
}

function partes(data: DataISO): Partes {
  const encontrado = PADRAO.exec(data);
  if (!encontrado) throw new Error(`Data fora do formato AAAA-MM-DD: ${data}`);
  return {
    ano: Number(encontrado[1]),
    mes: Number(encontrado[2]),
    dia: Number(encontrado[3]),
  };
}

function montar(ano: number, mes: number, dia: number): DataISO {
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${String(ano).padStart(4, '0')}-${mm}-${dd}`;
}

/** Quantos dias tem o mês. Dia 0 do mês seguinte é o último dia deste. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Hoje em America/Sao_Paulo. Único ponto do app que consulta o relógio. */
export function hoje(agora: Date = new Date()): DataISO {
  const p = FORMATADOR.formatToParts(agora);
  const pegar = (tipo: string) => p.find((parte) => parte.type === tipo)?.value ?? '';
  return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}

export function ontem(agora: Date = new Date()): DataISO {
  return somarDias(hoje(agora), -1);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  const { ano, mes, dia } = partes(data);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Soma meses preservando o dia quando ele existe no mês de destino, e caindo
 * no último dia quando não existe. 31/01 + 1 mês = 28/02 (ou 29 em bissexto).
 * É a mesma regra que o §4.2 exige do fechamento de cartão no dia 31.
 */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const { ano, mes, dia } = partes(data);
  const totalMeses = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(totalMeses / 12);
  const novoMes = (totalMeses % 12) + 1;
  return montar(novoAno, novoMes, Math.min(dia, diasNoMes(novoAno, novoMes)));
}

export function primeiroDiaDoMes(data: DataISO): DataISO {
  const { ano, mes } = partes(data);
  return montar(ano, mes, 1);
}

export function ultimoDiaDoMes(data: DataISO): DataISO {
  const { ano, mes } = partes(data);
  return montar(ano, mes, diasNoMes(ano, mes));
}

/**
 * Fixa um dia do mês dentro de um mês específico, limitando ao último dia.
 * Fechamento no dia 31 em fevereiro vira 28 ou 29 (§4.2).
 */
export function diaNoMes(data: DataISO, dia: number): DataISO {
  const { ano, mes } = partes(data);
  return montar(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
}

/** Negativo se a < b, zero se iguais, positivo se a > b. */
export function comparar(a: DataISO, b: DataISO): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function ehPassadoOuHoje(data: DataISO, referencia: DataISO): boolean {
  return data <= referencia;
}

export function ehFuturo(data: DataISO, referencia: DataISO): boolean {
  return data > referencia;
}

/** Rótulo curto para a lista de transações: 27/08/2026. */
export function formatarBR(data: DataISO): string {
  const { ano, mes, dia } = partes(data);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}
