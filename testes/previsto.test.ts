import { describe, expect, it } from 'vitest';
import {
  chaveDaOcorrencia,
  previstoAteOMes,
  previstoDoMes,
  previstoNoCaixaDoMes,
  resumirPrevisto,
  type RecorrenciaPrevista,
} from '../src/dominio/previsto';

const FERIADOS = new Set(['2026-09-07']);

const salario: RecorrenciaPrevista = {
  id: 'r1',
  descricao: 'Salário',
  tipo: 'receita',
  valorPrevisto: 600000,
  dia: 27,
  regra: 'fixo',
  comecaEm: '2020-01-01',
  terminaEm: null,
};

const aluguel: RecorrenciaPrevista = {
  id: 'r2',
  descricao: 'Aluguel',
  tipo: 'despesa',
  valorPrevisto: 150000,
  dia: 5,
  regra: 'fixo',
  comecaEm: '2020-01-01',
  terminaEm: null,
};

const MES = '2026-08-01';

describe('previsto do mês', () => {
  it('marca como atrasado o que já venceu e não foi lançado', () => {
    // O caso que motivou a tela: recorrência cadastrada depois do vencimento
    // nunca é gerada sozinha, e sem isto some.
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-28', FERIADOS);
    expect(itens[0]?.situacao).toBe('atrasado');
    expect(itens[0]?.dataPrevista).toBe('2026-08-27');
  });

  it('marca como aguardando o que ainda vai vencer', () => {
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-20', FERIADOS);
    expect(itens[0]?.situacao).toBe('aguardando');
  });

  it('marca como lançado o que já existe', () => {
    const jaLancadas = new Set([chaveDaOcorrencia('r1', '2026-08-27')]);
    const itens = previstoDoMes([salario], jaLancadas, MES, '2026-08-28', FERIADOS);
    expect(itens[0]?.situacao).toBe('lancado');
  });

  it('vencimento no próprio dia de hoje conta como atrasado, não aguardando', () => {
    // Se venceu hoje e não foi lançado, é pendência de hoje — e é hoje que o
    // usuário pode resolver.
    const itens = previstoDoMes([salario], new Set(), MES, '2026-08-27', FERIADOS);
    expect(itens[0]?.situacao).toBe('atrasado');
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    const dia31 = { ...salario, dia: 31 };
    expect(
      previstoDoMes([dia31], new Set(), '2026-02-01', '2026-02-10', FERIADOS)[0]?.dataPrevista,
    ).toBe('2026-02-28');
  });

  it('ordena por data, não pela ordem do cadastro', () => {
    const itens = previstoDoMes([salario, aluguel], new Set(), MES, '2026-08-28', FERIADOS);
    expect(itens.map((i) => i.descricao)).toEqual(['Aluguel', 'Salário']);
  });
});

describe('resumo do previsto', () => {
  it('separa o que já aconteceu do que falta', () => {
    const jaLancadas = new Set([chaveDaOcorrencia('r2', '2026-08-05')]);
    const resumo = resumirPrevisto(previstoDoMes([salario, aluguel], jaLancadas, MES, '2026-08-28', FERIADOS));

    expect(resumo.saiuPrevisto).toBe(150000);
    expect(resumo.faltaEntrar).toBe(600000);
    expect(resumo.entrouPrevisto).toBe(0);
    expect(resumo.faltaSair).toBe(0);
  });

  it('conta quantos estão atrasados', () => {
    const resumo = resumirPrevisto(previstoDoMes([salario, aluguel], new Set(), MES, '2026-08-28', FERIADOS));
    expect(resumo.atrasados).toBe(2);
  });

  it('recorrência sem valor previsto não entra em soma nenhuma', () => {
    // Somar zero por ela faria o "falta entrar" parecer menor do que é. Ela
    // aparece na lista para ser lançada com o número certo.
    const variavel: RecorrenciaPrevista = { ...salario, valorPrevisto: null };
    const resumo = resumirPrevisto(previstoDoMes([variavel], new Set(), MES, '2026-08-28', FERIADOS));
    expect(resumo.faltaEntrar).toBe(0);
    expect(resumo.atrasados).toBe(1);
  });
});

