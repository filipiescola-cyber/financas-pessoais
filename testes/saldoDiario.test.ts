import { describe, expect, it } from 'vitest';
import { saldosAoFimDoDia, temMovimentoAdiado } from '../src/dominio/saldoDiario';

const m = (valor: number, dataCaixa: string, transacaoPaiId: string | null = null) => ({
  valor,
  dataCaixa,
  transacaoPaiId,
});

describe('saldo ao fim do dia', () => {
  it('acumula a partir do saldo de abertura', () => {
    const saldos = saldosAoFimDoDia(
      100000,
      [m(-2500, '2026-08-10'), m(50000, '2026-08-12')],
      ['2026-08-10', '2026-08-12'],
    );
    expect(saldos.get('2026-08-10')).toBe(97500);
    expect(saldos.get('2026-08-12')).toBe(147500);
  });

  it('dia sem movimento repete o saldo anterior, não zera', () => {
    // A lista mostra dias por competência; alguns não têm movimento de caixa.
    // Zerar ali seria dizer que o dinheiro sumiu e voltou.
    const saldos = saldosAoFimDoDia(
      100000,
      [m(-2500, '2026-08-10')],
      ['2026-08-10', '2026-08-11', '2026-08-12'],
    );
    expect(saldos.get('2026-08-11')).toBe(97500);
    expect(saldos.get('2026-08-12')).toBe(97500);
  });

  it('acumula na ordem das datas, não na ordem em que chegaram', () => {
    const saldos = saldosAoFimDoDia(
      0,
      [m(300, '2026-08-12'), m(100, '2026-08-10')],
      ['2026-08-12', '2026-08-10'],
    );
    expect(saldos.get('2026-08-10')).toBe(100);
    expect(saldos.get('2026-08-12')).toBe(400);
  });

  it('IGNORA filha de divisão (§5.5)', () => {
    // O pai já moveu o saldo; contar as filhas dobraria a saída.
    const saldos = saldosAoFimDoDia(
      0,
      [m(-20000, '2026-08-10'), m(-12000, '2026-08-10', 'pai'), m(-8000, '2026-08-10', 'pai')],
      ['2026-08-10'],
    );
    expect(saldos.get('2026-08-10')).toBe(-20000);
  });

  it('sem movimento nenhum, todo dia fica no saldo de abertura', () => {
    const saldos = saldosAoFimDoDia(50000, [], ['2026-08-10', '2026-08-11']);
    expect(saldos.get('2026-08-11')).toBe(50000);
  });

  it('movimento fora dos dias pedidos não entra', () => {
    // O acumulado do que veio antes já está no saldo de abertura; somar de novo
    // contaria duas vezes.
    const saldos = saldosAoFimDoDia(1000, [m(-500, '2026-07-30')], ['2026-08-10']);
    expect(saldos.get('2026-08-10')).toBe(1000);
  });
});

describe('aviso de movimento adiado', () => {
  it('reconhece compra no cartão, que acontece hoje e sai depois', () => {
    expect(
      temMovimentoAdiado([{ dataCompetencia: '2026-08-10', dataCaixa: '2026-09-10' }]),
    ).toBe(true);
  });

  it('gasto na conta corrente não é adiado', () => {
    expect(
      temMovimentoAdiado([{ dataCompetencia: '2026-08-10', dataCaixa: '2026-08-10' }]),
    ).toBe(false);
  });
});
