// A emenda entre um mês e o seguinte (§13.2).
//
// O saldo previsto já desencontrou duas vezes entre meses, e as duas por baixo
// da mesma pedra: a lista de lançamentos montava o saldo de um jeito e a ponte
// para o mês seguinte somava as mesmas coisas de outro. Dois caminhos para o
// mesmo número, e nenhum teste, porque a montagem morava dentro da tela.
//
// Aqui ela é função pura, e o fechamento de um mês é, por construção, a
// abertura do próximo: os dois saem da mesma soma sobre o mesmo conjunto de
// movimentos. Não é uma conta a mais — é a mesma conta, feita uma vez só.

import { saldosAoFimDoDia, type MovimentoDeCaixa } from './saldoDiario';
import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

export type ExtratoDoMes = {
  /** Saldo no instante anterior ao primeiro dia do mês. */
  abertura: Centavos;
  /** Saldo ao fim de cada dia PEDIDO. */
  saldos: Map<DataISO, Centavos>;
  /** Saldo depois do último movimento do mês — a abertura do mês seguinte. */
  fechamento: Centavos;
};

/** Filha de divisão não soma: o pai já moveu o saldo (§5.5). */
function somar(movimentos: readonly MovimentoDeCaixa[]): Centavos {
  return movimentos.reduce((t, m) => (m.transacaoPaiId === null ? t + m.valor : t), 0);
}

/**
 * Monta o saldo do mês a partir de um âncora e de dois conjuntos de movimento.
 *
 * `movimentosAteOMes` é a ponte: o que acontece entre o âncora e o primeiro dia
 * do mês. Num mês passado ela é vazia; num mês futuro ela carrega o que o banco
 * ainda não tem — recorrência que não venceu e fatura que não foi paga.
 *
 * Os dias vêm de fora porque a lista mostra os dias que têm linha, e o saldo de
 * um dia sem linha é o do dia anterior, não um buraco. Mas o FECHAMENTO soma
 * todo movimento do mês, inclusive o de um dia que a lista não mostra — foi
 * exatamente por aí que o saldo vazou da última vez: a saída existia na ponte
 * do mês seguinte e não existia no acumulado deste.
 */
export function extratoDoMes(entrada: {
  ancora: Centavos;
  movimentosAteOMes: readonly MovimentoDeCaixa[];
  movimentosDoMes: readonly MovimentoDeCaixa[];
  dias: readonly DataISO[];
}): ExtratoDoMes {
  const abertura = entrada.ancora + somar(entrada.movimentosAteOMes);
  const fechamento = abertura + somar(entrada.movimentosDoMes);

  // Os dias com movimento entram no acumulado mesmo sem linha na lista: sem
  // isso o saldo do dia seguinte já nasceria errado.
  const todos = [
    ...new Set([...entrada.dias, ...entrada.movimentosDoMes.map((m) => m.dataCaixa)]),
  ];
  const completo = saldosAoFimDoDia(abertura, entrada.movimentosDoMes, todos);

  const saldos = new Map<DataISO, Centavos>();
  for (const dia of entrada.dias) saldos.set(dia, completo.get(dia) ?? abertura);

  return { abertura, saldos, fechamento };
}
