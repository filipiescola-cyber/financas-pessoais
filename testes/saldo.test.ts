import { describe, expect, it } from 'vitest';
import {
  empresaComSaldoSuspeito,
  entraNoConsolidado,
  rotuloDaContaEmpresa,
  saldoConsolidado,
  saldoDaConta,
  type TransacaoParaSaldo,
} from '../src/dominio/saldo';

const HOJE = '2026-08-27';

const t = (
  valor: number,
  dataCaixa: string,
  transacaoPaiId: string | null = null,
): TransacaoParaSaldo => ({ valor, dataCaixa, transacaoPaiId });

describe('saldo da conta (§13.2)', () => {
  it('soma o saldo inicial com o que já passou', () => {
    const saldo = saldoDaConta(100000, [t(-2500, '2026-08-10'), t(50000, '2026-08-20')], HOJE);
    expect(saldo).toBe(147500);
  });

  it('inclui o que aconteceu hoje', () => {
    expect(saldoDaConta(0, [t(-1000, HOJE)], HOJE)).toBe(-1000);
  });

  it('IGNORA transação futura', () => {
    // Parcela e recorrência já existem no banco com data à frente (§13.2).
    // Contá-las no saldo de hoje é o erro mais fácil do projeto.
    const saldo = saldoDaConta(100000, [t(-30000, '2026-09-27'), t(-30000, '2026-10-27')], HOJE);
    expect(saldo).toBe(100000);
  });

  it('IGNORA filha de divisão de transação (§5.5)', () => {
    // O pai já moveu o saldo; as filhas existem para o relatório por categoria.
    const saldo = saldoDaConta(
      0,
      [t(-20000, '2026-08-15'), t(-12000, '2026-08-15', 'pai'), t(-8000, '2026-08-15', 'pai')],
      HOJE,
    );
    expect(saldo).toBe(-20000);
  });

  it('conta vazia devolve o saldo inicial', () => {
    expect(saldoDaConta(35000, [], HOJE)).toBe(35000);
  });
});

describe('consolidado — quanto tenho para gastar', () => {
  const conta = (tipo: Parameters<typeof entraNoConsolidado>[0]['tipo'], saldoAtual: number, ativo = true) =>
    ({ tipo, ativo, saldoInicial: 0, saldoAtual }) as const;

  it('soma corrente, poupança, carteira e investimento', () => {
    const total = saldoConsolidado([
      conta('corrente', 100000),
      conta('poupanca', 50000),
      conta('carteira', 8000),
      conta('investimento', 200000),
    ]);
    expect(total).toBe(358000);
  });

  it('NÃO soma a conta Empresa (§2.6)', () => {
    // É dinheiro emprestado ao negócio, não disponível para gastar.
    const total = saldoConsolidado([conta('corrente', 100000), conta('empresa', 250000)]);
    expect(total).toBe(100000);
  });

  it('NÃO soma dívida nem cartão', () => {
    const total = saldoConsolidado([
      conta('corrente', 100000),
      conta('divida', -800000),
      conta('cartao_credito', -45000),
    ]);
    expect(total).toBe(100000);
  });

  it('NÃO soma conta arquivada (§4.8)', () => {
    const total = saldoConsolidado([conta('corrente', 100000), conta('corrente', 70000, false)]);
    expect(total).toBe(100000);
  });
});

describe('rótulo da conta Empresa (§2.6)', () => {
  it('nunca usa a palavra "Saldo"', () => {
    // Número subindo, pintado de verde, lê-se como boa notícia — e significa
    // o contrário: é dinheiro seu parado dentro do negócio.
    expect(rotuloDaContaEmpresa(250000)).toBe('A empresa te deve');
    expect(rotuloDaContaEmpresa(0)).toBe('Nada parado no negócio');
    expect(rotuloDaContaEmpresa(-1000)).toBe('Você retirou mais do que aportou');
  });

  it('sinaliza saldo negativo como suspeito de erro de lançamento', () => {
    // Quase sempre é pró-labore marcado como devolução de aporte.
    expect(empresaComSaldoSuspeito(-1)).toBe(true);
    expect(empresaComSaldoSuspeito(0)).toBe(false);
  });
});
