import { describe, expect, it } from 'vitest';
import {
  compromissoMensal,
  mediana,
  mesEmQueOCompromissoAcaba,
  piorMes,
  primeiroMesNegativo,
  projetarFluxo,
  projetarRenda,
  simularCompra,
  type EntradaDaProjecao,
} from '../src/dominio/projecao';

describe('mediana (§8.3)', () => {
  it('devolve o valor central', () => {
    expect(mediana([100, 300, 200])).toBe(200);
  });

  it('com número par, tira a média dos dois centrais', () => {
    expect(mediana([100, 200, 300, 400])).toBe(250);
  });

  it('IGNORA o mês excepcional, ao contrário da média', () => {
    // Cinco meses de ~3000 e um de 20000. A média diria 5833; a mediana diz 3000.
    // É a diferença entre o app dizer que dá para gastar e dizer a verdade.
    const meses = [300000, 310000, 290000, 300000, 305000, 2000000];
    expect(mediana(meses)).toBe(302500);

    const media = meses.reduce((s, v) => s + v, 0) / meses.length;
    expect(media).toBeGreaterThan(500000);
  });

  it('lista vazia devolve null, não zero', () => {
    // "Ainda não sei" é diferente de "zero" (§13.5).
    expect(mediana([])).toBeNull();
  });
});

describe('renda projetada (§8.3)', () => {
  const sementes = { mesTipico: 400000, mesRuim: 250000 };

  it('com menos de 3 meses usa as sementes do onboarding', () => {
    const renda = projetarRenda([500000, 600000], sementes);
    expect(renda.origem).toBe('semente');
    expect(renda.provavel).toBe(400000);
    expect(renda.pessimista).toBe(250000);
  });

  it('não inventa um mês bom quando não há histórico', () => {
    const renda = projetarRenda([], sementes);
    expect(renda.otimista).toBe(renda.provavel);
  });

  it('a partir de 3 meses troca pela mediana real', () => {
    const renda = projetarRenda([300000, 500000, 400000], sementes);
    expect(renda.origem).toBe('historico');
    expect(renda.provavel).toBe(400000);
  });

  it('pessimista é o pior mês; otimista, o melhor', () => {
    const renda = projetarRenda([300000, 500000, 400000, 250000], sementes);
    expect(renda.pessimista).toBe(250000);
    expect(renda.otimista).toBe(500000);
  });

  it('sem histórico e sem sementes, zera e diz que não sabe', () => {
    const renda = projetarRenda([], null);
    expect(renda.origem).toBe('ausente');
    expect(renda.provavel).toBe(0);
  });

  it('usa a fonte fixa cadastrada quando ainda não há histórico (§4.5)', () => {
    // O §4.5 promete que a fonte fixa "já entra na projeção desde o primeiro
    // dia". Sem isto, cadastrar o salário no onboarding não mudava nada na tela.
    const renda = projetarRenda([], null, 600000);
    expect(renda.origem).toBe('recorrencia');
    expect(renda.provavel).toBe(600000);
  });

  it('renda fixa entra igual nos três cenários', () => {
    // Os cenários existem para a parte que varia. Salário não varia.
    const renda = projetarRenda([], null, 600000);
    expect(renda.pessimista).toBe(renda.otimista);
  });

  it('soma a fixa às sementes da renda variável', () => {
    const renda = projetarRenda([], sementes, 600000);
    expect(renda.provavel).toBe(600000 + 400000);
    expect(renda.pessimista).toBe(600000 + 250000);
  });

  it('NÃO soma a fixa quando já há histórico, para não dobrar', () => {
    // A recorrência gera lançamento todo mês, então o salário já está dentro do
    // histórico. Somar de novo contaria duas vezes.
    const renda = projetarRenda([300000, 500000, 400000], sementes, 600000);
    expect(renda.origem).toBe('historico');
    expect(renda.provavel).toBe(400000);
  });

  it('a mediana olha 6 meses; os extremos olham 12', () => {
    // 13 meses: o primeiro fica fora dos dois recortes.
    const historico = [
      100000, 900000, 800000, 700000, 600000, 500000, 400000, 300000, 310000, 320000, 330000,
      340000, 350000,
    ];
    const renda = projetarRenda(historico, null);
    expect(renda.pessimista).toBe(300000);
    expect(renda.otimista).toBe(900000);
  });
});

