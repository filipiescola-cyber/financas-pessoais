import { describe, expect, it } from 'vitest';
import {
  descreverFatura,
  dividaEmAbertoPorCartao,
  faturaDeReferencia,
  faturaDoMes,
  faturaEscolhida,
  faturaQueVenceNoMes,
  planoDoParcelamento,
  proximasFaturas,
  saldoDaFatura,
} from '../src/dominio/fatura';
import { somarMeses } from '../src/dominio/datas';
import { vencimentoDaParcela } from '../src/dominio/divida';

// Fecha dia 4, vence dia 10 — o exemplo do §4.2.
const PADRAO = { diaFechamento: 4, diaVencimento: 10 };

describe('em qual fatura cai a compra (§2.1)', () => {
  it('compra antes do fechamento entra na fatura que fecha neste mês', () => {
    const fatura = faturaDeReferencia('2026-10-02', PADRAO);
    expect(fatura.dataFechamento).toBe('2026-10-04');
    expect(fatura.dataVencimento).toBe('2026-10-10');
  });

  it('compra NO dia do fechamento ainda entra nessa fatura', () => {
    expect(faturaDeReferencia('2026-10-04', PADRAO).dataFechamento).toBe('2026-10-04');
  });

  it('compra APÓS o fechamento vai para a fatura do mês seguinte', () => {
    const fatura = faturaDeReferencia('2026-10-05', PADRAO);
    expect(fatura.dataFechamento).toBe('2026-11-04');
    expect(fatura.dataVencimento).toBe('2026-11-10');
  });

  it('a janela de compras vai do dia seguinte ao fechamento anterior', () => {
    const fatura = faturaDeReferencia('2026-09-20', PADRAO);
    expect(fatura.periodoInicio).toBe('2026-09-05');
    expect(fatura.periodoFim).toBe('2026-10-04');
  });

  it('reproduz a frase do §4.2', () => {
    expect(descreverFatura(faturaDeReferencia('2026-09-20', PADRAO))).toBe(
      'Compras de 05/set a 04/out entram na fatura que vence em 10/out.',
    );
  });
});

describe('vencimento anterior ao fechamento (§4.2)', () => {
  // Fecha dia 28, vence dia 5 do mês seguinte. Caso comum e fácil de errar.
  const FECHA_TARDE = { diaFechamento: 28, diaVencimento: 5 };

  it('empurra o vencimento para o mês seguinte', () => {
    const fatura = faturaDoMes('2026-10-01', FECHA_TARDE);
    expect(fatura.dataFechamento).toBe('2026-10-28');
    expect(fatura.dataVencimento).toBe('2026-11-05');
  });

  it('atravessa a virada de ano', () => {
    const fatura = faturaDoMes('2026-12-01', FECHA_TARDE);
    expect(fatura.dataFechamento).toBe('2026-12-28');
    expect(fatura.dataVencimento).toBe('2027-01-05');
  });

  it('vencimento igual ao fechamento fica no mesmo mês', () => {
    const fatura = faturaDoMes('2026-10-01', { diaFechamento: 10, diaVencimento: 10 });
    expect(fatura.dataVencimento).toBe('2026-10-10');
  });
});

describe('fechamento no dia 31 (§4.2)', () => {
  const DIA_31 = { diaFechamento: 31, diaVencimento: 10 };

  it('vira o último dia em meses mais curtos', () => {
    expect(faturaDoMes('2026-02-01', DIA_31).dataFechamento).toBe('2026-02-28');
    expect(faturaDoMes('2024-02-01', DIA_31).dataFechamento).toBe('2024-02-29');
    expect(faturaDoMes('2026-04-01', DIA_31).dataFechamento).toBe('2026-04-30');
    expect(faturaDoMes('2026-03-01', DIA_31).dataFechamento).toBe('2026-03-31');
  });

  it('o vencimento continua caindo no mês seguinte, mesmo com o dia truncado', () => {
    // Fevereiro trunca o fechamento para 28, mas 10 < 31 continua valendo:
    // a decisão usa os dias configurados, não as datas ajustadas.
    expect(faturaDoMes('2026-02-01', DIA_31).dataVencimento).toBe('2026-03-10');
  });

  it('compra no último dia de fevereiro entra na fatura de fevereiro', () => {
    expect(faturaDeReferencia('2026-02-28', DIA_31).dataFechamento).toBe('2026-02-28');
  });

  it('a janela de compras não deixa buraco entre meses curtos', () => {
    const marco = faturaDoMes('2026-03-01', DIA_31);
    const fevereiro = faturaDoMes('2026-02-01', DIA_31);
    expect(fevereiro.periodoFim).toBe('2026-02-28');
    expect(marco.periodoInicio).toBe('2026-03-01');
  });
});

