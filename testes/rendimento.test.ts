import { describe, expect, it } from 'vitest';
import { diasCorridosEntre, diasUteisEntre, ehDiaUtil, ehFimDeSemana } from '../src/dominio/diasUteis';
import {
  aliquotaDeIOF,
  aliquotaDeIR,
  calcular,
  fatorDiario,
  saldoBruto,
  taxaAnual,
  type FaixaDeIR,
} from '../src/dominio/rendimento';

// A mesma tabela que o seed grava em aliquotas_ir (§7.2).
const TABELA_IR: FaixaDeIR[] = [
  { diasMin: 0, diasMax: 180, aliquota: 0.225 },
  { diasMin: 181, diasMax: 360, aliquota: 0.2 },
  { diasMin: 361, diasMax: 720, aliquota: 0.175 },
  { diasMin: 721, diasMax: null, aliquota: 0.15 },
];

const SEM_FERIADOS = new Set<string>();

describe('dias úteis (§7.1)', () => {
  it('reconhece fim de semana', () => {
    // 29/08/2026 é sábado; 31/08 é segunda.
    expect(ehFimDeSemana('2026-08-29')).toBe(true);
    expect(ehFimDeSemana('2026-08-30')).toBe(true);
    expect(ehFimDeSemana('2026-08-31')).toBe(false);
  });

  it('feriado não é dia útil', () => {
    const feriados = new Set(['2026-09-07']);
    expect(ehDiaUtil('2026-09-07', feriados)).toBe(false);
    expect(ehDiaUtil('2026-09-07', SEM_FERIADOS)).toBe(true);
  });

  it('conta o fim e não o começo', () => {
    // Aplicação de segunda a sexta rende 4 dias, não 5: o dia da aplicação
    // não rende.
    expect(diasUteisEntre('2026-08-31', '2026-09-04', SEM_FERIADOS)).toBe(4);
  });

  it('pula o fim de semana', () => {
    // Sexta a segunda: só a segunda conta.
    expect(diasUteisEntre('2026-09-04', '2026-09-07', SEM_FERIADOS)).toBe(1);
  });

  it('o feriado muda o resultado — é por isso que o calendário vem antes', () => {
    const comFeriado = new Set(['2026-09-07']);
    expect(diasUteisEntre('2026-09-04', '2026-09-11', SEM_FERIADOS)).toBe(5);
    expect(diasUteisEntre('2026-09-04', '2026-09-11', comFeriado)).toBe(4);
  });

  it('não conta nada quando o fim é antes do início', () => {
    expect(diasUteisEntre('2026-09-10', '2026-09-01', SEM_FERIADOS)).toBe(0);
  });

  it('conta dias corridos para as tabelas de imposto', () => {
    expect(diasCorridosEntre('2026-01-01', '2026-12-31')).toBe(364);
    expect(diasCorridosEntre('2026-09-01', '2026-09-01')).toBe(0);
  });
});

describe('taxa da aplicação', () => {
  const cdb = {
    valorAplicado: 1000000,
    dataAplicacao: '2026-01-02',
    indexador: 'CDI' as const,
    percentualIndexador: 110,
    taxaPrefixada: null,
    isentoIR: false,
  };

  it('aplica o percentual sobre o indexador', () => {
    // 110% de um CDI de 10% a.a. = 11% a.a.
    expect(taxaAnual(cdb, 10)).toBeCloseTo(0.11);
  });

  it('usa a taxa contratada quando é prefixado', () => {
    expect(
      taxaAnual({ ...cdb, indexador: 'PREFIXADO', taxaPrefixada: 12 }, 10),
    ).toBeCloseTo(0.12);
  });

  it('sem taxa do indexador devolve null, não zero', () => {
    // Zero pareceria "não rendeu"; null é "ainda não sei" (§13.5).
    expect(taxaAnual(cdb, null)).toBeNull();
  });
});

