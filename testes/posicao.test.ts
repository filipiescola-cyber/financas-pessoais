import { describe, expect, it } from 'vitest';
import { calcularPosicao, parcelasVivas, principalVivo, type Movimento } from '../src/dominio/posicao';
import { calcular } from '../src/dominio/rendimento';

const FERIADOS = new Set(['2026-01-01', '2026-04-21', '2026-09-07', '2026-12-25']);
const TABELA_IR = [
  { diasMin: 0, diasMax: 180, aliquota: 0.225 },
  { diasMin: 181, diasMax: 360, aliquota: 0.2 },
  { diasMin: 361, diasMax: 720, aliquota: 0.175 },
  { diasMin: 721, diasMax: null, aliquota: 0.15 },
];

const PAPEL = {
  indexador: 'CDI' as const,
  percentualIndexador: 100,
  taxaPrefixada: null,
  isentoIR: false,
};

// A taxa chega em PERCENTUAL, como vem da tabela de indexadores: 14 = 14% a.a.
const CDI = 14;

describe('posição com um aporte só', () => {
  it('dá exatamente o mesmo que o cálculo de aplicação única', () => {
    // Compatibilidade: quem tem um investimento antigo não pode ver o número
    // mudar só porque o modelo passou a ser por parcelas.
    const movimentos: Movimento[] = [{ tipo: 'aporte', valor: 100000, data: '2026-01-05' }];

    const posicao = calcularPosicao(PAPEL, movimentos, CDI, '2026-08-30', FERIADOS, TABELA_IR);
    const unica = calcular(
      { ...PAPEL, valorAplicado: 100000, dataAplicacao: '2026-01-05' },
      CDI,
      '2026-08-30',
      FERIADOS,
      TABELA_IR,
    );

    expect(posicao.saldoBruto).toBe(unica.saldoBruto);
    expect(posicao.ir).toBe(unica.ir);
    expect(posicao.saldoLiquido).toBe(unica.saldoLiquido);
  });
});

describe('aporte novo na mesma posição', () => {
  const movimentos: Movimento[] = [
    { tipo: 'aporte', valor: 100000, data: '2026-01-05' },
    { tipo: 'aporte', valor: 50000, data: '2026-06-01' },
  ];

  it('soma o principal dos dois', () => {
    expect(principalVivo(parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR))).toBe(150000);
  });

  it('cada parcela rende a partir da SUA data, não de uma média', () => {
    const posicao = calcularPosicao(PAPEL, movimentos, CDI, '2026-08-30', FERIADOS, TABELA_IR);

    const primeira = calcular(
      { ...PAPEL, valorAplicado: 100000, dataAplicacao: '2026-01-05' },
      CDI, '2026-08-30', FERIADOS, TABELA_IR,
    );
    const segunda = calcular(
      { ...PAPEL, valorAplicado: 50000, dataAplicacao: '2026-06-01' },
      CDI, '2026-08-30', FERIADOS, TABELA_IR,
    );

    expect(posicao.saldoBruto).toBe(primeira.saldoBruto + segunda.saldoBruto);
  });

  it('a idade da posição é a da parcela mais antiga', () => {
    const posicao = calcularPosicao(PAPEL, movimentos, CDI, '2026-08-30', FERIADOS, TABELA_IR);
    const antiga = calcular(
      { ...PAPEL, valorAplicado: 100000, dataAplicacao: '2026-01-05' },
      CDI, '2026-08-30', FERIADOS, TABELA_IR,
    );
    expect(posicao.diasUteis).toBe(antiga.diasUteis);
  });

  it('a alíquota devolvida é a efetiva, entre as duas faixas', () => {
    // A parcela velha já passou de 180 dias (20%), a nova não (22,5%).
    const posicao = calcularPosicao(PAPEL, movimentos, CDI, '2026-08-30', FERIADOS, TABELA_IR);
    expect(posicao.aliquotaIR).toBeGreaterThan(0.2);
    expect(posicao.aliquotaIR).toBeLessThan(0.225);
  });
});

