import { describe, expect, it } from 'vitest';
import {
  descreverFatura,
  faturaDeReferencia,
  faturaDoMes,
  faturaEscolhida,
  proximasFaturas,
} from '../src/dominio/fatura';

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
