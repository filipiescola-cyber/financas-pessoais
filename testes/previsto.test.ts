import { describe, expect, it } from 'vitest';
import {
  chaveDaOcorrencia,
  previstoDoMes,
  resumirPrevisto,
  type RecorrenciaPrevista,
} from '../src/dominio/previsto';

const salario: RecorrenciaPrevista = {
  id: 'r1',
  descricao: 'Salário',
  tipo: 'receita',
  valorPrevisto: 600000,
  dia: 27,
};

const aluguel: RecorrenciaPrevista = {
  id: 'r2',
  descricao: 'Aluguel',
  tipo: 'despesa',
  valorPrevisto: 150000,
  dia: 5,
};

const MES = '2026-08-01';

describe('previsto do mês', () => {
  it('marca como atrasado o que já venceu e não foi lançado', () => {
    // O caso que motivou a tela: recorrência cadastrada depois do vencimento
    // nunca é gerada sozinha, e sem isto some.
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-28');
    expect(itens[0]?.situacao).toBe('atrasado');
    expect(itens[0]?.dataPrevista).toBe('2026-08-27');
  });

  it('marca como aguardando o que ainda vai vencer', () => {
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-20');
    expect(itens[0]?.situacao).toBe('aguardando');
  });

  it('marca como lançado o que já existe', () => {
    const jaLancadas = new Set([chaveDaOcorrencia('r1', '2026-08-27')]);
    const itens = previstoDoMes([salario], jaLancadas, MES, '2026-08-28');
    expect(itens[0]?.situacao).toBe('lancado');
  });

  it('vencimento no próprio dia de hoje conta como atrasado, não aguardando', () => {
    // Se venceu hoje e não foi lançado, é pendência de hoje — e é hoje que o
    // usuário pode resolver.
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-27');
    expect(itens[0]?.situacao).toBe('atrasado');
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    const dia31 = { ...salario, dia: 31 };
    expect(previstoDoMes([dia31], new Set(), '2026-02-01', '2026-02-10')[0]?.dataPrevista).toBe(
      '2026-02-28',
    );
  });

  it('ordena por data, não pela ordem do cadastro', () => {
    const itens = previstoDoMes([salario, aluguel], new Set(), MES, '2026-08-28');
    expect(itens.map((i) => i.descricao)).toEqual(['Aluguel', 'Salário']);
  });
});

describe('resumo do previsto', () => {
  it('separa o que já aconteceu do que falta', () => {
    const jaLancadas = new Set([chaveDaOcorrencia('r2', '2026-08-05')]);
    const resumo = resumirPrevisto(previstoDoMes([salario, aluguel], jaLancadas, MES, '2026-08-28'));

    expect(resumo.saiuPrevisto).toBe(150000);
    expect(resumo.faltaEntrar).toBe(600000);
    expect(resumo.entrouPrevisto).toBe(0);
    expect(resumo.faltaSair).toBe(0);
  });

  it('conta quantos estão atrasados', () => {
    const resumo = resumirPrevisto(previstoDoMes([salario, aluguel], new Set(), MES, '2026-08-28'));
    expect(resumo.atrasados).toBe(2);
  });

  it('recorrência sem valor previsto não entra em soma nenhuma', () => {
    // Somar zero por ela faria o "falta entrar" parecer menor do que é. Ela
    // aparece na lista para ser lançada com o número certo.
    const variavel: RecorrenciaPrevista = { ...salario, valorPrevisto: null };
    const resumo = resumirPrevisto(previstoDoMes([variavel], new Set(), MES, '2026-08-28'));
    expect(resumo.faltaEntrar).toBe(0);
    expect(resumo.atrasados).toBe(1);
  });
});
