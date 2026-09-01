import { describe, expect, it } from 'vitest';
import {
  agruparPorCaixa,
  faturasQueAindaVaoSair,
  juntarPrevistasNaFatura,
  type BlocoDeFatura,
  type CobrancaPrevista,
  type TransacaoAgrupavel,
} from '../src/dominio/agrupamento';

function t(p: Partial<TransacaoAgrupavel> & { id: string }): TransacaoAgrupavel {
  return {
    contaId: 'conta-1',
    faturaId: null,
    dataCompetencia: '2026-08-05',
    dataCaixa: '2026-08-05',
    transferenciaParId: null,
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
    const saidas = faturasQueAindaVaoSair(blocos(), new Map([['quitada', 50000]]));
    expect(saidas).toEqual([
      { valor: -1275, dataCaixa: '2026-10-09', transacaoPaiId: null },
    ]);
  });

  it('fatura paga fica de fora: o dinheiro já saiu pela quitação', () => {
    // Contar as duas tiraria o valor duas vezes do saldo.
    const saidas = faturasQueAindaVaoSair(
      blocos(),
      new Map([['aberta', 1275], ['quitada', 50000]]),
    );
    expect(saidas).toEqual([]);
  });

  it('pagamento parcial deixa sair só o resto', () => {
    // O bug que isto fecha: a fatura pesava o BRUTO no mês exibido e o líquido
    // na ponte para o mês seguinte. Quem pagou metade via a metade descontada
    // duas vezes, e os dois meses não fechavam no mesmo número.
    const saidas = faturasQueAindaVaoSair(blocos(), new Map([['quitada', 20000]]));
    const daQuitada = saidas.find((s) => s.dataCaixa === '2026-10-20');
    expect(daQuitada!.valor).toBe(-30000);
  });

  it('pagamento maior que a fatura não vira crédito', () => {
    const saidas = faturasQueAindaVaoSair(blocos(), new Map([['quitada', 80000]]));
    expect(saidas.map((s) => s.dataCaixa)).toEqual(['2026-10-09']);
  });

  it('sem nenhuma paga, todas entram', () => {
    expect(faturasQueAindaVaoSair(blocos(), new Map())).toHaveLength(2);
  });

  it('o sinal é o da própria fatura: saída é negativa', () => {
    const [saida] = faturasQueAindaVaoSair(blocos(), new Map([['quitada', 50000]]));
    expect(saida!.valor).toBeLessThan(0);
  });
});

describe('transferência em uma linha só', () => {
  const base = {
    faturaId: null,
    dataCompetencia: '2026-08-30',
    dataCaixa: '2026-08-30',
    transacaoPaiId: null,
  };

  const saida = { ...base, id: 'a', contaId: 'nubank', valor: -30000, transferenciaParId: 'b' };
  const entrada = { ...base, id: 'b', contaId: 'caixinha', valor: 30000, transferenciaParId: 'a' };

  it('junta as duas pernas quando ambas estão à vista', () => {
    const [dia] = agruparPorCaixa([saida, entrada]);
    expect(dia!.linhas).toHaveLength(1);
    expect(dia!.linhas[0]!.tipo).toBe('transferencia');
  });

  it('a saída é a de valor negativo, não a que veio primeiro na lista', () => {
    const [dia] = agruparPorCaixa([entrada, saida]);
    const linha = dia!.linhas[0]!;
    if (linha.tipo !== 'transferencia') throw new Error('esperava transferência');
    expect(linha.saida.contaId).toBe('nubank');
    expect(linha.entrada.contaId).toBe('caixinha');
  });

  it('com filtro de conta, a perna sozinha continua sendo linha comum', () => {
    // Do ponto de vista do Nubank saíram R$ 300. Juntar mostraria um movimento
    // que não pertence àquele extrato.
    const [dia] = agruparPorCaixa([saida]);
    expect(dia!.linhas).toHaveLength(1);
    expect(dia!.linhas[0]!.tipo).toBe('lancamento');
  });

  it('não junta lançamento comum que não é transferência', () => {
    const comum = { ...base, id: 'c', contaId: 'nubank', valor: -5000, transferenciaParId: null };
    const [dia] = agruparPorCaixa([comum, saida, entrada]);
    expect(dia!.linhas.filter((l) => l.tipo === 'transferencia')).toHaveLength(1);
    expect(dia!.linhas.filter((l) => l.tipo === 'lancamento')).toHaveLength(1);
  });

  it('duas transferências no mesmo dia viram duas linhas, cada uma com o seu par', () => {
    const s2 = { ...base, id: 'x', contaId: 'itau', valor: -10000, transferenciaParId: 'y' };
    const e2 = { ...base, id: 'y', contaId: 'wise', valor: 10000, transferenciaParId: 'x' };
    const [dia] = agruparPorCaixa([saida, s2, entrada, e2]);

    const pares = dia!.linhas.filter((l) => l.tipo === 'transferencia');
    expect(pares).toHaveLength(2);
    for (const par of pares) {
      if (par.tipo !== 'transferencia') continue;
      expect(par.saida.transferenciaParId).toBe(par.entrada.id);
    }
  });
});

