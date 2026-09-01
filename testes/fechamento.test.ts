import { describe, expect, it } from 'vitest';
import {
  PASSOS,
  faltaramNoMes,
  passoEstaFeito,
  progressoDoFechamento,
  type PendenciasDoMes,
} from '../src/dominio/fechamento';

const limpo: PendenciasDoMes = {
  contasPorConferir: 0,
  lancamentosSemCategoria: 0,
  recorrenciasQueFaltaram: 0,
};

const sujo: PendenciasDoMes = {
  contasPorConferir: 2,
  lancamentosSemCategoria: 5,
  recorrenciasQueFaltaram: 1,
};

describe('passos do fechamento', () => {
  it('o que os dados resolvem não precisa de check', () => {
    // Guardar essa resposta criaria o mesmo fato em dois lugares, e o guardado
    // ficaria para trás na primeira recategorização.
    expect(passoEstaFeito('categorias', new Set(), limpo)).toBe(true);
    expect(passoEstaFeito('categorias', new Set(), sujo)).toBe(false);
  });

  it('o que é ato só a pessoa dá por feito', () => {
    expect(passoEstaFeito('backup', new Set(), limpo)).toBe(false);
    expect(passoEstaFeito('backup', new Set(['backup']), limpo)).toBe(true);
  });

  it('marcar à mão vence a pendência: quem resolveu por fora sabe', () => {
    expect(passoEstaFeito('conferencia', new Set(['conferencia']), sujo)).toBe(true);
  });
});

describe('progresso', () => {
  it('conta os dois tipos juntos', () => {
    const p = progressoDoFechamento(new Set(['resumo']), limpo);
    expect(p.total).toBe(PASSOS.length);
    expect(p.feitos).toBe(4);
    expect(p.concluido).toBe(false);
  });

  it('concluído é TODOS, não um número escrito à mão', () => {
    // O defeito que isto fecha: a tela dizia "concluído" com `size >= 4`, e
    // continuaria dizendo depois de um passo novo ser acrescentado.
    const tudo = new Set(['resumo', 'orcamento', 'backup']);
    expect(progressoDoFechamento(tudo, limpo).concluido).toBe(true);
    expect(progressoDoFechamento(tudo, sujo).concluido).toBe(false);
  });

  it('o próximo é o primeiro que falta, na ordem do ritual', () => {
    expect(progressoDoFechamento(new Set(), sujo).proximo).toBe('conferencia');
    expect(progressoDoFechamento(new Set(['conferencia']), sujo).proximo).toBe('categorias');
    expect(progressoDoFechamento(new Set(), limpo).proximo).toBe('resumo');
  });

  it('nada a fazer não tem próximo', () => {
    const tudo = new Set(PASSOS);
    expect(progressoDoFechamento(tudo, sujo).proximo).toBeNull();
  });
});

describe('o que faltou no mês', () => {
  const item = (situacao: string, dataCaixa: string, descricao = 'x') => ({
    situacao,
    dataCaixa,
    descricao,
  });

  it('cobrança de cartão que vence depois não é conta esquecida', () => {
    // A assinatura de 10/08 entra na fatura que vence em setembro: dinheiro
    // nenhum devia ter saído em agosto. Listá-la manda procurar um problema
    // que não existe.
    const faltaram = faltaramNoMes(
      [item('atrasado', '2026-09-14', 'Curso de Inglês')],
      '2026-08-31',
    );
    expect(faltaram).toEqual([]);
  });

  it('conta fora do cartão continua sendo cobrada', () => {
    const faltaram = faltaramNoMes([item('atrasado', '2026-08-10', 'Aluguel')], '2026-08-31');
    expect(faltaram).toHaveLength(1);
  });

  it('o que já foi lançado nunca entra', () => {
    expect(faltaramNoMes([item('lancado', '2026-08-10')], '2026-08-31')).toEqual([]);
    expect(faltaramNoMes([item('aguardando', '2026-08-10')], '2026-08-31')).toEqual([]);
  });

  it('cobrança de cartão que vence DENTRO do mês conta', () => {
    // Compra de julho cuja fatura venceu em agosto: aí o dinheiro era para ter
    // saído no mês que se está fechando.
    expect(faltaramNoMes([item('atrasado', '2026-08-14')], '2026-08-31')).toHaveLength(1);
  });
});
