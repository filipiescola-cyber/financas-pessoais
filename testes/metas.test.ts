import { describe, expect, it } from 'vitest';
import { mesesParaAlcancar, origemDoValor, projetarMeta } from '../src/dominio/metas';

const HOJE = '2026-08-28';

describe('quanto guardar por mês', () => {
  it('divide o que falta pelos meses até o prazo', () => {
    // Faltam R$ 6.000 e restam 6 meses: R$ 1.000 por mês.
    const p = projetarMeta(1000000, 400000, '2027-02-15', HOJE);
    expect(p.falta).toBe(600000);
    expect(p.mesesRestantes).toBe(6);
    expect(p.mensalNecessario).toBe(100000);
  });

  it('arredonda para cima, senão faltam centavos no fim', () => {
    const p = projetarMeta(100000, 0, '2026-11-01', HOJE);
    expect(p.mesesRestantes).toBe(3);
    expect(p.mensalNecessario).toBe(33334);
  });

  it('sem prazo não inventa um valor mensal', () => {
    // "Juntar R$ 20.000" sem data não é meta, é desejo: não há por quanto dividir.
    const p = projetarMeta(2000000, 0, null, HOJE);
    expect(p.mensalNecessario).toBeNull();
    expect(p.mesesRestantes).toBeNull();
  });

  it('prazo no mês corrente cobra tudo de uma vez, sem dividir por zero', () => {
    const p = projetarMeta(500000, 100000, '2026-08-31', HOJE);
    expect(p.mesesRestantes).toBe(0);
    expect(p.mensalNecessario).toBe(400000);
  });

  it('marca o prazo vencido em vez de mostrar número negativo', () => {
    const p = projetarMeta(500000, 100000, '2026-06-01', HOJE);
    expect(p.prazoVencido).toBe(true);
    expect(p.mensalNecessario).toBe(400000);
  });

  it('meta concluída não pede mais nada, mesmo com prazo passado', () => {
    const p = projetarMeta(500000, 500000, '2026-06-01', HOJE);
    expect(p.concluida).toBe(true);
    expect(p.falta).toBe(0);
    expect(p.mensalNecessario).toBe(0);
    expect(p.prazoVencido).toBe(false);
  });

  it('passar do alvo não vira falta negativa', () => {
    expect(projetarMeta(500000, 700000, '2027-01-01', HOJE).falta).toBe(0);
  });
});

describe('pergunta inversa: quando eu chego lá', () => {
  it('divide o que falta pelo aporte mensal', () => {
    expect(mesesParaAlcancar(600000, 100000)).toBe(6);
  });

  it('arredonda para cima: sobra de mês é mês', () => {
    expect(mesesParaAlcancar(650000, 100000)).toBe(7);
  });

  it('sem aporte, não chega nunca — e diz isso em vez de devolver infinito', () => {
    expect(mesesParaAlcancar(600000, 0)).toBeNull();
  });

  it('meta já alcançada leva zero mês', () => {
    expect(mesesParaAlcancar(0, 100000)).toBe(0);
  });
});

describe('de onde vem o quanto já tem', () => {
  it('vinculada a uma conta, o valor é observado', () => {
    expect(origemDoValor('conta-1')).toBe('conta');
  });

  it('sem vínculo, é um número declarado — e a tela precisa dizer', () => {
    // Meta com R$ 1.200 guardados que não correspondem a saldo nenhum é um
    // número em que o usuário acredita, não um fato.
    expect(origemDoValor(null)).toBe('declarado');
  });
});