describe('cobrança prevista dentro da fatura', () => {
  const previsto = (extra: Partial<CobrancaPrevista> = {}): CobrancaPrevista => ({
    chave: 'r1|2026-09-10',
    contaId: 'cartao',
    descricao: 'Curso de Inglês',
    valor: 72900,
    dataCompetencia: '2026-09-10',
    vencimento: '2026-10-14',
    ...extra,
  });

  const comFatura = () =>
    agruparPorCaixa([
      t({ id: 'a', contaId: 'cartao', faturaId: 'out', dataCaixa: '2026-10-14', valor: -20063 }),
    ]);

  it('entra na fatura e no total dela', () => {
    // O defeito: a fatura dizia "R$ 200,63" com R$ 729 de curso logo abaixo,
    // fora da conta — e não era isso que ia ser cobrado.
    const [dia] = juntarPrevistasNaFatura(comFatura(), [previsto()]);
    const bloco = dia!.linhas[0] as BlocoDeFatura<TransacaoAgrupavel>;

    expect(bloco.tipo).toBe('fatura');
    expect(bloco.previstas).toHaveLength(1);
    expect(bloco.total).toBe(-20063 - 72900);
  });

  it('sem fatura naquele dia, o bloco nasce da previsão', () => {
    // Mês futuro em que só há assinatura e nenhuma compra ainda.
    const [dia] = juntarPrevistasNaFatura([], [previsto()]);
    const bloco = dia!.linhas[0] as BlocoDeFatura<TransacaoAgrupavel>;

    expect(bloco.vencimento).toBe('2026-10-14');
    expect(bloco.compras).toEqual([]);
    expect(bloco.total).toBe(-72900);
  });

  it('valor variável entra na lista, não na soma', () => {
    // Somar zero por ele empurraria o total para um número que ninguém prometeu.
    const [dia] = juntarPrevistasNaFatura(comFatura(), [previsto({ valor: null })]);
    const bloco = dia!.linhas[0] as BlocoDeFatura<TransacaoAgrupavel>;

    expect(bloco.previstas).toHaveLength(1);
    expect(bloco.total).toBe(-20063);
  });

  it('cada cartão recebe a sua, mesmo vencendo no mesmo dia', () => {
    const dias = agruparPorCaixa([
      t({ id: 'a', contaId: 'nubank', faturaId: 'n1', dataCaixa: '2026-10-14', valor: -1000 }),
      t({ id: 'b', contaId: 'mp', faturaId: 'm1', dataCaixa: '2026-10-14', valor: -2000 }),
    ]);
    const [dia] = juntarPrevistasNaFatura(dias, [previsto({ contaId: 'nubank' })]);

    const blocos = dia!.linhas.filter(
      (l): l is BlocoDeFatura<TransacaoAgrupavel> => l.tipo === 'fatura',
    );
    expect(blocos.find((b) => b.contaId === 'nubank')!.previstas).toHaveLength(1);
    expect(blocos.find((b) => b.contaId === 'mp')!.previstas).toEqual([]);
  });

  it('sem previstas, os dias voltam como estavam', () => {
    expect(juntarPrevistasNaFatura(comFatura(), [])).toEqual(comFatura());
  });
});
