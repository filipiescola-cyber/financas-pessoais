import { describe, expect, it } from 'vitest';
import {
  despesaPorNatureza,
  evolucaoMensal,
  gastoPorCategoria,
  mesesComMovimento,
  totalDeDespesas,
  totalDeReceitas,
  type TransacaoDeRelatorio,
} from '../src/dominio/relatorios';

type Parcial = Partial<TransacaoDeRelatorio>;

const t = (campos: Parcial): TransacaoDeRelatorio => ({
  valor: -1000,
  tipo: 'despesa',
  dataCompetencia: '2026-08-10',
  categoriaId: null,
  natureza: null,
  transacaoPaiId: null,
  temFilhas: false,
  ...campos,
});

describe('totais do mês', () => {
  it('soma receitas e despesas separadamente', () => {
    const lista = [
      t({ tipo: 'receita', valor: 300000 }),
      t({ valor: -5000 }),
      t({ valor: -2500 }),
    ];
    expect(totalDeReceitas(lista)).toBe(300000);
    expect(totalDeDespesas(lista)).toBe(7500);
  });

  it('IGNORA transferência nos dois lados (§2.3)', () => {
    // Pagamento de fatura e aporte na Empresa são transferência. Contar como
    // despesa dobraria o gasto do mês — o erro mais comum em app de finanças.
    const lista = [
      t({ tipo: 'transferencia', valor: -80000 }),
      t({ tipo: 'transferencia', valor: 80000 }),
      t({ valor: -5000 }),
    ];
    expect(totalDeDespesas(lista)).toBe(5000);
    expect(totalDeReceitas(lista)).toBe(0);
  });

  it('nos totais conta o pai e ignora as filhas (§5.5)', () => {
    // Compra de R$ 200 dividida em R$ 120 e R$ 80: saiu R$ 200 da conta.
    const lista = [
      t({ valor: -20000, temFilhas: true }),
      t({ valor: -12000, transacaoPaiId: 'pai' }),
      t({ valor: -8000, transacaoPaiId: 'pai' }),
    ];
    expect(totalDeDespesas(lista)).toBe(20000);
  });
});

describe('gasto por categoria', () => {
  it('agrupa e ordena do maior para o menor', () => {
    const lista = [
      t({ valor: -5000, categoriaId: 'mercado' }),
      t({ valor: -3000, categoriaId: 'lazer' }),
      t({ valor: -2000, categoriaId: 'mercado' }),
    ];
    expect(gastoPorCategoria(lista)).toEqual([
      { categoriaId: 'mercado', total: 7000, quantidade: 2 },
      { categoriaId: 'lazer', total: 3000, quantidade: 1 },
    ]);
  });

  it('por categoria conta as FILHAS e ignora o pai (§5.5)', () => {
    // O inverso do total: são as filhas que carregam a categoria verdadeira da
    // compra dividida — metade mercado, metade material da empresa.
    const lista = [
      t({ valor: -20000, categoriaId: 'mercado', temFilhas: true }),
      t({ valor: -12000, categoriaId: 'mercado', transacaoPaiId: 'pai' }),
      t({ valor: -8000, categoriaId: 'material', transacaoPaiId: 'pai' }),
    ];
    expect(gastoPorCategoria(lista)).toEqual([
      { categoriaId: 'mercado', total: 12000, quantidade: 1 },
      { categoriaId: 'material', total: 8000, quantidade: 1 },
    ]);
  });

  it('junta o que está sem categoria num grupo próprio', () => {
    const lista = [t({ valor: -1000 }), t({ valor: -2000 })];
    expect(gastoPorCategoria(lista)).toEqual([
      { categoriaId: null, total: 3000, quantidade: 2 },
    ]);
  });

  it('não mistura receita no gasto', () => {
    const lista = [t({ tipo: 'receita', valor: 500000, categoriaId: 'salario' })];
    expect(gastoPorCategoria(lista)).toEqual([]);
  });
});

describe('despesa por natureza (§2.5)', () => {
  it('separa os três blocos e não devolve total', () => {
    const lista = [
      t({ valor: -120000, natureza: 'fixa' }),
      t({ valor: -30000, natureza: 'variavel' }),
      t({ valor: -180000, natureza: 'eventual' }),
      t({ valor: -1000 }),
    ];

    const resultado = despesaPorNatureza(lista);
    expect(resultado).toEqual({
      fixa: 120000,
      variavel: 30000,
      eventual: 180000,
      semNatureza: 1000,
    });
    // Nunca um total único: é ele que esconde a informação que interessa.
    expect(resultado).not.toHaveProperty('total');
  });

  it('mantém o que está sem natureza visível, em vez de somar em variável', () => {
    expect(despesaPorNatureza([t({ valor: -5000 })]).variavel).toBe(0);
    expect(despesaPorNatureza([t({ valor: -5000 })]).semNatureza).toBe(5000);
  });
});

describe('evolução mensal', () => {
  const lista = [
    t({ tipo: 'receita', valor: 300000, dataCompetencia: '2026-06-05' }),
    t({ valor: -100000, dataCompetencia: '2026-06-20' }),
    t({ valor: -50000, dataCompetencia: '2026-08-02' }),
  ];

  it('devolve os meses do mais antigo para o mais recente', () => {
    const meses = evolucaoMensal(lista, '2026-08-15', 3);
    expect(meses.map((m) => m.mes)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
  });

  it('mantém o mês sem movimento zerado, em vez de pular', () => {
    // Julho vazio é informação: some se a série pular o mês.
    const meses = evolucaoMensal(lista, '2026-08-15', 3);
    expect(meses[1]).toEqual({ mes: '2026-07-01', receitas: 0, despesas: 0 });
  });

  it('usa competência, não caixa (§2.4)', () => {
    const meses = evolucaoMensal(lista, '2026-08-15', 3);
    expect(meses[0]?.receitas).toBe(300000);
    expect(meses[0]?.despesas).toBe(100000);
    expect(meses[2]?.despesas).toBe(50000);
  });

  it('atravessa a virada de ano', () => {
    const meses = evolucaoMensal([], '2027-01-10', 3);
    expect(meses.map((m) => m.mes)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });
});

describe('quanto histórico existe (§13.5)', () => {
  it('conta os meses com movimento', () => {
    const lista = [
      t({ dataCompetencia: '2026-06-05' }),
      t({ dataCompetencia: '2026-06-20' }),
      t({ dataCompetencia: '2026-08-02' }),
    ];
    expect(mesesComMovimento(lista)).toBe(2);
  });

  it('não conta mês que só tem transferência', () => {
    expect(mesesComMovimento([t({ tipo: 'transferencia' })])).toBe(0);
  });
});
