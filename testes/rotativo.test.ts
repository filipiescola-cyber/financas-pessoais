import { describe, expect, it } from 'vitest';
import { custoDoRotativo, rolandoPorMeses } from '../src/dominio/rotativo';

describe('custo do rotativo', () => {
  it('separa o que já foi despesa do que é custo novo', () => {
    // A regra do §4.7: só os juros são gasto novo. O principal que rola já foi
    // contado quando a compra aconteceu — recontá-lo dobraria o mês.
    const c = custoDoRotativo(100000, 0.14);
    expect(c.principal).toBe(100000);
    expect(c.juros).toBe(14000);
    expect(c.total).toBe(114000);
  });

  it('mostra a taxa ao ano, que é a que surpreende', () => {
    const c = custoDoRotativo(100000, 0.14);
    // 14% ao mês são quase 380% ao ano.
    expect(c.taxaAnual).toBeGreaterThan(3.7);
    expect(c.taxaAnual).toBeLessThan(3.9);
  });

  it('sem juros informados, o resto rola limpo', () => {
    const c = custoDoRotativo(50000, 0);
    expect(c.juros).toBe(0);
    expect(c.total).toBe(50000);
  });

  it('não inventa dívida a partir de fatura quitada', () => {
    const c = custoDoRotativo(0, 0.14);
    expect(c.total).toBe(0);
  });

  it('o sinal do restante não muda a conta', () => {
    expect(custoDoRotativo(-100000, 0.14).total).toBe(114000);
  });

  it('centavos: arredonda uma vez só, na formação dos juros', () => {
    const c = custoDoRotativo(1_00, 0.149);
    expect(c.juros).toBe(15);
    expect(c.total).toBe(115);
  });
});

describe('bola de neve', () => {
  it('juros sobre juros, não juros vezes meses', () => {
    // A intuição soma; a matemática multiplica. R$ 1.000 a 14% ao mês viram
    // mais do que R$ 1.000 + 12 × R$ 140.
    const doze = rolandoPorMeses(100000, 0.14, 12);
    expect(doze).toBeGreaterThan(100000 + 12 * 14000);
    expect(doze).toBe(Math.round(100000 * 1.14 ** 12));
  });

  it('zero mês é o próprio saldo', () => {
    expect(rolandoPorMeses(100000, 0.14, 0)).toBe(100000);
  });

  it('sem taxa, não cresce', () => {
    expect(rolandoPorMeses(100000, 0, 12)).toBe(100000);
  });
});