describe('cobertura sem buraco nem sobreposição', () => {
  it('todo dia do ano cai em exatamente uma fatura', () => {
    // Se a janela de uma fatura não colar na da seguinte, alguma compra some do
    // relatório sem ninguém perceber. Este teste varre um ano inteiro.
    for (const configuracao of [PADRAO, { diaFechamento: 28, diaVencimento: 5 }, { diaFechamento: 31, diaVencimento: 10 }]) {
      let data = '2026-01-01';
      while (data <= '2026-12-31') {
        const fatura = faturaDeReferencia(data, configuracao);
        expect(data >= fatura.periodoInicio).toBe(true);
        expect(data <= fatura.periodoFim).toBe(true);
        const [ano, mes, dia] = data.split('-').map(Number);
        const proximo = new Date(Date.UTC(ano!, mes! - 1, dia! + 1));
        data = proximo.toISOString().slice(0, 10);
      }
    }
  });
});

describe('geração das próximas faturas (§4.2)', () => {
  it('gera 12 meses seguidos a partir da fatura corrente', () => {
    const faturas = proximasFaturas('2026-08-27', PADRAO, 12);
    expect(faturas).toHaveLength(12);
    expect(faturas[0]?.mesReferencia).toBe('2026-09-01');
    expect(faturas[11]?.mesReferencia).toBe('2027-08-01');
  });

  it('cada fatura tem mês de referência único', () => {
    const meses = proximasFaturas('2026-08-27', PADRAO, 12).map((f) => f.mesReferencia);
    expect(new Set(meses).size).toBe(12);
  });
});

describe('configuração inválida', () => {
  it('recusa dia fora da faixa em vez de gerar data errada', () => {
    expect(() => faturaDeReferencia('2026-10-01', { diaFechamento: 0, diaVencimento: 10 })).toThrow();
    expect(() => faturaDeReferencia('2026-10-01', { diaFechamento: 32, diaVencimento: 10 })).toThrow();
    expect(() => faturaDeReferencia('2026-10-01', { diaFechamento: 5, diaVencimento: 1.5 })).toThrow();
  });
});

describe('escolher a fatura na mão', () => {
  // Fecha dia 5, vence dia 15.
  const cartao = { diaFechamento: 5, diaVencimento: 15 };

  it('sem deslocamento, é a calculada pelo fechamento', () => {
    expect(faturaEscolhida('2026-08-03', cartao).dataVencimento).toBe(
      faturaDeReferencia('2026-08-03', cartao).dataVencimento,
    );
  });

  it('deslocamento +1 joga para a fatura seguinte', () => {
    // O caso real: compra no dia 4, o banco lançou no dia 6 e caiu na próxima.
    const calculada = faturaDeReferencia('2026-08-04', cartao);
    const escolhida = faturaEscolhida('2026-08-04', cartao, 1);
    expect(escolhida.mesReferencia).toBe('2026-09-01');
    expect(escolhida.mesReferencia > calculada.mesReferencia).toBe(true);
  });

  it('deslocamento -1 volta para a fatura anterior', () => {
    expect(faturaEscolhida('2026-08-10', cartao, -1).mesReferencia).toBe('2026-08-01');
  });

  it('atravessa a virada de ano sem se perder', () => {
    expect(faturaEscolhida('2026-12-20', cartao, 1).mesReferencia).toBe('2027-02-01');
    expect(faturaEscolhida('2027-01-02', cartao, -1).mesReferencia).toBe('2026-12-01');
  });

  it('o deslocamento acompanha a data: mudar a compra move a fatura junto', () => {
    // É por isso que o que se guarda é o deslocamento, e não a fatura escolhida.
    const antes = faturaEscolhida('2026-08-10', cartao, 1).mesReferencia;
    const depois = faturaEscolhida('2026-09-10', cartao, 1).mesReferencia;
    expect(depois > antes).toBe(true);
  });
});

