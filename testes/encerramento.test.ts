import { describe, expect, it } from 'vitest';
import { conferirEncerramento, type SituacaoDaConta } from '../src/dominio/encerramento';

const LIMPA: SituacaoDaConta = {
  saldo: 0,
  recorrenciasAtivas: 0,
  lancamentosFuturos: 0,
  metasVinculadas: 0,
  cartoesQuePagam: 0,
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
