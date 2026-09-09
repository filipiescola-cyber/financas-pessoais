import { describe, expect, it } from 'vitest';
import {
  completarUltimaParte,
  distribuirIgualmente,
  filhasDaDivisao,
  podeDividir,
  situacaoDaDivisao,
  type ParteDaDivisao,
} from '../src/dominio/divisao';

const parte = (valor: number, categoriaId: string | null = 'cat'): ParteDaDivisao => ({
  valor,
  categoriaId,
  descricao: '',
  motivoEmpresa: null,
});

describe('a soma das filhas bate com o pai', () => {
  it('fecha quando as partes somam o valor exato', () => {
    const s = situacaoDaDivisao(-8000, [parte(5000), parte(3000)]);
    expect(s.fecha).toBe(true);
    expect(s.sobra).toBe(0);
    expect(s.impedimento).toBeNull();
  });

  it('diz quanto falta, em vez de mandar conferir', () => {
    const s = situacaoDaDivisao(-8000, [parte(5000), parte(1760)]);
    expect(s.sobra).toBe(1240);
    expect(s.impedimento).toContain('12,40');
  });

  it('diz quanto passou, quando passa', () => {
    const s = situacaoDaDivisao(-8000, [parte(5000), parte(4000)]);
    expect(s.sobra).toBe(-1000);
    expect(s.impedimento).toContain('10,00');
  });

  it('o sinal do pai não muda a conta', () => {
    // Receita dividida usa exatamente a mesma aritmética da despesa.
    const despesa = situacaoDaDivisao(-8000, [parte(5000), parte(3000)]);
    const receita = situacaoDaDivisao(8000, [parte(5000), parte(3000)]);
    expect(receita).toEqual(despesa);
  });
});

describe('o que impede de salvar', () => {
  it('uma parte só não é divisão', () => {
    expect(situacaoDaDivisao(-8000, [parte(8000)]).impedimento).toContain('duas partes');
  });

  it('parte sem valor não passa', () => {
    // Zerada, ela não reparte nada e ainda ocupa uma linha do relatório.
    expect(situacaoDaDivisao(-8000, [parte(8000), parte(0)]).impedimento).toContain('valor');
  });

  it('lançamento sem valor não tem o que dividir', () => {
    expect(situacaoDaDivisao(0, [parte(0), parte(0)]).impedimento).toContain('sem valor');
  });

  it('categoria vazia é permitida: ela é opcional no app inteiro (§14)', () => {
    expect(situacaoDaDivisao(-8000, [parte(5000, null), parte(3000)]).impedimento).toBeNull();
  });
});

describe('arredondamento', () => {
  it('a sobra vai na última parte, como no parcelamento (§13.1)', () => {
    expect(distribuirIgualmente(-10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it('partes iguais sempre somam o total', () => {
    for (const total of [1, 7, 100, 8001, 123457]) {
      for (const n of [2, 3, 4, 7]) {
        const partes = distribuirIgualmente(total, n);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('completar joga a diferença na última e fecha a conta', () => {
    const partes = [parte(5000), parte(1000)];
    const completadas = completarUltimaParte(-8000, partes);

    expect(completadas[1]!.valor).toBe(3000);
    expect(situacaoDaDivisao(-8000, completadas).fecha).toBe(true);
  });

  it('completar não inventa valor quando a sobra negativa engoliria a última parte', () => {
    // Passou tanto que ajustar zeraria ou inverteria a última. Melhor devolver
    // como está e deixar o impedimento aparecer do que gravar um número que
    // ninguém digitou.
    const partes = [parte(9000), parte(500)];
    expect(completarUltimaParte(-8000, partes)).toEqual(partes);
  });
});

describe('as filhas prontas para gravar', () => {
  it('herdam o sinal do pai', () => {
    const filhas = filhasDaDivisao(-8000, [parte(5000), parte(3000)]);
    expect(filhas.map((f) => f.valor)).toEqual([-5000, -3000]);
  });

  it('em receita, o sinal também é o do pai', () => {
    const filhas = filhasDaDivisao(8000, [parte(5000), parte(3000)]);
    expect(filhas.map((f) => f.valor)).toEqual([5000, 3000]);
  });

  it('a parte da empresa vira transferência, não despesa (§2.6)', () => {
    // Comprar filamento não é você gastando — é você movendo patrimônio de um
    // bolso para outro. Como despesa, ela inflaria o custo de vida mínimo.
    const filhas = filhasDaDivisao(-8000, [
      parte(5000),
      { valor: 3000, categoriaId: null, descricao: 'Filamento', motivoEmpresa: 'giro' },
    ]);

    expect(filhas[0]!.ehTransferencia).toBe(false);
    expect(filhas[1]!.ehTransferencia).toBe(true);
    expect(filhas[1]!.motivoEmpresa).toBe('giro');
  });

  it('recusa gravar uma divisão que não fecha', () => {
    expect(() => filhasDaDivisao(-8000, [parte(5000), parte(1000)])).toThrow(/falta distribuir/i);
  });
});

describe('o que pode ser dividido', () => {
  const base = { tipo: 'despesa' as const, transacaoPaiId: null, valor: -8000 };

  it('despesa comum pode', () => {
    expect(podeDividir(base)).toBe(true);
  });

  it('receita também', () => {
    expect(podeDividir({ ...base, tipo: 'receita', valor: 8000 })).toBe(true);
  });

  it('transferência não: ela já é o movimento entre dois bolsos', () => {
    expect(podeDividir({ ...base, tipo: 'transferencia' })).toBe(false);
  });

  it('filha não: divisão de divisão viraria árvore', () => {
    expect(podeDividir({ ...base, transacaoPaiId: 'pai' })).toBe(false);
  });

  it('lançamento zerado não', () => {
    expect(podeDividir({ ...base, valor: 0 })).toBe(false);
  });
});