describe('saldo da fatura', () => {
  it('pagamento parcial deixa o resto devendo', () => {
    // O bug que isto conserta: pagar R$ 200 de R$ 500 marcava a fatura inteira
    // como paga, e os R$ 300 sumiam de "o que você deve".
    const saldo = saldoDaFatura(50000, 20000);
    expect(saldo.falta).toBe(30000);
    expect(saldo.quitada).toBe(false);
  });

  it('só fica quitada quando não falta nada', () => {
    expect(saldoDaFatura(50000, 50000).quitada).toBe(true);
    expect(saldoDaFatura(50000, 49999).quitada).toBe(false);
  });

  it('vários pagamentos somados quitam', () => {
    expect(saldoDaFatura(50000, 20000 + 30000).quitada).toBe(true);
  });

  it('pagar a mais não vira crédito nem falta negativa', () => {
    const saldo = saldoDaFatura(50000, 50100);
    expect(saldo.falta).toBe(0);
    expect(saldo.quitada).toBe(true);
  });

  it('fatura sem compra nenhuma não está "quitada": não havia o que quitar', () => {
    expect(saldoDaFatura(0, 0).quitada).toBe(false);
  });

  it('o sinal do valor não importa: fatura cobra, sempre', () => {
    expect(saldoDaFatura(-50000, -20000).falta).toBe(30000);
  });
});

describe('parcelamento da fatura (§2.1, §4.7)', () => {
  const CONFIGURACOES = [
    { diaFechamento: 4, diaVencimento: 10 }, // vence no mesmo mês
    { diaFechamento: 28, diaVencimento: 5 }, // vence no mês seguinte
    { diaFechamento: 31, diaVencimento: 10 }, // fecha no último dia
    { diaFechamento: 10, diaVencimento: 31 }, // vence no último dia
    { diaFechamento: 15, diaVencimento: 15 }, // fecha e vence no mesmo dia
  ];

  it('a fatura que vence num mês é o caminho de volta da fatura do mês', () => {
    for (const configuracao of CONFIGURACOES) {
      for (let i = 0; i < 24; i += 1) {
        const mes = somarMeses('2026-01-01', i);
        const fatura = faturaDoMes(mes, configuracao);
        expect(faturaQueVenceNoMes(fatura.dataVencimento, configuracao).mesReferencia).toBe(mes);
      }
    }
  });

  it('com entrada, a 1ª parcela fica na própria fatura parcelada', () => {
    const plano = planoDoParcelamento({ mesReferencia: '2026-09-01' }, 3, true, PADRAO);

    expect(plano.faturas.map((f) => f.mesReferencia)).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
    expect(plano.primeiraParcela).toBe('2026-09-10');
  });

  it('sem entrada, a 1ª já cai na fatura seguinte', () => {
    const plano = planoDoParcelamento({ mesReferencia: '2026-09-01' }, 3, false, PADRAO);

    expect(plano.faturas.map((f) => f.mesReferencia)).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]);
    expect(plano.primeiraParcela).toBe('2026-10-10');
  });

  it('fecha dia 28 e vence dia 5: a entrada vence no mês seguinte ao fechamento', () => {
    const plano = planoDoParcelamento({ mesReferencia: '2026-09-01' }, 2, true, {
      diaFechamento: 28,
      diaVencimento: 5,
    });

    expect(plano.primeiraParcela).toBe('2026-10-05');
    expect(plano.faturas[1]!.dataVencimento).toBe('2026-11-05');
  });

  it('a data guardada na dívida leva cada parcela à mesma fatura do plano', () => {
    /*
      A dívida guarda só a data da 1ª parcela; a de cada outra é recalculada
      somando meses. Se essa conta e a do plano divergirem, a parcela lançada de
      antemão e a relançada pela rotina de abertura cairiam em faturas
      diferentes — o mesmo fato calculado em dois lugares, que é o defeito mais
      repetido deste app.

      Vencimento dia 31 é o caso que quebraria: fevereiro trunca para 28, e a
      parcela seguinte, somada a partir de 28/02, cai no dia 28 de março.
    */
    for (const configuracao of CONFIGURACOES) {
      for (const comEntrada of [true, false]) {
        const plano = planoDoParcelamento(
          { mesReferencia: '2026-11-01' },
          24,
          comEntrada,
          configuracao,
        );

        plano.faturas.forEach((fatura, i) => {
          const vencimento = vencimentoDaParcela(plano.primeiraParcela, i + 1);
          expect(faturaQueVenceNoMes(vencimento, configuracao).mesReferencia).toBe(
            fatura.mesReferencia,
          );
        });
      }
    }
  });

  it('uma parcela por fatura, sem pular nem repetir, atravessando o ano', () => {
    for (const configuracao of CONFIGURACOES) {
      const plano = planoDoParcelamento({ mesReferencia: '2026-12-01' }, 14, true, configuracao);
      plano.faturas.forEach((fatura, i) => {
        expect(fatura.mesReferencia).toBe(somarMeses('2026-12-01', i));
      });
    }
  });

  it('recusa quantidade de parcelas inválida', () => {
    expect(() => planoDoParcelamento({ mesReferencia: '2026-09-01' }, 0, true, PADRAO)).toThrow();
  });
});

