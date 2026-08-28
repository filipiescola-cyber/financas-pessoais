import { describe, expect, it } from 'vitest';
import {
  agruparPorCaixa,
  faturasQueAindaVaoSair,
  type BlocoDeFatura,
  type TransacaoAgrupavel,
} from '../src/dominio/agrupamento';

function t(p: Partial<TransacaoAgrupavel> & { id: string }): TransacaoAgrupavel {
  return {
    contaId: 'conta-1',
    faturaId: null,
    dataCompetencia: '2026-08-05',
    dataCaixa: '2026-08-05',
    valor: -1000,
    transacaoPaiId: null,
    ...p,
  };
}

describe('agrupar por caixa', () => {
  it('lançamento sem fatura fica no próprio dia de caixa', () => {
    const dias = agruparPorCaixa([t({ id: 'a', dataCaixa: '2026-08-07' })]);
    expect(dias).toHaveLength(1);
    expect(dias[0]?.dia).toBe('2026-08-07');
    expect(dias[0]?.linhas[0]?.tipo).toBe('lancamento');
  });

  it('compras da mesma fatura viram um bloco só, no vencimento', () => {
    // O ponto da visão: as compras aconteceram em 5 e 12 de agosto, mas o
    // dinheiro sai de uma vez no dia 10 de setembro.
    const dias = agruparPorCaixa([
      t({ id: 'a', faturaId: 'f1', dataCompetencia: '2026-08-05', dataCaixa: '2026-09-10', valor: -3000 }),
      t({ id: 'b', faturaId: 'f1', dataCompetencia: '2026-08-12', dataCaixa: '2026-09-10', valor: -7000 }),
    ]);

    expect(dias).toHaveLength(1);
    expect(dias[0]?.dia).toBe('2026-09-10');
    const bloco = dias[0]!.linhas[0]!;
    expect(bloco.tipo).toBe('fatura');
    if (bloco.tipo !== 'fatura') return;
    expect(bloco.total).toBe(-10000);
    expect(bloco.compras.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('faturas de cartões diferentes no mesmo dia não se misturam', () => {
    const dias = agruparPorCaixa([
      t({ id: 'a', contaId: 'cartao-1', faturaId: 'f1', dataCaixa: '2026-09-10', valor: -5000 }),
      t({ id: 'b', contaId: 'cartao-2', faturaId: 'f2', dataCaixa: '2026-09-10', valor: -2000 }),
    ]);

    expect(dias[0]?.linhas).toHaveLength(2);
    expect(dias[0]?.linhas.every((l) => l.tipo === 'fatura')).toBe(true);
  });

  it('filha de divisão aparece na fatura mas não soma duas vezes (§5.5)', () => {
    // O pai já moveu o saldo; as filhas existem para o relatório por categoria.
    const dias = agruparPorCaixa([
      t({ id: 'pai', faturaId: 'f1', dataCaixa: '2026-09-10', valor: -10000 }),
      t({ id: 'filha', faturaId: 'f1', dataCaixa: '2026-09-10', valor: -6000, transacaoPaiId: 'pai' }),
      t({ id: 'outra', faturaId: 'f1', dataCaixa: '2026-09-10', valor: -4000, transacaoPaiId: 'pai' }),
    ]);

    const bloco = dias[0]!.linhas[0]!;
    if (bloco.tipo !== 'fatura') throw new Error('esperava bloco de fatura');
    expect(bloco.total).toBe(-10000);
    expect(bloco.compras).toHaveLength(3);
  });

  it('dentro da fatura, a ordem é a das compras — não a de chegada', () => {
    const dias = agruparPorCaixa([
      t({ id: 'b', faturaId: 'f1', dataCompetencia: '2026-08-20', dataCaixa: '2026-09-10' }),
      t({ id: 'a', faturaId: 'f1', dataCompetencia: '2026-08-02', dataCaixa: '2026-09-10' }),
    ]);
    const bloco = dias[0]!.linhas[0]!;
    if (bloco.tipo !== 'fatura') throw new Error('esperava bloco de fatura');
    expect(bloco.compras.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('a fatura vem antes das linhas soltas do mesmo dia', () => {
    // No dia do vencimento a fatura é o evento do dia, e quase sempre o maior
    // valor da tela.
    const dias = agruparPorCaixa([
      t({ id: 'mercado', dataCaixa: '2026-09-10', valor: -5000 }),
      t({ id: 'compra', faturaId: 'f1', dataCaixa: '2026-09-10', valor: -80000 }),
    ]);
    expect(dias[0]?.linhas.map((l) => l.tipo)).toEqual(['fatura', 'lancamento']);
  });

  it('dias vêm do mais recente para o mais antigo', () => {
    const dias = agruparPorCaixa([
      t({ id: 'a', dataCaixa: '2026-08-03' }),
      t({ id: 'b', dataCaixa: '2026-08-20' }),
      t({ id: 'c', dataCaixa: '2026-08-11' }),
    ]);
    expect(dias.map((d) => d.dia)).toEqual(['2026-08-20', '2026-08-11', '2026-08-03']);
  });

  it('lista vazia não vira dia nenhum', () => {
    expect(agruparPorCaixa([])).toEqual([]);
  });
});

describe('fatura no saldo previsto', () => {
  function blocos(): BlocoDeFatura<TransacaoAgrupavel>[] {
    const dias = agruparPorCaixa([
      t({ id: 'a', faturaId: 'aberta', dataCaixa: '2026-10-09', valor: -1275 }),
      t({ id: 'b', faturaId: 'quitada', dataCaixa: '2026-10-20', valor: -50000 }),
    ]);
    return dias.flatMap((d) => d.linhas.flatMap((l) => (l.tipo === 'fatura' ? [l] : [])));
  }

  it('fatura em aberto vira saída no dia do vencimento', () => {
    // O defeito que isto fecha: a lista mostrava a fatura de R$ 12,75 no dia 9
    // e o saldo do dia continuava o mesmo, como se ela não fosse sair.
    const saidas = faturasQueAindaVaoSair(blocos(), new Set(['quitada']));
    expect(saidas).toEqual([
      { valor: -1275, dataCaixa: '2026-10-09', transacaoPaiId: null },
    ]);
  });

  it('fatura paga fica de fora: o dinheiro já saiu pela quitação', () => {
    // Contar as duas tiraria o valor duas vezes do saldo.
    const saidas = faturasQueAindaVaoSair(blocos(), new Set(['aberta', 'quitada']));
    expect(saidas).toEqual([]);
  });

  it('sem nenhuma paga, todas entram', () => {
    expect(faturasQueAindaVaoSair(blocos(), new Set())).toHaveLength(2);
  });

  it('o sinal é o da própria fatura: saída é negativa', () => {
    const [saida] = faturasQueAindaVaoSair(blocos(), new Set(['quitada']));
    expect(saida!.valor).toBeLessThan(0);
  });
});
