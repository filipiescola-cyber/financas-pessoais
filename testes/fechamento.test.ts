import { describe, expect, it } from 'vitest';
import {
  PASSOS,
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
