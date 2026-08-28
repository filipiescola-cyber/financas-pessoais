import { describe, expect, it } from 'vitest';
import {
  conferirEncerramento,
  conferirEncerramentoDeCartao,
  type Item,
  type SituacaoDaConta,
  type SituacaoDoCartao,
} from '../src/dominio/encerramento';

const salario: Item = { id: 'r1', rotulo: 'Salário', detalhe: 'dia 27 · R$ 6.000,00' };
const aluguel: Item = { id: 'r2', rotulo: 'Aluguel', detalhe: 'dia 5 · R$ 1.500,00' };

const LIMPA: SituacaoDaConta = {
  saldo: 0,
  recorrenciasAtivas: [],
  lancamentosFuturos: [],
  metasVinculadas: [],
  cartoesQuePagam: [],
  modelos: [],
  temHistorico: true,
};

describe('encerrar conta', () => {
  it('conta zerada e sem pendência pode ser encerrada', () => {
    expect(conferirEncerramento(LIMPA).pode).toBe(true);
  });

  it('saldo bloqueia: dinheiro não evapora porque a conta fechou', () => {
    // Sem transferir antes, o patrimônio cairia sem nenhum lançamento
    // explicando para onde o dinheiro foi.
    const r = conferirEncerramento({ ...LIMPA, saldo: 120000 });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'saldo', valor: 120000 }]);
  });

  it('saldo negativo bloqueia igual: também é dívida a resolver', () => {
    expect(conferirEncerramento({ ...LIMPA, saldo: -5000 }).pode).toBe(false);
  });

  it('recorrência ativa bloqueia, e devolve quais são', () => {
    // A tela precisa dos itens, não da contagem: "1 recorrência ativa" não
    // responde "desativar qual?", e ninguém clica no que não consegue ver.
    const r = conferirEncerramento({ ...LIMPA, recorrenciasAtivas: [salario, aluguel] });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'recorrencias', itens: [salario, aluguel] }]);
  });

  it('acumula os dois bloqueios em vez de mostrar um por vez', () => {
    const r = conferirEncerramento({ ...LIMPA, saldo: 100, recorrenciasAtivas: [salario] });
    expect(r.bloqueios.map((b) => b.motivo)).toEqual(['saldo', 'recorrencias']);
  });

  it('lançamento futuro avisa, não impede: a parcela existe e continua devida', () => {
    const parcela: Item = { id: 't1', rotulo: 'Notebook 3/12', detalhe: '10/09 · R$ 400,00' };
    const r = conferirEncerramento({ ...LIMPA, lancamentosFuturos: [parcela] });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'lancamentos_futuros', itens: [parcela] }]);
  });

  it('meta vinculada avisa: ela passaria a ler o saldo de uma conta zerada', () => {
    const meta: Item = { id: 'm1', rotulo: 'Reserva' };
    expect(conferirEncerramento({ ...LIMPA, metasVinculadas: [meta] }).avisos).toEqual([
      { motivo: 'metas', itens: [meta] },
    ]);
  });

  it('cartão que paga desta conta avisa: o padrão de pagamento fica velho', () => {
    const cartao: Item = { id: 'c1', rotulo: 'Nubank' };
    expect(conferirEncerramento({ ...LIMPA, cartoesQuePagam: [cartao] }).pode).toBe(true);
  });

  it('atalho apontando para a conta avisa: ele preencheria algo fora de circulação', () => {
    const modelo: Item = { id: 'x1', rotulo: 'Almoço' };
    expect(conferirEncerramento({ ...LIMPA, modelos: [modelo] }).avisos).toEqual([
      { motivo: 'modelos', itens: [modelo] },
    ]);
  });
});

describe('excluir de vez', () => {
  it('conta sem histórico nenhum pode ser apagada — é a criada por engano', () => {
    expect(conferirEncerramento({ ...LIMPA, temHistorico: false }).podeExcluir).toBe(true);
  });

  it('saldo inicial digitado no cadastro não impede apagar', () => {
    // Sem lançamento nenhum, ele é só um número que ninguém usou.
    const r = conferirEncerramento({ ...LIMPA, temHistorico: false, saldo: 50000 });
    expect(r.podeExcluir).toBe(true);
  });

  it('com histórico, nunca — apagar reescreveria meses fechados', () => {
    expect(conferirEncerramento(LIMPA).podeExcluir).toBe(false);
  });

  it('sem histórico mas com meta apontando, não apaga', () => {
    const r = conferirEncerramento({
      ...LIMPA,
      temHistorico: false,
      metasVinculadas: [{ id: 'm1', rotulo: 'Reserva' }],
    });
    expect(r.podeExcluir).toBe(false);
  });
});

const CARTAO_LIMPO: SituacaoDoCartao = {
  faturaCobravel: 0,
  faturasFuturas: 0,
  recorrenciasAtivas: [],
  modelos: [],
  temHistorico: true,
};

describe('encerrar cartão', () => {
  it('cartão sem dívida nenhuma pode ser encerrado', () => {
    expect(conferirEncerramentoDeCartao(CARTAO_LIMPO).pode).toBe(true);
  });

  it('fatura já cobrável impede: a dívida sairia da tela e o banco continua cobrando', () => {
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, faturaCobravel: -85000 });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'fatura_cobravel', valor: -85000 }]);
  });

  it('fatura futura só avisa: parcelamento em curso é dívida conhecida', () => {
    // Exigir quitar as parcelas para encerrar deixaria o cartão morto na lista
    // por um ano. A tela de faturas continua mostrando o cartão encerrado
    // enquanto sobrar fatura por pagar.
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, faturasFuturas: -240000 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'faturas_futuras', valor: -240000 }]);
  });

  it('assinatura cobrada no cartão impede, e diz qual', () => {
    const netflix: Item = { id: 'r9', rotulo: 'Netflix', detalhe: 'dia 12 · R$ 55,90' };
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, recorrenciasAtivas: [netflix] });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'recorrencias', itens: [netflix] }]);
  });

  it('modelo apontando para o cartão avisa: o atalho passa a preencher um cartão morto', () => {
    const r = conferirEncerramentoDeCartao({
      ...CARTAO_LIMPO,
      modelos: [{ id: 'x1', rotulo: 'Gasolina' }],
    });
    expect(r.pode).toBe(true);
  });

  it('cartão sem histórico pode ser apagado de vez', () => {
    expect(conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, temHistorico: false }).podeExcluir).toBe(
      true,
    );
  });

  it('com fatura paga no passado, nunca apaga', () => {
    expect(conferirEncerramentoDeCartao(CARTAO_LIMPO).podeExcluir).toBe(false);
  });
});
