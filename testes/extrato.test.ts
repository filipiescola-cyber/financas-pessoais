import { describe, expect, it } from 'vitest';
import { extratoDoMes } from '../src/dominio/extrato';
import type { MovimentoDeCaixa } from '../src/dominio/saldoDiario';

const mov = (dataCaixa: string, valor: number, transacaoPaiId: string | null = null):
  MovimentoDeCaixa => ({ valor, dataCaixa, transacaoPaiId });

describe('extrato do mês', () => {
  it('abre no âncora quando não há ponte', () => {
    const e = extratoDoMes({
      ancora: 100000,
      movimentosAteOMes: [],
      movimentosDoMes: [mov('2026-09-10', -30000)],
      dias: ['2026-09-10'],
    });
    expect(e.abertura).toBe(100000);
    expect(e.saldos.get('2026-09-10')).toBe(70000);
    expect(e.fechamento).toBe(70000);
  });

  it('o fechamento de um mês é a abertura do seguinte', () => {
    // A emenda que desencontrou duas vezes na tela.
    const setembro = [mov('2026-09-05', -20000), mov('2026-09-28', -15000)];
    const outubro = [mov('2026-10-09', -50000)];

    const s = extratoDoMes({
      ancora: 100000,
      movimentosAteOMes: [],
      movimentosDoMes: setembro,
      dias: ['2026-09-05', '2026-09-28'],
    });
    const o = extratoDoMes({
      ancora: 100000,
      movimentosAteOMes: setembro,
      movimentosDoMes: outubro,
      dias: ['2026-10-09'],
    });

    expect(o.abertura).toBe(s.fechamento);
    expect(o.abertura).toBe(65000);
  });

  it('movimento em dia sem linha na lista continua no fechamento', () => {
    // O vazamento: a saída existia na ponte do mês seguinte e sumia do
    // acumulado deste, porque o dia dela não tinha linha para mostrar.
    const setembro = [mov('2026-09-05', -20000), mov('2026-09-30', -80000)];

    const s = extratoDoMes({
      ancora: 100000,
      movimentosAteOMes: [],
      movimentosDoMes: setembro,
      dias: ['2026-09-05'],
    });

    expect(s.saldos.get('2026-09-05')).toBe(80000);
    expect(s.fechamento).toBe(0);

    const o = extratoDoMes({
      ancora: 100000,
      movimentosAteOMes: setembro,
      movimentosDoMes: [],
      dias: [],
    });
    expect(o.abertura).toBe(s.fechamento);
  });

  it('dia sem movimento repete o saldo do dia anterior', () => {
    const e = extratoDoMes({
      ancora: 50000,
      movimentosAteOMes: [],
      movimentosDoMes: [mov('2026-09-05', -10000)],
      dias: ['2026-09-05', '2026-09-20'],
    });
    expect(e.saldos.get('2026-09-20')).toBe(40000);
  });

  it('filha de divisão não soma duas vezes', () => {
    const e = extratoDoMes({
      ancora: 50000,
      movimentosAteOMes: [mov('2026-08-01', -10000), mov('2026-08-01', -6000, 'pai')],
      movimentosDoMes: [mov('2026-09-05', -4000), mov('2026-09-05', -4000, 'pai')],
      dias: ['2026-09-05'],
    });
    expect(e.abertura).toBe(40000);
    expect(e.fechamento).toBe(36000);
  });
});
