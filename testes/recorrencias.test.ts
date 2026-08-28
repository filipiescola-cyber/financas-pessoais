import { describe, expect, it } from 'vitest';
import { vencimentosPendentes } from '../src/dominio/recorrencias';

describe('vencimentos pendentes de uma recorrência (§5.2, §13.3)', () => {
  it('gera um por mês entre a criação e hoje', () => {
    expect(vencimentosPendentes('2026-06-01', '2026-08-28', 10)).toEqual([
      '2026-06-10',
      '2026-07-10',
      '2026-08-10',
    ]);
  });

  it('NÃO gera vencimento futuro', () => {
    // Dia 20 ainda não chegou: a recorrência aparece no dia certo, não antes.
    expect(vencimentosPendentes('2026-08-01', '2026-08-15', 20)).toEqual([]);
  });

  it('gera no próprio dia do vencimento', () => {
    expect(vencimentosPendentes('2026-08-01', '2026-08-20', 20)).toEqual(['2026-08-20']);
  });

  it('não gera antes de a recorrência existir', () => {
    // Cadastrada dia 15, com vencimento dia 5: agosto já passou quando ela nasceu.
    expect(vencimentosPendentes('2026-08-15', '2026-09-30', 5)).toEqual(['2026-09-05']);
  });

  it('acerta retroativamente quem ficou 40 dias sem abrir o app', () => {
    const datas = vencimentosPendentes('2026-06-01', '2026-08-28', 5);
    expect(datas).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    expect(vencimentosPendentes('2026-01-01', '2026-04-30', 31)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('atravessa a virada de ano', () => {
    expect(vencimentosPendentes('2026-11-01', '2027-01-15', 10)).toEqual([
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
    ]);
  });

  it('não devolve nada quando a criação é depois da referência', () => {
    expect(vencimentosPendentes('2026-09-01', '2026-08-28', 10)).toEqual([]);
  });

  it('limita a janela retroativa para não gerar histórico infinito', () => {
    // Recorrência antiga e abandonada não pode despejar cinco anos de lançamentos.
    const datas = vencimentosPendentes('2020-01-01', '2026-08-28', 10);
    expect(datas.length).toBeLessThanOrEqual(13);
  });
});