describe('capitalização (§7.1)', () => {
  it('usa a convenção de 252 dias úteis', () => {
    // 252 dias úteis a 10% a.a. tem que devolver exatamente 10%.
    expect(saldoBruto(1000000, 0.1, 252)).toBe(1100000);
  });

  it('o fator diário é a raiz 252 da taxa anual', () => {
    expect((1 + fatorDiario(0.1)) ** 252 - 1).toBeCloseTo(0.1, 10);
  });

  it('sem dias úteis o saldo é o aplicado', () => {
    expect(saldoBruto(1000000, 0.1, 0)).toBe(1000000);
  });

  it('arredonda uma vez só, no fim', () => {
    // Arredondar dia a dia acumularia erro — é o arredondamento em cascata que
    // o §13.1 proíbe.
    const umDeCadaVez = saldoBruto(1000000, 0.12, 21);
    const direto = Math.round(1000000 * (1 + fatorDiario(0.12)) ** 21);
    expect(umDeCadaVez).toBe(direto);
  });
});

describe('imposto de renda (§7.2)', () => {
  it('segue a tabela regressiva', () => {
    expect(aliquotaDeIR(30, TABELA_IR)).toBe(0.225);
    expect(aliquotaDeIR(200, TABELA_IR)).toBe(0.2);
    expect(aliquotaDeIR(500, TABELA_IR)).toBe(0.175);
    expect(aliquotaDeIR(1000, TABELA_IR)).toBe(0.15);
  });

  it('acerta as bordas das faixas', () => {
    expect(aliquotaDeIR(180, TABELA_IR)).toBe(0.225);
    expect(aliquotaDeIR(181, TABELA_IR)).toBe(0.2);
    expect(aliquotaDeIR(720, TABELA_IR)).toBe(0.175);
    expect(aliquotaDeIR(721, TABELA_IR)).toBe(0.15);
  });
});

describe('IOF antes de 30 dias (§7.2)', () => {
  it('reproduz a tabela oficial', () => {
    expect(aliquotaDeIOF(1)).toBeCloseTo(0.96);
    expect(aliquotaDeIOF(10)).toBeCloseTo(0.66);
    expect(aliquotaDeIOF(29)).toBeCloseTo(0.03);
  });

  it('zera a partir do trigésimo dia', () => {
    expect(aliquotaDeIOF(30)).toBe(0);
    expect(aliquotaDeIOF(365)).toBe(0);
  });
});

describe('bruto x líquido (§7.2)', () => {
  const cdb = {
    valorAplicado: 1000000,
    dataAplicacao: '2025-09-01',
    indexador: 'CDI' as const,
    percentualIndexador: 100,
    taxaPrefixada: null,
    isentoIR: false,
  };

  it('imposto incide só sobre o rendimento, nunca sobre o principal', () => {
    const r = calcular(cdb, 10, '2026-09-01', SEM_FERIADOS, TABELA_IR);
    expect(r.rendimentoBruto).toBeGreaterThan(0);
    // IR de 17,5% na faixa de 361 a 720 dias, sobre o rendimento.
    expect(r.ir).toBe(Math.round(r.rendimentoBruto * 0.175));
    expect(r.saldoLiquido).toBe(r.saldoBruto - r.ir);
  });

  it('isento não paga IR', () => {
    const lci = calcular({ ...cdb, isentoIR: true }, 10, '2026-09-01', SEM_FERIADOS, TABELA_IR);
    expect(lci.ir).toBe(0);
    expect(lci.saldoLiquido).toBe(lci.saldoBruto);
  });

  it('resgate antes de 30 dias paga IOF, e o IOF reduz a base do IR', () => {
    const r = calcular(
      { ...cdb, dataAplicacao: '2026-08-20' },
      10,
      '2026-09-01',
      SEM_FERIADOS,
      TABELA_IR,
    );
    expect(r.iof).toBeGreaterThan(0);
    expect(r.ir).toBe(Math.round((r.rendimentoBruto - r.iof) * 0.225));
  });

  it('sem taxa conhecida devolve o aplicado e sinaliza que não sabe', () => {
    const r = calcular(cdb, null, '2026-09-01', SEM_FERIADOS, TABELA_IR);
    expect(r.taxaAnualUsada).toBeNull();
    expect(r.saldoBruto).toBe(cdb.valorAplicado);
    expect(r.rendimentoBruto).toBe(0);
  });

  it('o líquido é sempre menor ou igual ao bruto', () => {
    const r = calcular(cdb, 12, '2026-09-01', SEM_FERIADOS, TABELA_IR);
    expect(r.saldoLiquido).toBeLessThanOrEqual(r.saldoBruto);
    expect(r.saldoLiquido).toBeGreaterThan(cdb.valorAplicado);
  });
});
