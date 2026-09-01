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
  transferenciaParId: string | null;
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

/**
 * Transferência com as duas pernas juntas.
 *
 * Ela nasce como dois lançamentos ligados (§2.3) porque é assim que o saldo de
 * cada conta se mexe — e isso continua verdade. Mas na lista as duas linhas
 * seguidas, com o mesmo nome e o mesmo valor trocando de sinal, leem-se como
 * duplicidade. É UM evento: dinheiro saiu daqui e entrou ali.
 */
export type LinhaDeTransferencia<T> = { tipo: 'transferencia'; saida: T; entrada: T };

export type LinhaDeCaixa<T> =
  | { tipo: 'lancamento'; transacao: T }
  | LinhaDeTransferencia<T>
  | BlocoDeFatura<T>;

/**
 * Junta as duas pernas quando as DUAS estão à vista.
 *
 * Com filtro de conta ligado só uma delas aparece, e aí ela continua sendo uma
 * linha comum: do ponto de vista do Nubank, saíram R$ 300 — juntar mostraria um
 * movimento que não é daquele extrato.
 */
function unirTransferencias<T extends TransacaoAgrupavel>(soltas: readonly T[]): LinhaDeCaixa<T>[] {
  const porId = new Map(soltas.map((t) => [t.id, t]));
  const usadas = new Set<string>();
  const linhas: LinhaDeCaixa<T>[] = [];

  for (const transacao of soltas) {
    if (usadas.has(transacao.id)) continue;

    const par = transacao.transferenciaParId
      ? porId.get(transacao.transferenciaParId)
      : undefined;

    if (!par || usadas.has(par.id)) {
      linhas.push({ tipo: 'lancamento', transacao });
      continue;
    }

    usadas.add(transacao.id);
    usadas.add(par.id);

    // O sinal decide quem é quem; o id desempata no caso degenerado de valor
    // zero, para a ordem não depender de como o banco devolveu as linhas.
    const saiPrimeiro =
      transacao.valor !== par.valor
        ? transacao.valor < par.valor
        : transacao.id < par.id;

    linhas.push({
      tipo: 'transferencia',
      saida: saiPrimeiro ? transacao : par,
      entrada: saiPrimeiro ? par : transacao,
    });
  }

  return linhas;
}

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
        linhas: [...blocos, ...unirTransferencias(registro.soltas)],
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
 * Pesa o que FALTA sair, não o total da fatura. O que já foi pago saiu pela
 * transferência da quitação, que está entre os movimentos reais — contar as
 * duas tiraria o valor duas vezes do saldo. A fatura quitada some por
 * consequência, sem precisar de uma lista de pagas ao lado: o resto dela é
 * zero.
 *
 * A mesma função serve a ponte entre meses. Foi por terem duas contas
 * diferentes para a mesma fatura que o saldo desencontrou: a ponte descontava
 * o pagamento parcial e o mês exibido não.
 */
export function faturasQueAindaVaoSair(
  faturas: readonly { faturaId: string; vencimento: DataISO; total: Centavos }[],
  pagoPorFatura: ReadonlyMap<string, Centavos>,
): { valor: Centavos; dataCaixa: DataISO; transacaoPaiId: null }[] {
  return faturas
    .map((fatura) => ({
      // O que FALTA sair, não o total da fatura. O que já foi pago saiu pela
      // transferência de quitação, que está entre os movimentos reais — pesar
      // o bruto aqui tirava o valor duas vezes do saldo. Com pagamento
      // parcial isso deixou de ser teoria: metade da fatura contava dobrado.
      valor: -Math.max(0, Math.abs(fatura.total) - (pagoPorFatura.get(fatura.faturaId) ?? 0)),
      dataCaixa: fatura.vencimento,
      transacaoPaiId: null as null,
    }))
    // Fatura quitada não é movimento nenhum: some da conta em vez de entrar
    // como zero e sujar a lista de dias.
    .filter((movimento) => movimento.valor !== 0);
}