describe('previsto acumulado entre meses', () => {
  // O bug que isto fecha: nenhum mês futuro tem recorrência gravada no banco,
  // então o acumulado até 30/09 era igual ao de hoje e outubro abria com o
  // saldo de setembro. O mês seguinte parecia certo só porque a ponte entre
  // ele e hoje tem zero mês de comprimento.
  it('nao soma nada quando o mes pedido e o proprio mes corrente', () => {
    expect(previstoAteOMes([salario, aluguel], new Set(), MES, MES, '2026-08-28', FERIADOS)).toBe(0);
  });

  it('soma um mes de ponte com sinal: receita entra, despesa sai', () => {
    // Agosto inteiro: +6.000 de salario, -1.500 de aluguel.
    expect(previstoAteOMes([salario, aluguel], new Set(), MES, '2026-09-01', '2026-08-28', FERIADOS)).toBe(
      450000,
    );
  });

  it('acumula todos os meses da ponte, nao so o ultimo', () => {
    // Agosto + setembro + outubro para abrir novembro.
    expect(previstoAteOMes([salario, aluguel], new Set(), MES, '2026-11-01', '2026-08-28', FERIADOS)).toBe(
      1350000,
    );
  });

  it('nao conta de novo o que ja foi gerado no banco', () => {
    const jaLancadas = new Set([chaveDaOcorrencia('r1', '2026-08-27')]);
    expect(previstoAteOMes([salario, aluguel], jaLancadas, MES, '2026-09-01', '2026-08-28', FERIADOS)).toBe(
      -150000,
    );
  });

  it('recorrencia de valor variavel nao empurra o saldo', () => {
    const variavel: RecorrenciaPrevista = { ...salario, valorPrevisto: null };
    expect(previstoAteOMes([variavel], new Set(), MES, '2026-10-01', '2026-08-28', FERIADOS)).toBe(0);
  });

  it('mes pedido no passado nao soma nada em vez de girar sem parar', () => {
    expect(previstoAteOMes([salario], new Set(), MES, '2026-06-01', '2026-08-28', FERIADOS)).toBe(0);
  });
});

describe('prazo no previsto', () => {
  it('some da lista depois da última parcela', () => {
    const financiamento: RecorrenciaPrevista = {
      ...aluguel,
      id: 'r3',
      descricao: 'Financiamento',
      terminaEm: '2026-07-05',
    };

    // Agosto já passou do término: não é mais pendência, é passado.
    expect(previstoDoMes([financiamento], new Set(), MES, '2026-08-20', FERIADOS)).toEqual([]);
  });

  it('aparece normalmente enquanto o prazo não chegou', () => {
    const financiamento: RecorrenciaPrevista = { ...aluguel, terminaEm: '2026-12-05' };
    const itens = previstoDoMes([financiamento], new Set(), MES, '2026-08-20', FERIADOS);
    expect(itens).toHaveLength(1);
    expect(itens[0]!.dataPrevista).toBe('2026-08-05');
  });

  it('e para de pesar no saldo dos meses seguintes ao término', () => {
    const financiamento: RecorrenciaPrevista = { ...aluguel, terminaEm: '2026-09-05' };
    // Agosto e setembro pesam; outubro em diante, não.
    const ate2027 = previstoAteOMes([financiamento], new Set(), MES, '2027-01-01', '2026-08-01', FERIADOS);
    expect(ate2027).toBe(-300000);
  });

  it('regra de dia útil muda a data prevista', () => {
    const folha: RecorrenciaPrevista = { ...salario, dia: 5, regra: 'dia_util' };
    const itens = previstoDoMes([folha], new Set(), '2026-09-01', '2026-09-01', FERIADOS);
    // 07/09 é feriado: o 5º dia útil de setembro cai em 08.
    expect(itens[0]!.dataPrevista).toBe('2026-09-08');
  });
});

