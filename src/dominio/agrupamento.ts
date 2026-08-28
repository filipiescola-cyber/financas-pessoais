// Agrupar a lista de lançamentos por caixa (§2.4, §13.2).
//
// A lista nasceu agrupada por COMPETÊNCIA — o dia em que o gasto aconteceu — e
// isso responde "o que eu gastei ontem". Mas a linha de saldo do lado corre por
// CAIXA, porque é o único saldo que bate com o extrato do banco. Nas contas
// normais as duas datas coincidem e ninguém percebe. No cartão elas divergem
// por semanas, e a tela ficava dizendo duas coisas ao mesmo tempo: uma compra
// aparecia no dia 5 e o saldo não se mexia.
//
// A visão por caixa desfaz isso. Cada compra de cartão sai do dia da compra e
// entra num BLOCO DE FATURA no dia do vencimento — que é onde o dinheiro sai de
// verdade, e onde o saldo finalmente tem uma causa visível ao lado dele.
//
// Nenhuma das duas visões é "a certa": são perguntas diferentes. Por isso a
// tela oferece as duas em vez de trocar uma pela outra.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

export type Visao = 'competencia' | 'caixa';

export type TransacaoAgrupavel = {
  id: string;
  contaId: string;
  faturaId: string | null;
  dataCompetencia: DataISO;
  dataCaixa: DataISO;
  valor: Centavos;
  transacaoPaiId: string | null;
};

export type BlocoDeFatura<T> = {
  tipo: 'fatura';
  faturaId: string;
  contaId: string;
  vencimento: DataISO;
  /** Soma das compras. Filha de divisão não entra: o pai já está aqui (§5.5). */
  total: Centavos;
  compras: T[];
};

export type LinhaDeCaixa<T> = { tipo: 'lancamento'; transacao: T } | BlocoDeFatura<T>;

export type DiaDeCaixa<T> = { dia: DataISO; linhas: LinhaDeCaixa<T>[] };

/**
 * Agrupa por `data_caixa`, juntando o que pertence à mesma fatura num bloco só.
 *
 * O bloco fica no dia do vencimento porque é dali que a `data_caixa` de toda
 * compra de cartão vem (§2.1) — não é uma data escolhida aqui, é a que já está
 * gravada em cada linha.
 */
export function agruparPorCaixa<T extends TransacaoAgrupavel>(
  transacoes: readonly T[],
): DiaDeCaixa<T>[] {
  const dias = new Map<DataISO, { soltas: T[]; faturas: Map<string, T[]> }>();

  const doDia = (dia: DataISO) => {
    let registro = dias.get(dia);
    if (!registro) {
      registro = { soltas: [], faturas: new Map() };
      dias.set(dia, registro);
    }
    return registro;
  };

  for (const transacao of transacoes) {
    const registro = doDia(transacao.dataCaixa);
    if (transacao.faturaId === null) {
      registro.soltas.push(transacao);
    } else {
      const atual = registro.faturas.get(transacao.faturaId) ?? [];
      registro.faturas.set(transacao.faturaId, [...atual, transacao]);
    }
  }

  return [...dias.entries()]
    .map(([dia, registro]) => {
      const blocos: BlocoDeFatura<T>[] = [...registro.faturas.entries()].map(
        ([faturaId, compras]) => ({
          tipo: 'fatura',
          faturaId,
          contaId: compras[0]!.contaId,
          vencimento: dia,
          total: compras
            .filter((c) => c.transacaoPaiId === null)
            .reduce((soma, c) => soma + c.valor, 0),
          // Dentro da fatura a ordem volta a ser a da competência: é a ordem em
          // que as compras aconteceram, que é como se confere uma fatura.
          compras: [...compras].sort(
            (a, b) =>
              a.dataCompetencia.localeCompare(b.dataCompetencia) || a.id.localeCompare(b.id),
          ),
        }),
      );

      // A fatura vem primeiro: no dia do vencimento ela é o evento do dia, e
      // costuma ser o maior valor da lista inteira.
      blocos.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

      return {
        dia,
        linhas: [
          ...blocos,
          ...registro.soltas.map((transacao) => ({ tipo: 'lancamento' as const, transacao })),
        ],
      };
    })
    .sort((a, b) => b.dia.localeCompare(a.dia));
}
