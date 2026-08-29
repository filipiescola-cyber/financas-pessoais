import { describe, expect, it } from 'vitest';
import {
  dataDaOcorrencia,
  repeticoesRestantes,
  rotuloDoDia,
  terminoParaRepeticoes,
  vencimentosPendentes,
} from '../src/dominio/recorrencias';

const FERIADOS = new Set(['2026-01-01', '2026-09-07', '2026-11-20', '2026-12-25']);

describe('vencimentos pendentes de uma recorrência (§5.2, §13.3)', () => {
  it('gera um por mês entre a criação e hoje', () => {
    expect(vencimentosPendentes('2026-06-01', '2026-08-28', { dia: 10, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual([
      '2026-06-10',
      '2026-07-10',
      '2026-08-10',
    ]);
  });

  it('NÃO gera vencimento futuro', () => {
    // Dia 20 ainda não chegou: a recorrência aparece no dia certo, não antes.
    expect(vencimentosPendentes('2026-08-01', '2026-08-15', { dia: 20, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual([]);
  });

  it('gera no próprio dia do vencimento', () => {
    expect(vencimentosPendentes('2026-08-01', '2026-08-20', { dia: 20, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual(['2026-08-20']);
  });

  it('não gera antes de a recorrência existir', () => {
    // Cadastrada dia 15, com vencimento dia 5: agosto já passou quando ela nasceu.
    expect(vencimentosPendentes('2026-08-15', '2026-09-30', { dia: 5, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual(['2026-09-05']);
  });

  it('acerta retroativamente quem ficou 40 dias sem abrir o app', () => {
    const datas = vencimentosPendentes('2026-06-01', '2026-08-28', { dia: 5, regra: 'fixo', terminaEm: null }, FERIADOS);
    expect(datas).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    expect(vencimentosPendentes('2026-01-01', '2026-04-30', { dia: 31, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('atravessa a virada de ano', () => {
    expect(vencimentosPendentes('2026-11-01', '2027-01-15', { dia: 10, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual([
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
    ]);
  });

  it('não devolve nada quando a criação é depois da referência', () => {
    expect(vencimentosPendentes('2026-09-01', '2026-08-28', { dia: 10, regra: 'fixo', terminaEm: null }, FERIADOS)).toEqual([]);
  });

  it('limita a janela retroativa para não gerar histórico infinito', () => {
    // Recorrência antiga e abandonada não pode despejar cinco anos de lançamentos.
    const datas = vencimentosPendentes('2020-01-01', '2026-08-28', { dia: 10, regra: 'fixo', terminaEm: null }, FERIADOS);
    expect(datas.length).toBeLessThanOrEqual(13);
  });
});

describe('regra do dia', () => {
  it('fixo continua sendo a data do calendário', () => {
    expect(dataDaOcorrencia('2026-09-01', 10, 'fixo', FERIADOS)).toBe('2026-09-10');
  });

  it('dia útil conta do começo, pulando feriado', () => {
    // 07/09/2026 é segunda e é feriado: o 5º dia útil vai para 08.
    expect(dataDaOcorrencia('2026-09-01', 5, 'dia_util', FERIADOS)).toBe('2026-09-08');
  });

  it('dia útil do fim conta para trás', () => {
    // 31/05/2026 é domingo; o último dia útil é sexta, 29.
    expect(dataDaOcorrencia('2026-05-01', 3, 'dia_util_do_fim', FERIADOS)).toBe('2026-05-27');
  });

  it('rótulo diz de onde se conta', () => {
    expect(rotuloDoDia(10, 'fixo')).toBe('todo dia 10');
    expect(rotuloDoDia(5, 'dia_util')).toBe('5º dia útil');
    expect(rotuloDoDia(1, 'dia_util_do_fim')).toBe('último dia útil');
    expect(rotuloDoDia(3, 'dia_util_do_fim')).toBe('3º dia útil antes do fim');
  });
});

describe('prazo', () => {
  it('para de gerar depois do término', () => {
    const datas = vencimentosPendentes(
      '2026-01-10',
      '2026-12-31',
      { dia: 10, regra: 'fixo', terminaEm: '2026-03-10' },
      FERIADOS,
    );
    expect(datas).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });

  it('sem término, gera até a data de hoje', () => {
    const datas = vencimentosPendentes('2026-01-10', '2026-04-15', { dia: 10, regra: 'fixo', terminaEm: null }, FERIADOS);
    expect(datas).toHaveLength(4);
  });

  it('N repetições viram a data da última', () => {
    // 12x a partir de janeiro termina em dezembro do mesmo ano.
    expect(terminoParaRepeticoes('2026-01-01', 10, 'fixo', 12, FERIADOS)).toBe('2026-12-10');
  });

  it('a contagem começa na PRÓXIMA ocorrência, não no mês corrente já vencido', () => {
    // Dia 10 já passou em 15/01: a 1ª das 3 é fevereiro, a última é abril.
    expect(terminoParaRepeticoes('2026-01-15', 10, 'fixo', 3, FERIADOS)).toBe('2026-04-10');
  });

  it('repetições e término são a mesma informação, ida e volta', () => {
    const fim = terminoParaRepeticoes('2026-01-01', 10, 'fixo', 36, FERIADOS);
    expect(repeticoesRestantes('2026-01-01', fim, 10, 'fixo', FERIADOS)).toBe(36);
  });

  it('quantas ainda faltam encolhe conforme o tempo passa', () => {
    const fim = terminoParaRepeticoes('2026-01-01', 10, 'fixo', 12, FERIADOS);
    expect(repeticoesRestantes('2026-07-01', fim, 10, 'fixo', FERIADOS)).toBe(6);
    expect(repeticoesRestantes('2026-12-11', fim, 10, 'fixo', FERIADOS)).toBe(0);
  });

  it('prazo também vale com regra de dia útil', () => {
    const fim = terminoParaRepeticoes('2026-01-01', 1, 'dia_util', 3, FERIADOS);
    expect(fim).toBe('2026-03-02'); // 1º dia útil de março (dom. 01 → seg. 02)
    const datas = vencimentosPendentes(
      '2026-01-01',
      '2026-12-31',
      { dia: 1, regra: 'dia_util', terminaEm: fim },
      FERIADOS,
    );
    expect(datas).toHaveLength(3);
  });
});
