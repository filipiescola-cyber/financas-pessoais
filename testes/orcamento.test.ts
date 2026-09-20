import { describe, expect, it } from 'vitest';
import {
  CENARIOS_DE_ORCAMENTO,
  calcularReserva,
  conferir,
  dataPadraoDaConferencia,
  mereceAlerta,
  orcamentoComACompra,
  panoramaDaRenda,
  progressoDaMeta,
  progressoDoOrcamento,
  rendaFixaDoMes,
  tetoDoOrcamento,
  valoresDoCenario,
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

describe('data padrão da conferência', () => {
  it('no começo do mês, olha o mês que acabou', () => {
    // Quem abre a tela no dia 1º está fechando agosto: o extrato na mão é o de
    // agosto, e o saldo de hoje já tem o salário e as contas do dia.
    expect(dataPadraoDaConferencia('2026-09-01')).toBe('2026-08-31');
    expect(dataPadraoDaConferencia('2026-09-05')).toBe('2026-08-31');
  });

  it('no meio do mês, é conferência avulsa: vale hoje', () => {
    expect(dataPadraoDaConferencia('2026-09-06')).toBe('2026-09-06');
    expect(dataPadraoDaConferencia('2026-09-20')).toBe('2026-09-20');
  });

  it('vira o ano sem tropeçar', () => {
    expect(dataPadraoDaConferencia('2027-01-02')).toBe('2026-12-31');
  });

  it('mês curto: o último dia é o dele, não o dia 31', () => {
    expect(dataPadraoDaConferencia('2026-03-01')).toBe('2026-02-28');
  });
});

describe('o teto com a compra', () => {
  const DIA = '2026-10-10';

  it('mostra a virada: cabia, e com a compra não cabe mais', () => {
    // Saber que o saldo aguenta não é saber que a compra cabe no que você
    // tinha decidido gastar ali. São perguntas independentes.
    const r = orcamentoComACompra(100000, 60000, 50000, DIA);
    expect(r.antes.situacao).not.toBe('estourado');
    expect(r.depois.situacao).toBe('estourado');
    expect(r.passaAEstourar).toBe(true);
  });

  it('diz quanto ainda cabia', () => {
    expect(orcamentoComACompra(100000, 60000, 50000, DIA).cabiaAinda).toBe(40000);
  });

  it('compra que cabe não vira aviso', () => {
    const r = orcamentoComACompra(100000, 20000, 30000, DIA);
    expect(r.passaAEstourar).toBe(false);
    expect(r.depois.situacao).toBe('dentro');
  });

  it('teto já estourado antes não conta como virada', () => {
    // O aviso é sobre a compra ter causado o estouro, não sobre ele existir.
    const r = orcamentoComACompra(100000, 120000, 5000, DIA);
    expect(r.antes.situacao).toBe('estourado');
    expect(r.passaAEstourar).toBe(false);
  });

  it('o sinal da compra não muda a conta', () => {
    expect(orcamentoComACompra(100000, 60000, -50000, DIA).depois.realizado).toBe(110000);
  });
});

describe('renda fixa do mês (§4.5, §8.6)', () => {
  const salario = {
    tipo: 'receita' as const,
    frequencia: 'mensal' as const,
    valorPrevisto: 500000,
    incremento: 0,
    comecaEm: '2026-01-05',
    terminaEm: null,
    ativo: true,
  };

  it('soma as receitas mensais cadastradas', () => {
    expect(
      rendaFixaDoMes([salario, { ...salario, valorPrevisto: 120000 }], '2026-09-01'),
    ).toBe(620000);
  });

  it('despesa não é renda', () => {
    expect(rendaFixaDoMes([{ ...salario, tipo: 'despesa' }], '2026-09-01')).toBe(0);
  });

  it('receita ANUAL fica de fora: o 13º não paga o aluguel de março', () => {
    expect(rendaFixaDoMes([{ ...salario, frequencia: 'anual' }], '2026-09-01')).toBe(0);
  });

  it('renda que ainda não começou não sustenta teto', () => {
    expect(rendaFixaDoMes([{ ...salario, comecaEm: '2026-11-01' }], '2026-09-01')).toBe(0);
  });

  it('renda que acabou antes do mês não conta', () => {
    expect(rendaFixaDoMes([{ ...salario, terminaEm: '2026-08-31' }], '2026-09-01')).toBe(0);
    // Terminando DENTRO do mês, ela ainda entra: o dinheiro chegou.
    expect(rendaFixaDoMes([{ ...salario, terminaEm: '2026-09-30' }], '2026-09-01')).toBe(500000);
  });

  it('arquivada não conta', () => {
    expect(rendaFixaDoMes([{ ...salario, ativo: false }], '2026-09-01')).toBe(0);
  });

  it('gradativa vale o valor daquele mês (§5.2)', () => {
    // Começou em R$ 5.000 em janeiro e sobe R$ 100 por mês: em setembro são
    // oito degraus, R$ 5.800.
    expect(rendaFixaDoMes([{ ...salario, incremento: 10000 }], '2026-09-01')).toBe(580000);
  });

  it('sem valor previsto, soma zero em vez de NaN', () => {
    expect(rendaFixaDoMes([{ ...salario, valorPrevisto: null }], '2026-09-01')).toBe(0);
  });
});

describe('teto como porcentagem da renda (§8.6)', () => {
  it('sem porcentagem, vale o valor guardado', () => {
    expect(tetoDoOrcamento({ valorPlanejado: 50000, percentualDaRenda: null }, 620000)).toBe(50000);
  });

  it('com porcentagem, o valor é consequência da renda', () => {
    expect(tetoDoOrcamento({ valorPlanejado: 0, percentualDaRenda: 10 }, 620000)).toBe(62000);
  });

  it('a renda subiu: o teto sobe junto, sem ninguém editar nada', () => {
    const teto = { valorPlanejado: 0, percentualDaRenda: 10 };
    expect(tetoDoOrcamento(teto, 500000)).toBe(50000);
    expect(tetoDoOrcamento(teto, 700000)).toBe(70000);
  });

  it('sem renda cadastrada, porcentagem não inventa valor', () => {
    expect(tetoDoOrcamento({ valorPlanejado: 0, percentualDaRenda: 10 }, 0)).toBe(0);
  });

  it('arredonda para o centavo', () => {
    expect(tetoDoOrcamento({ valorPlanejado: 0, percentualDaRenda: 33.3 }, 123456)).toBe(41111);
  });
});

describe('quanto por cento falta', () => {
  it('o restante do teto em porcentagem acompanha o gasto', () => {
    expect(progressoDoOrcamento(50000, 20000, '2026-09-10').proporcaoRestante).toBeCloseTo(0.6);
  });

  it('estourado é zero livre, não porcentagem negativa', () => {
    expect(progressoDoOrcamento(50000, 70000, '2026-09-10').proporcaoRestante).toBe(0);
  });

  it('panorama: o denominador é a renda, não a soma dos tetos', () => {
    const p = panoramaDaRenda(620000, 310000, 155000);
    expect(p.proporcaoPlanejada).toBeCloseTo(0.5);
    expect(p.proporcaoRealizada).toBeCloseTo(0.25);
    expect(p.proporcaoLivre).toBeCloseTo(0.75);
  });

  it('gastar mais que a renda não deixa sobra negativa', () => {
    expect(panoramaDaRenda(620000, 0, 700000).proporcaoLivre).toBe(0);
  });

  it('sem renda cadastrada, o panorama diz que não sabe', () => {
    const p = panoramaDaRenda(0, 50000, 20000);
    expect(p.semRenda).toBe(true);
    expect(p.proporcaoRealizada).toBe(0);
  });
});

describe('cenários de referência (§8.6)', () => {
  it('todo cenário fecha em 100%: orçamento que não fecha é lista de desejos', () => {
    for (const cenario of CENARIOS_DE_ORCAMENTO) {
      const soma = cenario.faixas.reduce((total, f) => total + f.percentual, 0);
      expect(soma).toBe(100);
    }
  });

  it('em reais, as faixas somam a renda', () => {
    for (const cenario of CENARIOS_DE_ORCAMENTO) {
      const faixas = valoresDoCenario(cenario, 620000);
      expect(faixas.reduce((total, f) => total + f.valor, 0)).toBe(620000);
    }
  });

  it('são três, e cada um serve a uma situação diferente', () => {
    expect(CENARIOS_DE_ORCAMENTO).toHaveLength(3);
    expect(new Set(CENARIOS_DE_ORCAMENTO.map((c) => c.nome)).size).toBe(3);
  });
});
