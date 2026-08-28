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
// A lista responde uma pergunta só: o que entrou e saiu da conta em cada dia.
// A outra pergunta — quanto eu gastei, e quando — é de Relatórios, que continua
// por competência (§2.4). Havia um seletor com as duas visões aqui, e ele saiu:
// a visão por competência mostrava a compra num dia em que o saldo ao lado não
// se mexia, e uma tela que se contradiz não vira duas respostas, vira dúvida.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

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

/**
 * As faturas que ainda vão sair do caixa (§2.1, §13.2).
 *
 * Uma fatura em aberto é saída de caixa que vai acontecer no vencimento — a
 * mesma natureza da recorrência prevista, e entra no saldo do dia pelo mesmo
 * motivo: sem ela a lista mostra a fatura inteira num dia em que o saldo ao
 * lado não se mexe, que é a contradição que a visão por caixa existe para
 * desfazer.
 *
 * A fatura PAGA fica de fora. Nela o dinheiro já saiu pela transferência da
 * quitação, que está entre os movimentos reais — contar as duas tiraria o
 * valor duas vezes do saldo.
 */
export function faturasQueAindaVaoSair<T extends TransacaoAgrupavel>(
  blocos: readonly BlocoDeFatura<T>[],
  faturasPagas: ReadonlySet<string>,
): { valor: Centavos; dataCaixa: DataISO; transacaoPaiId: null }[] {
  return blocos
    .filter((bloco) => !faturasPagas.has(bloco.faturaId))
    .map((bloco) => ({ valor: bloco.total, dataCaixa: bloco.vencimento, transacaoPaiId: null }));
}