const base: EntradaDaProjecao = {
  saldoAtual: 500000,
  aPartirDe: '2026-09-01',
  horizonteEmMeses: 4,
  renda: {
    pessimista: 250000,
    provavel: 400000,
    otimista: 500000,
    origem: 'historico',
    mesesDeHistorico: 6,
  },
  fixasMensais: 150000,
  fixasComPrazo: [],
  provisaoEventualMensal: 20000,
  medianaDasVariaveis: 100000,
  jaLancadoPorMes: { '2026-10-01': 60000, '2026-11-01': 60000 },
};

describe('projeção de fluxo (§8.2)', () => {
  it('encadeia o saldo de um mês no seguinte', () => {
    const projecao = projetarFluxo(base, 'provavel');
    // 500000 + 400000 - (150000 + 0 + 20000 + 100000) = 630000
    expect(projecao[0]?.saldoFinal).toBe(630000);
    expect(projecao[1]?.saldoInicial).toBe(630000);
  });

  it('soma as parcelas já lançadas no mês certo', () => {
    const projecao = projetarFluxo(base, 'provavel');
    expect(projecao[1]?.saidas.jaLancado).toBe(60000);
    expect(projecao[0]?.saidas.jaLancado).toBe(0);
  });

  it('mantém os componentes separados para a tela mostrar a confiança', () => {
    // O §8.2 exige que parcela lançada e mediana de variável não se misturem:
    // uma é fato consumado, a outra é chute educado.
    const mes = projetarFluxo(base, 'provavel')[1]!;
    expect(mes.saidas).toEqual({
      fixas: 150000,
      jaLancado: 60000,
      provisaoEventual: 20000,
      variaveis: 100000,
    });
    expect(mes.totalDeSaidas).toBe(330000);
  });

  it('o cenário muda só a receita', () => {
    const provavel = projetarFluxo(base, 'provavel')[0]!;
    const pessimista = projetarFluxo(base, 'pessimista')[0]!;
    expect(pessimista.totalDeSaidas).toBe(provavel.totalDeSaidas);
    expect(pessimista.saldoFinal).toBe(provavel.saldoFinal - 150000);
  });

  it('respeita o horizonte pedido e atravessa a virada de ano', () => {
    const projecao = projetarFluxo({ ...base, horizonteEmMeses: 6 }, 'provavel');
    expect(projecao).toHaveLength(6);
    expect(projecao[4]?.mes).toBe('2027-01-01');
  });
});

describe('o mês que importa', () => {
  it('acha o pior mês da projeção', () => {
    const projecao = projetarFluxo({ ...base, saldoAtual: 0, renda: { ...base.renda, provavel: 100000 } }, 'provavel');
    expect(piorMes(projecao)?.mes).toBe('2026-12-01');
  });

  it('acha o primeiro mês negativo, não o pior', () => {
    // A ordem importa: o usuário precisa saber QUANDO aperta, não só quanto.
    const projecao = projetarFluxo(
      { ...base, saldoAtual: 0, renda: { ...base.renda, provavel: 100000 } },
      'provavel',
    );
    expect(primeiroMesNegativo(projecao)?.mes).toBe('2026-09-01');
  });

  it('devolve null quando nenhum mês fica negativo', () => {
    expect(primeiroMesNegativo(projetarFluxo(base, 'otimista'))).toBeNull();
  });
});

