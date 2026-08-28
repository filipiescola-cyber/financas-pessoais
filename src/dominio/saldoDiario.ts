// Saldo ao fim de cada dia (§13.2).
//
// A sutileza que decide se este número serve ou mente: a lista de lançamentos
// agrupa por COMPETÊNCIA — quando o gasto aconteceu — e o saldo anda por CAIXA
// — quando o dinheiro se moveu. Os dois coincidem na conta corrente e divergem
// no cartão, onde a compra é de hoje e a saída é no vencimento da fatura.
//
// Por isso o acumulado aqui é montado a partir de `data_caixa`, e não dos
// mesmos lançamentos que a lista mostra. Usar a competência daria um saldo que
// não bate com o extrato do banco — que é o único saldo que importa.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

export type MovimentoDeCaixa = {
  valor: Centavos;
  dataCaixa: DataISO;
  transacaoPaiId: string | null;
};

/**
 * Saldo ao fim de cada dia pedido.
 *
 * `saldoDeAbertura` é o acumulado até o dia anterior ao primeiro da lista —
 * sem ele o mês pareceria começar do zero.
 *
 * Os dias vêm de fora, e não dos movimentos, porque a lista mostra dias que
 * podem não ter movimento de caixa nenhum: o saldo desses dias é o do dia
 * anterior, não um buraco.
 */
export function saldosAoFimDoDia(
  saldoDeAbertura: Centavos,
  movimentos: readonly MovimentoDeCaixa[],
  dias: readonly DataISO[],
): Map<DataISO, Centavos> {
  const porDia = new Map<DataISO, Centavos>();

  for (const movimento of movimentos) {
    // Filha de divisão não soma: o pai já moveu o saldo (§5.5).
    if (movimento.transacaoPaiId !== null) continue;
    porDia.set(movimento.dataCaixa, (porDia.get(movimento.dataCaixa) ?? 0) + movimento.valor);
  }

  const ordenados = [...dias].sort();
  const resultado = new Map<DataISO, Centavos>();

  let acumulado = saldoDeAbertura;
  for (const dia of ordenados) {
    acumulado += porDia.get(dia) ?? 0;
    resultado.set(dia, acumulado);
  }

  return resultado;
}

/**
 * O saldo do dia só é honesto quando todos os movimentos daquele dia já
 * entraram na conta. Um dia com compra no cartão mostra a compra na lista e não
 * mexe no saldo — e a tela precisa poder dizer isso em vez de deixar o usuário
 * achar que o app errou.
 */
export function temMovimentoAdiado(
  movimentosDoDia: readonly { dataCompetencia: DataISO; dataCaixa: DataISO }[],
): boolean {
  return movimentosDoDia.some((m) => m.dataCaixa > m.dataCompetencia);
}
