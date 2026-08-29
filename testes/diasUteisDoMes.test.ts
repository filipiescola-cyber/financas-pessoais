import { describe, expect, it } from 'vitest';
import { diaUtilDoMes, diasUteisDoMes } from '../src/dominio/diasUteis';

// O calendário bancário de 2026, como a BrasilAPI entrega e a tabela `feriados`
// guarda: inclui Carnaval, Sexta-feira Santa e Corpus Christi, que são ponto
// facultativo por lei mas dia sem banco na prática.
const FERIADOS_2026 = new Set([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-04-03',
  '2026-04-21',
  '2026-05-01',
  '2026-06-04',
  '2026-09-07',
  '2026-10-12',
  '2026-11-02',
  '2026-11-15',
  '2026-11-20',
  '2026-12-25',
]);

describe('dia útil do mês', () => {
  it('conta do começo pulando fim de semana', () => {
    // 01/03/2026 é domingo: o 1º dia útil é 02, o 3º é 04.
    expect(diaUtilDoMes('2026-03-01', 1, 'inicio', FERIADOS_2026)).toBe('2026-03-02');
    expect(diaUtilDoMes('2026-03-01', 3, 'inicio', FERIADOS_2026)).toBe('2026-03-04');
  });

  it('pula feriado, não só fim de semana', () => {
    // 07/09/2026 é segunda e é feriado: o 5º dia útil vai de 07 para 08.
    expect(diaUtilDoMes('2026-09-01', 5, 'inicio', FERIADOS_2026)).toBe('2026-09-08');
  });

  it('conta do fim para trás', () => {
    // 31/05/2026 é domingo: o último dia útil de maio é sexta, 29.
    expect(diaUtilDoMes('2026-05-01', 1, 'fim', FERIADOS_2026)).toBe('2026-05-29');
    expect(diaUtilDoMes('2026-05-01', 3, 'fim', FERIADOS_2026)).toBe('2026-05-27');
  });

  it('o Carnaval encurta fevereiro', () => {
    const semFeriado = diasUteisDoMes('2026-02-01', new Set<string>());
    const comFeriado = diasUteisDoMes('2026-02-01', FERIADOS_2026);
    expect(semFeriado.length - comFeriado.length).toBe(2);
  });

  it('ordinal fora de faixa cai no último disponível, sem estourar', () => {
    const uteis = diasUteisDoMes('2026-02-01', FERIADOS_2026);
    expect(diaUtilDoMes('2026-02-01', 99, 'inicio', FERIADOS_2026)).toBe(uteis[uteis.length - 1]);
    expect(diaUtilDoMes('2026-02-01', 0, 'inicio', FERIADOS_2026)).toBe(uteis[0]);
  });

  it('sem calendário carregado, sobra o fim de semana', () => {
    // Degradação explícita: 07/09 vira dia útil se a tabela estiver vazia.
    expect(diaUtilDoMes('2026-09-01', 5, 'inicio', new Set<string>())).toBe('2026-09-07');
  });
});
