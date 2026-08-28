import { describe, expect, it } from 'vitest';
import {
  comparar,
  diaNoMes,
  diasNoMes,
  ehDataValida,
  ehFuturo,
  ehPassadoOuHoje,
  formatarBR,
  hoje,
  ontem,
  primeiroDiaDoMes,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
} from '../src/dominio/datas';

describe('hoje em America/Sao_Paulo (§13.1)', () => {
  it('usa o fuso de Brasília, não UTC', () => {
    // 27/08/2026 às 23h de Brasília já é dia 28 em UTC. O app tem que dizer 27:
    // lançar um gasto às 21h não pode cair no dia seguinte.
    const vinteETresDeBrasilia = new Date('2026-08-28T02:00:00Z');
    expect(hoje(vinteETresDeBrasilia)).toBe('2026-08-27');
  });

  it('vira o dia na hora certa', () => {
    expect(hoje(new Date('2026-08-28T02:59:59Z'))).toBe('2026-08-27');
    expect(hoje(new Date('2026-08-28T03:00:00Z'))).toBe('2026-08-28');
  });

  it('ontem é o dia anterior', () => {
    expect(ontem(new Date('2026-01-01T15:00:00Z'))).toBe('2025-12-31');
  });
});

describe('somar meses com dia inválido (§4.2)', () => {
  it('31 de janeiro mais um mês cai no último dia de fevereiro', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('não propaga o dia truncado para os meses seguintes', () => {
    // Contar sempre a partir da data original, nunca encadeando.
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
    expect(somarMeses('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('atravessa a virada de ano', () => {
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('doze meses voltam ao mesmo dia', () => {
    expect(somarMeses('2026-08-27', 12)).toBe('2027-08-27');
  });
});

describe('limites de mês', () => {
  it('conta os dias de cada mês', () => {
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2024, 2)).toBe(29);
    expect(diasNoMes(2026, 4)).toBe(30);
    expect(diasNoMes(2026, 12)).toBe(31);
  });

  it('devolve primeiro e último dia', () => {
    expect(primeiroDiaDoMes('2026-08-27')).toBe('2026-08-01');
    expect(ultimoDiaDoMes('2026-02-10')).toBe('2026-02-28');
  });

  it('fechamento no dia 31 vira o último dia do mês (§4.2)', () => {
    expect(diaNoMes('2026-02-10', 31)).toBe('2026-02-28');
    expect(diaNoMes('2026-03-10', 31)).toBe('2026-03-31');
    expect(diaNoMes('2026-04-10', 31)).toBe('2026-04-30');
  });
});

describe('somar dias', () => {
  it('atravessa mês e ano', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(somarDias('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('comparação', () => {
  it('ordena como texto porque o formato é ordenável', () => {
    expect(comparar('2026-01-01', '2026-02-01')).toBeLessThan(0);
    expect(comparar('2026-02-01', '2026-01-01')).toBeGreaterThan(0);
    expect(comparar('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('separa passado de futuro (§13.2)', () => {
    expect(ehPassadoOuHoje('2026-08-27', '2026-08-27')).toBe(true);
    expect(ehPassadoOuHoje('2026-08-28', '2026-08-27')).toBe(false);
    expect(ehFuturo('2026-09-01', '2026-08-27')).toBe(true);
  });
});

describe('validação e exibição', () => {
  it('recusa data inexistente', () => {
    expect(ehDataValida('2026-02-30')).toBe(false);
    expect(ehDataValida('2026-13-01')).toBe(false);
    expect(ehDataValida('27/08/2026')).toBe(false);
    expect(ehDataValida('2026-02-28')).toBe(true);
  });

  it('formata para leitura', () => {
    expect(formatarBR('2026-08-27')).toBe('27/08/2026');
  });
});
