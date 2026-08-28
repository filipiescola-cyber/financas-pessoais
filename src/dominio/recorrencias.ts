// Calendário de recorrência (§5.2, §13.3).
//
// Mora no domínio, não na camada de dados, porque é função pura — e porque o
// teste dela não pode arrastar o cliente do banco junto. O cliente Supabase
// lança erro ao ser carregado sem as variáveis de ambiente, o que fazia o
// arquivo de teste inteiro falhar em qualquer máquina sem `.env`.

import { diaNoMes, primeiroDiaDoMes, somarMeses, type DataISO } from './datas';

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
 */
export function vencimentosPendentes(desde: DataISO, ate: DataISO, dia: number): DataISO[] {
  const primeiro = primeiroDiaDoMes(desde);
  const datas: DataISO[] = [];

  for (let i = 0; i < JANELA_RETROATIVA + 1; i += 1) {
    const mes = somarMeses(primeiro, i);
    if (mes > ate) break;

    const vencimento = diaNoMes(mes, dia);
    // Não gera antes de a recorrência existir, nem no futuro.
    if (vencimento < desde) continue;
    if (vencimento > ate) break;

    datas.push(vencimento);
  }

  return datas;
}