describe('resgate parcial', () => {
  it('reduz o principal, em vez de deixar o dinheiro em dois lugares', () => {
    // O bug que isto conserta: antes, o resgate creditava a conta e a aplicação
    // continuava valendo o mesmo.
    const movimentos: Movimento[] = [
      { tipo: 'aporte', valor: 100000, data: '2026-01-05' },
      { tipo: 'resgate', valor: 40000, data: '2026-06-01' },
    ];

    const principal = principalVivo(parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR));
    expect(principal).toBeLessThan(100000);
    expect(principal).toBeGreaterThan(55000);
  });

  it('tira proporcionalmente de cada parcela, preservando a idade média', () => {
    const movimentos: Movimento[] = [
      { tipo: 'aporte', valor: 100000, data: '2026-01-05' },
      { tipo: 'aporte', valor: 100000, data: '2026-06-01' },
      { tipo: 'resgate', valor: 50000, data: '2026-07-01' },
    ];

    const parcelas = parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR);
    expect(parcelas).toHaveLength(2);
    // As duas encolheram, e a mais nova continua menor que a mais velha por
    // ter rendido menos — nenhuma foi consumida inteira.
    expect(parcelas[0]!.valor).toBeGreaterThan(0);
    expect(parcelas[1]!.valor).toBeGreaterThan(0);
  });

  it('resgatar tudo zera a posição', () => {
    const movimentos: Movimento[] = [
      { tipo: 'aporte', valor: 100000, data: '2026-01-05' },
      { tipo: 'resgate', valor: 500000, data: '2026-06-01' },
    ];

    expect(parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR)).toEqual([]);
    expect(calcularPosicao(PAPEL, movimentos, CDI, '2026-08-30', FERIADOS, TABELA_IR).saldoBruto)
      .toBe(0);
  });

  it('resgate acima do saldo não vira principal negativo', () => {
    // Sem a trava, a posição passaria a "render" para baixo para sempre.
    const movimentos: Movimento[] = [
      { tipo: 'aporte', valor: 10000, data: '2026-01-05' },
      { tipo: 'resgate', valor: 99999999, data: '2026-02-01' },
      { tipo: 'aporte', valor: 20000, data: '2026-03-01' },
    ];

    expect(principalVivo(parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR))).toBe(20000);
  });

  it('no mesmo dia, o aporte entra antes do resgate', () => {
    const movimentos: Movimento[] = [
      { tipo: 'resgate', valor: 50000, data: '2026-03-01' },
      { tipo: 'aporte', valor: 100000, data: '2026-03-01' },
    ];

    // Ordem inversa zeraria tudo: não dá para resgatar o que ainda não entrou.
    expect(principalVivo(parcelasVivas(PAPEL, movimentos, CDI, FERIADOS, TABELA_IR))).toBe(50000);
  });
});

describe('sem taxa conhecida', () => {
  it('o resgate ainda reduz o principal, sem inventar rendimento', () => {
    const movimentos: Movimento[] = [
      { tipo: 'aporte', valor: 100000, data: '2026-01-05' },
      { tipo: 'resgate', valor: 25000, data: '2026-06-01' },
    ];

    expect(principalVivo(parcelasVivas(PAPEL, movimentos, null, FERIADOS, TABELA_IR))).toBe(75000);
  });
});

describe('o valor do resgate é o LÍQUIDO, que é o que o banco credita', () => {
  const aporte: Movimento[] = [{ tipo: 'aporte', valor: 100000, data: '2026-01-05' }];

  it('resgatar tudo não deixa saldo fantasma', () => {
    // Descontando o líquido do BRUTO sobrava justamente o IR e o IOF retidos:
    // R$ 17,17 de uma posição de R$ 1.000, rendendo para sempre dentro do app.
    const posicao = calcularPosicao(PAPEL, aporte, CDI, '2026-08-30', FERIADOS, TABELA_IR);

    const tudo: Movimento[] = [
      ...aporte,
      { tipo: 'resgate', valor: posicao.saldoLiquido, data: '2026-08-30' },
    ];

    expect(principalVivo(parcelasVivas(PAPEL, tudo, CDI, FERIADOS, TABELA_IR))).toBe(0);
  });

  it('resgatar metade do líquido deixa metade da posição', () => {
    const posicao = calcularPosicao(PAPEL, aporte, CDI, '2026-08-30', FERIADOS, TABELA_IR);

    const metade: Movimento[] = [
      ...aporte,
      { tipo: 'resgate', valor: Math.round(posicao.saldoLiquido / 2), data: '2026-08-30' },
    ];

    const depois = calcularPosicao(PAPEL, metade, CDI, '2026-08-30', FERIADOS, TABELA_IR);
    // Metade do líquido saiu, metade do líquido fica — com um centavo de folga
    // para o arredondamento de cada parcela.
    expect(Math.abs(depois.saldoLiquido - posicao.saldoLiquido / 2)).toBeLessThanOrEqual(2);
  });
});