describe('data de início', () => {
  it('não aparece antes de começar', () => {
    const assinatura: RecorrenciaPrevista = { ...aluguel, comecaEm: '2026-11-01' };

    // Agosto: a assinatura ainda não vale. Não é atraso, é futuro.
    expect(previstoDoMes([assinatura], new Set(), MES, '2026-08-20', FERIADOS)).toEqual([]);
  });

  it('aparece a partir do mês em que começa', () => {
    const assinatura: RecorrenciaPrevista = { ...aluguel, comecaEm: '2026-11-01' };
    const itens = previstoDoMes([assinatura], new Set(), '2026-11-01', '2026-11-20', FERIADOS);
    expect(itens).toHaveLength(1);
    expect(itens[0]!.dataPrevista).toBe('2026-11-05');
  });

  it('e não empurra o saldo dos meses anteriores ao início', () => {
    const assinatura: RecorrenciaPrevista = { ...aluguel, comecaEm: '2026-11-01' };
    const ate2027 = previstoAteOMes(
      [assinatura],
      new Set(),
      '2026-08-01',
      '2026-11-01',
      '2026-08-01',
      FERIADOS,
    );
    expect(ate2027).toBe(0);
  });
});

describe('ocorrência dispensada', () => {
  it('some da lista em vez de voltar como atraso', () => {
    // O mês em que o freela não veio: apagado de propósito, não é pendência.
    const puladas = new Set([chaveDaOcorrencia('r2', '2026-08-05')]);
    expect(previstoDoMes([aluguel], new Set(), MES, '2026-08-20', FERIADOS, puladas)).toEqual([]);
  });

  it('só afeta o mês dispensado, nunca a recorrência inteira', () => {
    const puladas = new Set([chaveDaOcorrencia('r2', '2026-08-05')]);
    const setembro = previstoDoMes([aluguel], new Set(), '2026-09-01', '2026-09-20', FERIADOS, puladas);
    expect(setembro).toHaveLength(1);
  });

  it('e não pesa no saldo dos meses seguintes', () => {
    const puladas = new Set([chaveDaOcorrencia('r2', '2026-09-05')]);
    const semPular = previstoAteOMes([aluguel], new Set(), MES, '2026-10-01', '2026-08-01', FERIADOS);
    const pulando = previstoAteOMes(
      [aluguel], new Set(), MES, '2026-10-01', '2026-08-01', FERIADOS, puladas,
    );
    expect(pulando - semPular).toBe(150000);
  });
});

describe('previsto no cartão', () => {
  const CARTAO = { diaFechamento: 2, diaVencimento: 9 };

  const assinatura: RecorrenciaPrevista = {
    id: 'r9',
    descricao: 'Curso de Inglês',
    tipo: 'despesa',
    valorPrevisto: 72900,
    dia: 10,
    regra: 'fixo',
    comecaEm: '2020-01-01',
    terminaEm: null,
    cartao: CARTAO,
  };

  it('o dinheiro sai no vencimento da fatura, não no dia da compra', () => {
    // O bug: assinatura cobrada no cartão dia 10 baixava o saldo no dia 10.
    const [item] = previstoDoMes([assinatura], new Set(), '2026-09-01', '2026-09-01', FERIADOS);
    expect(item!.dataPrevista).toBe('2026-09-10');
    expect(item!.dataCaixa).toBe('2026-10-09');
    expect(item!.vencimentoDaFatura).toBe('2026-10-09');
  });

  it('fora do cartão, caixa e competência coincidem', () => {
    const [item] = previstoDoMes([aluguel], new Set(), MES, '2026-08-01', FERIADOS);
    expect(item!.dataCaixa).toBe(item!.dataPrevista);
    expect(item!.vencimentoDaFatura).toBeNull();
  });

  it('a lista por caixa põe a compra de setembro no mês de outubro', () => {
    // É onde o dinheiro sai — e é onde a fatura está.
    const setembro = previstoNoCaixaDoMes(
      [assinatura], new Set(), '2026-09-01', '2026-09-01', FERIADOS,
    );
    const outubro = previstoNoCaixaDoMes(
      [assinatura], new Set(), '2026-10-01', '2026-09-01', FERIADOS,
    );

    expect(setembro.map((i) => i.dataPrevista)).not.toContain('2026-09-10');
    expect(outubro.map((i) => i.dataPrevista)).toContain('2026-09-10');
  });

  it('sem cartão, a lista por caixa é a mesma do mês', () => {
    const porCaixa = previstoNoCaixaDoMes([aluguel], new Set(), MES, '2026-08-01', FERIADOS);
    const doMes = previstoDoMes([aluguel], new Set(), MES, '2026-08-01', FERIADOS);
    expect(porCaixa.map((i) => i.dataCaixa)).toEqual(doMes.map((i) => i.dataCaixa));
  });
});
