import { describe, expect, it } from 'vitest';
import {
  ehCortavel,
  ehCustoDeVidaMinimo,
  entraNaProjecaoDeRenda,
  naturezaEfetiva,
  provisaoMensal,
} from '../src/dominio/natureza';

describe('natureza efetiva (§2.5)', () => {
  it('herda da categoria quando a transação não diz nada', () => {
    expect(naturezaEfetiva({ natureza: null }, { natureza: 'variavel' })).toBe('variavel');
  });

  it('a transação sobrescreve a categoria', () => {
    // Mercado é variável, mas a compra do mês da viagem pode ser eventual.
    expect(naturezaEfetiva({ natureza: 'eventual' }, { natureza: 'variavel' })).toBe('eventual');
  });

  it('sem categoria e sem transação, fica indefinida', () => {
    expect(naturezaEfetiva({ natureza: null }, null)).toBeNull();
    expect(naturezaEfetiva({ natureza: 'fixa' }, null)).toBe('fixa');
  });
});

describe('projeção de renda (§2.7, §8.3)', () => {
  it('só fixa e variável entram', () => {
    expect(entraNaProjecaoDeRenda('fixa')).toBe(true);
    expect(entraNaProjecaoDeRenda('variavel')).toBe(true);
  });

  it('EVENTUAL FICA DE FORA', () => {
    // Venda de bem pessoal, reembolso e restituição entram no caixa mas não são
    // renda. Uma venda de R$ 3.000 dentro da janela distorce a mediana e faz o
    // app dizer que dá para gastar mais do que dá.
    expect(entraNaProjecaoDeRenda('eventual')).toBe(false);
  });

  it('sem natureza definida também fica de fora', () => {
    expect(entraNaProjecaoDeRenda(null)).toBe(false);
  });
});

describe('blocos do dashboard (§2.5)', () => {
  it('custo de vida mínimo é a soma das fixas', () => {
    expect(ehCustoDeVidaMinimo('fixa')).toBe(true);
    expect(ehCustoDeVidaMinimo('variavel')).toBe(false);
    expect(ehCustoDeVidaMinimo('eventual')).toBe(false);
  });

  it('só as variáveis são cortáveis', () => {
    expect(ehCortavel('variavel')).toBe(true);
    expect(ehCortavel('fixa')).toBe(false);
  });
});

describe('provisão de eventual (§2.5)', () => {
  it('divide o anual por doze, em centavos inteiros', () => {
    // IPVA de R$ 1.800 vira R$ 150 por mês reservados.
    expect(provisaoMensal(180000)).toBe(15000);
  });

  it('arredonda para centavo em vez de deixar fração', () => {
    expect(provisaoMensal(100000)).toBe(8333);
  });
});