describe('limite usado do cartão (§2.1, §4.2)', () => {
  const faturas = [
    { id: 'out', cartaoId: 'nubank', vencimento: '2026-10-12' },
    { id: 'nov', cartaoId: 'nubank', vencimento: '2026-11-12' },
  ];

  it('estorno diminui o que se deve, não aumenta', () => {
    // Com o valor absoluto, R$ 100 de compra e R$ 30 de estorno davam R$ 130.
    const divida = dividaEmAbertoPorCartao(
      faturas,
      [
        { faturaId: 'out', valor: -10000 },
        { faturaId: 'out', valor: 3000 },
      ],
      [],
    );
    expect(divida.get('nubank')?.total).toBe(7000);
  });

  it('as parcelas futuras de uma compra ocupam o limite, como no banco', () => {
    const divida = dividaEmAbertoPorCartao(
      faturas,
      [
        { faturaId: 'out', valor: -5000 },
        { faturaId: 'nov', valor: -5000 },
      ],
      [],
    );
    expect(divida.get('nubank')?.total).toBe(10000);
  });

  it('pagamento parcial abate só da própria fatura', () => {
    const divida = dividaEmAbertoPorCartao(
      faturas,
      [
        { faturaId: 'out', valor: -10000 },
        { faturaId: 'nov', valor: -5000 },
      ],
      [{ faturaId: 'out', valor: -4000 }],
    );
    expect(divida.get('nubank')?.total).toBe(11000);
  });

  it('pagar a mais uma fatura não vira crédito para a seguinte', () => {
    const divida = dividaEmAbertoPorCartao(
      faturas,
      [
        { faturaId: 'out', valor: -3000 },
        { faturaId: 'nov', valor: -5000 },
      ],
      [{ faturaId: 'out', valor: -5000 }],
    );
    expect(divida.get('nubank')?.total).toBe(5000);
  });

  it('o próximo vencimento é o da fatura mais próxima que ainda deve', () => {
    const divida = dividaEmAbertoPorCartao(
      faturas,
      [
        { faturaId: 'out', valor: -3000 },
        { faturaId: 'nov', valor: -5000 },
      ],
      [{ faturaId: 'out', valor: -3000 }],
    );
    expect(divida.get('nubank')?.proximoVencimento).toBe('2026-11-12');
  });

  it('cartão sem nada a dever não aparece', () => {
    const divida = dividaEmAbertoPorCartao(faturas, [{ faturaId: 'out', valor: 2000 }], []);
    expect(divida.has('nubank')).toBe(false);
  });
});
