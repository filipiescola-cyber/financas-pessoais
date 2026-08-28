import { describe, expect, it } from 'vitest';
import {
  dividirEmParcelas,
  gerarParcelas,
  gerarParcelasRestantes,
} from '../src/dominio/parcelas';

const soma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);

describe('divisão em parcelas (§2.2, §13.1)', () => {
  it('joga a diferença na última parcela', () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it('divide exato quando não sobra resto', () => {
    expect(dividirEmParcelas(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
  });

  it('em 1x devolve o valor inteiro', () => {
    expect(dividirEmParcelas(9999, 1)).toEqual([9999]);
  });

  it('preserva o sinal da despesa', () => {
    // Valor negativo = saída (§3).
    expect(dividirEmParcelas(-10000, 3)).toEqual([-3333, -3333, -3334]);
  });

  it('A SOMA SEMPRE BATE COM O TOTAL', () => {
    // A regra que não pode falhar em nenhuma combinação.
    for (let total = 1; total <= 400; total += 1) {
      for (let n = 1; n <= 24; n += 1) {
        expect(soma(dividirEmParcelas(total, n))).toBe(total);
        expect(soma(dividirEmParcelas(-total, n))).toBe(-total);
      }
    }
  });

  it('recusa entrada inválida em vez de produzir número errado', () => {
    expect(() => dividirEmParcelas(10000, 0)).toThrow();
    expect(() => dividirEmParcelas(10000, -3)).toThrow();
    expect(() => dividirEmParcelas(10000, 2.5)).toThrow();
    expect(() => dividirEmParcelas(100.5, 2)).toThrow();
  });
});

describe('geração das parcelas de uma compra', () => {
  it('gera uma por mês a partir da competência informada', () => {
    const parcelas = gerarParcelas(-30000, 3, '2026-08-27');
    expect(parcelas).toEqual([
      { numero: 1, total: 3, valor: -10000, dataCompetencia: '2026-08-27' },
      { numero: 2, total: 3, valor: -10000, dataCompetencia: '2026-09-27' },
      { numero: 3, total: 3, valor: -10000, dataCompetencia: '2026-10-27' },
    ]);
  });

  it('respeita meses curtos ao avançar', () => {
    const parcelas = gerarParcelas(-20000, 2, '2026-01-31');
    expect(parcelas[1]?.dataCompetencia).toBe('2026-02-28');
  });

  it('12x atravessa o ano e a soma continua batendo', () => {
    const parcelas = gerarParcelas(-119999, 12, '2026-08-27');
    expect(parcelas).toHaveLength(12);
    expect(parcelas[11]?.dataCompetencia).toBe('2027-07-27');
    expect(soma(parcelas.map((p) => p.valor))).toBe(-119999);
  });
});

describe('parcelamento já em andamento (§4.1, passo 5)', () => {
  it('gera só as restantes, mantendo a numeração original', () => {
    // "R$ 250 por mês, já paguei 4 de 10." Faltam 6, numeradas de 5 a 10.
    const restantes = gerarParcelasRestantes(-25000, 4, 10, '2026-09-05');
    expect(restantes).toHaveLength(6);
    expect(restantes[0]).toEqual({
      numero: 5,
      total: 10,
      valor: -25000,
      dataCompetencia: '2026-09-05',
    });
    expect(restantes[5]).toEqual({
      numero: 10,
      total: 10,
      valor: -25000,
      dataCompetencia: '2027-02-05',
    });
  });

  it('não divide nada: o valor da parcela é informado pelo usuário', () => {
    const restantes = gerarParcelasRestantes(-33333, 1, 3, '2026-09-01');
    expect(restantes.map((p) => p.valor)).toEqual([-33333, -33333]);
  });

  it('recusa combinação impossível', () => {
    expect(() => gerarParcelasRestantes(-1000, 10, 10, '2026-09-01')).toThrow();
    expect(() => gerarParcelasRestantes(-1000, 11, 10, '2026-09-01')).toThrow();
    expect(() => gerarParcelasRestantes(-1000, -1, 10, '2026-09-01')).toThrow();
  });
});
