import { describe, expect, it } from 'vitest';
import {
  calcularReserva,
  conferir,
  mereceAlerta,
  progressoDaMeta,
  progressoDoOrcamento,
} from '../src/dominio/orcamento';

describe('progresso do orçamento', () => {
  it('mede quanto do teto já foi gasto', () => {
    const p = progressoDoOrcamento(100000, 60000, '2026-08-15');
    expect(p.proporcaoGasta).toBeCloseTo(0.6);
    expect(p.restante).toBe(40000);
  });

  it('compara o gasto com o calendário, não só com o teto', () => {
    // 60% no dia 5 é problema; 60% no dia 25 é normal. Um número solto não
    // distingue os dois.
    expect(progressoDoOrcamento(100000, 60000, '2026-08-05').acimaDoRitmo).toBe(true);
    expect(progressoDoOrcamento(100000, 60000, '2026-08-25').acimaDoRitmo).toBe(false);
  });

  it('classifica dentro, atenção e estourado', () => {
    expect(progressoDoOrcamento(100000, 50000, '2026-08-10').situacao).toBe('dentro');
    expect(progressoDoOrcamento(100000, 80000, '2026-08-10').situacao).toBe('atencao');
    expect(progressoDoOrcamento(100000, 110000, '2026-08-10').situacao).toBe('estourado');
  });

  it('mostra restante negativo quando estoura, em vez de zerar', () => {
    // Esconder o quanto passou seria esconder a informação que interessa.
    expect(progressoDoOrcamento(100000, 130000, '2026-08-10').restante).toBe(-30000);
  });

  it('sem teto definido não inventa progresso', () => {
    const p = progressoDoOrcamento(0, 50000, '2026-08-10');
    expect(p.proporcaoGasta).toBe(0);
    expect(p.acimaDoRitmo).toBe(false);
  });

  it('usa os dias reais do mês', () => {
    // Fevereiro tem 28: o dia 14 é metade do mês, não 45%.
    expect(progressoDoOrcamento(100000, 0, '2026-02-14').proporcaoDoMes).toBeCloseTo(0.5);
  });
});

describe('quando vale alertar (§8.6)', () => {
  it('alerta em 80% antes do dia 20', () => {
    expect(mereceAlerta(progressoDoOrcamento(100000, 85000, '2026-08-12'), '2026-08-12')).toBe(true);
  });

  it('NÃO alerta em 80% depois do dia 20', () => {
    // Chegar em 80% no fim do mês é esperado. Avisar aí é ruído, e alerta que
    // dispara demais é silenciado — junto com o que importava.
    expect(mereceAlerta(progressoDoOrcamento(100000, 85000, '2026-08-25'), '2026-08-25')).toBe(false);
  });

  it('alerta estouro em qualquer dia', () => {
    expect(mereceAlerta(progressoDoOrcamento(100000, 120000, '2026-08-28'), '2026-08-28')).toBe(true);
  });

  it('não alerta categoria sem teto', () => {
    expect(mereceAlerta(progressoDoOrcamento(0, 500000, '2026-08-05'), '2026-08-05')).toBe(false);
  });
});

describe('progresso de meta', () => {
  it('mede o quanto falta', () => {
    const p = progressoDaMeta(1000000, 250000);
    expect(p.proporcao).toBeCloseTo(0.25);
    expect(p.falta).toBe(750000);
    expect(p.concluida).toBe(false);
  });

  it('trava em 100% quando passa do alvo', () => {
    const p = progressoDaMeta(1000000, 1200000);
    expect(p.proporcao).toBe(1);
    expect(p.falta).toBe(0);
    expect(p.concluida).toBe(true);
  });
});

describe('reserva de emergência (§8.8)', () => {
  it('mede em meses de custo fixo, não em reais', () => {
    const reserva = calcularReserva(800000, 250000, false);
    expect(reserva.mesesCobertos).toBeCloseTo(3.2);
  });

  it('usa 6 meses de referência para renda irregular', () => {
    // A receita pode sumir por um período inteiro, então a régua é outra.
    expect(calcularReserva(800000, 250000, true).referencia).toBe(6);
    expect(calcularReserva(800000, 250000, false).referencia).toBe(3);
  });

  it('a mesma reserva é suficiente para renda fixa e insuficiente para variável', () => {
    expect(calcularReserva(800000, 250000, false).suficiente).toBe(true);
    expect(calcularReserva(800000, 250000, true).suficiente).toBe(false);
  });

  it('sem custo fixo cadastrado diz que não sabe, em vez de inventar', () => {
    const reserva = calcularReserva(800000, 0, false);
    expect(reserva.mesesCobertos).toBeNull();
    expect(reserva.suficiente).toBe(false);
  });
});

describe('conferência de saldo (§5.3)', () => {
  it('mostra a diferença entre o app e o extrato', () => {
    const c = conferir(150000, 148000);
    expect(c.diferenca).toBe(-2000);
    expect(c.bate).toBe(false);
  });

  it('o sinal da diferença é o valor do lançamento de ajuste', () => {
    // Banco com mais do que o app achava: entra dinheiro no ajuste.
    expect(conferir(150000, 152000).diferenca).toBe(2000);
  });

  it('reconhece quando bate', () => {
    expect(conferir(150000, 150000).bate).toBe(true);
  });
});
