import { describe, expect, it } from 'vitest';
import {
  empresaSubindoHaTresMeses,
  gerarAlertas,
  ordenarPorGravidade,
  type EntradaDosAlertas,
} from '../src/dominio/alertas';

const vazio: EntradaDosAlertas = {
  hoje: '2026-08-12',
  mesNegativo: null,
  orcamentosEstourando: [],
  faturasFechando: [],
  recorrenciasFaltando: [],
  historicoDaEmpresa: [],
  contasSemConferencia: [],
};

describe('o que NÃO alerta (§8.6)', () => {
  it('sem nada acontecendo, não inventa alerta', () => {
    // "Alerta que dispara demais é silenciado, e junto com ele some o alerta
    // que importava."
    expect(gerarAlertas(vazio)).toEqual([]);
  });

  it('fatura fechando dentro da média não vira alerta', () => {
    // Fatura fechando é rotina. Só fatura fechando CARA é informação.
    const alertas = gerarAlertas({
      ...vazio,
      faturasFechando: [
        { nome: 'Nubank', dataFechamento: '2026-08-13', valor: 100000, media: 100000 },
      ],
    });
    expect(alertas).toEqual([]);
  });

  it('fatura cara mas ainda longe do fechamento não vira alerta', () => {
    const alertas = gerarAlertas({
      ...vazio,
      faturasFechando: [
        { nome: 'Nubank', dataFechamento: '2026-08-28', valor: 300000, media: 100000 },
      ],
    });
    expect(alertas).toEqual([]);
  });

  it('não lembra de conferência no meio do mês', () => {
    // Lembrete é do dia 1º (§5.3). Repetir todo dia seria o "nada diário" que
    // o §8.6 proíbe.
    const alertas = gerarAlertas({
      ...vazio,
      hoje: '2026-08-15',
      contasSemConferencia: [{ nome: 'Corrente', ultimaConferencia: null }],
    });
    expect(alertas).toEqual([]);
  });
});

describe('o que vale alertar (§8.6)', () => {
  it('mês projetado ficando negativo é o alerta mais grave', () => {
    const alertas = gerarAlertas({
      ...vazio,
      mesNegativo: { mes: '2026-11-01', saldo: -50000 },
    });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.gravidade).toBe('urgente');
    expect(alertas[0]?.titulo).toContain('novembro');
  });

  it('fatura acima da média fechando em 3 dias', () => {
    const alertas = gerarAlertas({
      ...vazio,
      faturasFechando: [
        { nome: 'Nubank', dataFechamento: '2026-08-14', valor: 300000, media: 100000 },
      ],
    });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.titulo).toContain('acima da média');
  });

  it('recorrência esperada que não aconteceu', () => {
    // Pode ser conta esquecida — ou cobrança que sumiu, o que também interessa.
    const alertas = gerarAlertas({
      ...vazio,
      recorrenciasFaltando: [{ descricao: 'Internet', diaEsperado: 5 }],
    });
    expect(alertas[0]?.titulo).toContain('Internet');
  });

  it('lembra da conferência no começo do mês', () => {
    const alertas = gerarAlertas({
      ...vazio,
      hoje: '2026-08-02',
      contasSemConferencia: [{ nome: 'Corrente', ultimaConferencia: null }],
    });
    expect(alertas[0]?.destino).toBe('/conferencia');
  });

  it('todo alerta aponta para onde resolver', () => {
    const alertas = gerarAlertas({
      ...vazio,
      mesNegativo: { mes: '2026-11-01', saldo: -50000 },
      orcamentosEstourando: [{ nome: 'Mercado', proporcao: 1.3 }],
    });
    // Alerta sem ação é ruído.
    expect(alertas.every((a) => a.destino)).toBe(true);
  });
});

describe('conta Empresa subindo (§2.6)', () => {
  it('reconhece três altas seguidas', () => {
    expect(empresaSubindoHaTresMeses([100000, 150000, 200000, 260000])).toBe(true);
  });

  it('uma queda no meio quebra a sequência', () => {
    expect(empresaSubindoHaTresMeses([100000, 150000, 120000, 260000])).toBe(false);
  });

  it('precisa de histórico suficiente antes de concluir qualquer coisa', () => {
    // Meses 1 a 6 subindo é esperado: equipamento e estoque saem antes do
    // retorno chegar. Com pouca série não dá para falar de inclinação.
    expect(empresaSubindoHaTresMeses([100000, 200000])).toBe(false);
  });

  it('estável não é subida', () => {
    expect(empresaSubindoHaTresMeses([100000, 100000, 100000, 100000])).toBe(false);
  });
});

describe('ordenação', () => {
  it('urgente vem antes de atenção, que vem antes de informativo', () => {
    const alertas = gerarAlertas({
      ...vazio,
      hoje: '2026-08-02',
      mesNegativo: { mes: '2026-11-01', saldo: -1 },
      recorrenciasFaltando: [{ descricao: 'Internet', diaEsperado: 5 }],
      contasSemConferencia: [{ nome: 'Corrente', ultimaConferencia: null }],
    });

    const ordenados = ordenarPorGravidade(alertas);
    expect(ordenados.map((a) => a.gravidade)).toEqual(['urgente', 'atencao', 'informativo']);
  });
});
