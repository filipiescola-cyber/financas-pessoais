import { describe, expect, it } from 'vitest';
import {
  conferirEncerramento,
  conferirEncerramentoDeCartao,
  type SituacaoDaConta,
  type SituacaoDoCartao,
} from '../src/dominio/encerramento';

const LIMPA: SituacaoDaConta = {
  saldo: 0,
  recorrenciasAtivas: 0,
  lancamentosFuturos: 0,
  metasVinculadas: 0,
  cartoesQuePagam: 0,
  modelos: 0,
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
    expect(r.bloqueios).toEqual([{ motivo: 'saldo', quantidade: 120000 }]);
  });

  it('saldo negativo bloqueia igual: também é dívida a resolver', () => {
    expect(conferirEncerramento({ ...LIMPA, saldo: -5000 }).pode).toBe(false);
  });

  it('recorrência ativa bloqueia: geraria lançamento numa conta morta', () => {
    // É a pior das pendências porque acontece sozinha, todo mês, sem o
    // usuário ver.
    const r = conferirEncerramento({ ...LIMPA, recorrenciasAtivas: 2 });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'recorrencias', quantidade: 2 }]);
  });

  it('acumula os dois bloqueios em vez de mostrar um por vez', () => {
    const r = conferirEncerramento({ ...LIMPA, saldo: 100, recorrenciasAtivas: 1 });
    expect(r.bloqueios.map((b) => b.motivo)).toEqual(['saldo', 'recorrencias']);
  });

  it('lançamento futuro avisa, não impede: a parcela existe e continua devida', () => {
    const r = conferirEncerramento({ ...LIMPA, lancamentosFuturos: 4 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'lancamentos_futuros', quantidade: 4 }]);
  });

  it('meta vinculada avisa: ela passaria a ler o saldo de uma conta zerada', () => {
    const r = conferirEncerramento({ ...LIMPA, metasVinculadas: 1 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'metas', quantidade: 1 }]);
  });

  it('cartão que paga desta conta avisa: o padrão de pagamento fica velho', () => {
    const r = conferirEncerramento({ ...LIMPA, cartoesQuePagam: 1 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'cartoes', quantidade: 1 }]);
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
    const r = conferirEncerramento({ ...LIMPA, temHistorico: false, metasVinculadas: 1 });
    expect(r.podeExcluir).toBe(false);
  });
});

const CARTAO_LIMPO: SituacaoDoCartao = {
  faturaCobravel: 0,
  faturasFuturas: 0,
  recorrenciasAtivas: 0,
  modelos: 0,
  temHistorico: true,
};

describe('encerrar cartão', () => {
  it('cartão sem dívida nenhuma pode ser encerrado', () => {
    expect(conferirEncerramentoDeCartao(CARTAO_LIMPO).pode).toBe(true);
  });

  it('fatura já cobrável impede: a dívida sairia da tela e o banco continua cobrando', () => {
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, faturaCobravel: -85000 });
    expect(r.pode).toBe(false);
    expect(r.bloqueios).toEqual([{ motivo: 'fatura_cobravel', quantidade: -85000 }]);
  });

  it('fatura futura só avisa: parcelamento em curso é dívida conhecida', () => {
    // Exigir quitar as parcelas para encerrar deixaria o cartão morto na lista
    // por um ano. A tela de faturas continua mostrando o cartão encerrado
    // enquanto sobrar fatura por pagar.
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, faturasFuturas: -240000 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'faturas_futuras', quantidade: -240000 }]);
  });

  it('assinatura cobrada no cartão impede, igual à conta', () => {
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, recorrenciasAtivas: 3 });
    expect(r.pode).toBe(false);
  });

  it('modelo apontando para o cartão avisa: o atalho passa a preencher um cartão morto', () => {
    const r = conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, modelos: 2 });
    expect(r.pode).toBe(true);
    expect(r.avisos).toEqual([{ motivo: 'modelos', quantidade: 2 }]);
  });

  it('cartão sem histórico pode ser apagado de vez', () => {
    expect(
      conferirEncerramentoDeCartao({ ...CARTAO_LIMPO, temHistorico: false }).podeExcluir,
    ).toBe(true);
  });

  it('com fatura paga no passado, nunca apaga', () => {
    expect(conferirEncerramentoDeCartao(CARTAO_LIMPO).podeExcluir).toBe(false);
  });
});