describe('simulador de compra (§8.4)', () => {
  it('mostra o pior mês antes e depois', () => {
    const impacto = simularCompra(base, 'provavel', {
      valor: 300000,
      parcelas: 3,
      primeiroMes: '2026-09-01',
    });
    expect(impacto.piorMesDepois!.saldoFinal).toBeLessThan(impacto.piorMesAntes!.saldoFinal);
  });

  it('divide a compra em parcelas com o resto na última (§13.1)', () => {
    const impacto = simularCompra(base, 'provavel', {
      valor: 10000,
      parcelas: 3,
      primeiroMes: '2026-09-01',
    });
    expect(impacto.valorDaParcela).toBe(3333);
    expect(impacto.ultimaParcela).toBe('2026-11-01');
  });

  it('não altera a projeção original', () => {
    const antes = { ...base.jaLancadoPorMes };
    simularCompra(base, 'provavel', { valor: 500000, parcelas: 10, primeiroMes: '2026-09-01' });
    // Simulação não grava nada — nem em memória (§8.4).
    expect(base.jaLancadoPorMes).toEqual(antes);
  });

  it('revela o mês que fica negativo por causa da compra', () => {
    const impacto = simularCompra(base, 'pessimista', {
      valor: 900000,
      parcelas: 3,
      primeiroMes: '2026-09-01',
    });
    expect(impacto.primeiroNegativoAntes).toBeNull();
    expect(impacto.primeiroNegativoDepois).not.toBeNull();
  });

  it('mostra quanto o compromisso mensal aumenta', () => {
    const impacto = simularCompra(base, 'provavel', {
      valor: 120000,
      parcelas: 12,
      primeiroMes: '2026-09-01',
    });
    expect(impacto.compromissoDepois - impacto.compromissoAntes).toBe(10000);
  });
});

describe('compromisso já assumido (§8.5)', () => {
  it('lê o quanto do próximo mês já está gasto', () => {
    expect(compromissoMensal(base.jaLancadoPorMes, '2026-09-01')).toBe(60000);
  });

  it('diz em que mês a folga volta', () => {
    expect(mesEmQueOCompromissoAcaba(base.jaLancadoPorMes)).toBe('2026-11-01');
  });

  it('ignora mês zerado ao procurar o fim', () => {
    expect(
      mesEmQueOCompromissoAcaba({ '2026-10-01': 5000, '2026-12-01': 0 }),
    ).toBe('2026-10-01');
  });

  it('devolve null quando não há compromisso nenhum', () => {
    expect(mesEmQueOCompromissoAcaba({})).toBeNull();
  });
});

describe('as duas projeções do simulador', () => {
  const entrada = {
    saldoAtual: 500000,
    aPartirDe: '2026-09-01',
    horizonteEmMeses: 6,
    renda: {
      pessimista: 300000,
      provavel: 300000,
      otimista: 300000,
      origem: 'historico' as const,
      mesesDeHistorico: 6,
    },
    fixasMensais: 100000,
    fixasComPrazo: [],
    provisaoEventualMensal: 0,
    medianaDasVariaveis: 0,
    jaLancadoPorMes: {},
  };

  it('devolve os dois cenários com os mesmos meses, na mesma ordem', () => {
    const impacto = simularCompra(entrada, 'provavel', {
      valor: 120000,
      parcelas: 3,
      primeiroMes: '2026-09-01',
    });
    expect(impacto.antes.map((m) => m.mes)).toEqual(impacto.depois.map((m) => m.mes));
    expect(impacto.antes).toHaveLength(6);
  });

  it('depois nunca fica acima de antes: comprar não cria dinheiro', () => {
    const impacto = simularCompra(entrada, 'provavel', {
      valor: 120000,
      parcelas: 3,
      primeiroMes: '2026-09-01',
    });
    for (let i = 0; i < impacto.antes.length; i += 1) {
      expect(impacto.depois[i]!.saldoFinal).toBeLessThanOrEqual(impacto.antes[i]!.saldoFinal);
    }
  });

  it('depois da última parcela, a distância entre os dois para de crescer', () => {
    // É o que separa "aperta e passa" de "baixa o saldo para sempre" — e é
    // justamente o que o pior mês sozinho não mostra.
    const impacto = simularCompra(entrada, 'provavel', {
      valor: 120000,
      parcelas: 2,
      primeiroMes: '2026-09-01',
    });
    const distancia = impacto.antes.map((m, i) => m.saldoFinal - impacto.depois[i]!.saldoFinal);
    expect(distancia[1]).toBe(120000);
    expect(distancia[5]).toBe(120000);
  });
});
