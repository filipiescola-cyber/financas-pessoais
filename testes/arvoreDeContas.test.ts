import { describe, expect, it } from 'vitest';
import { agruparEmArvore, principaisPossiveis } from '../src/dominio/arvoreDeContas';

const c = (id: string, contaPaiId: string | null = null) => ({ id, contaPaiId });

describe('contas em dois níveis', () => {
  it('subconta entra debaixo da principal', () => {
    const arvore = agruparEmArvore([c('nubank'), c('caixinha', 'nubank')]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]?.conta.id).toBe('nubank');
    expect(arvore[0]?.subcontas.map((s) => s.id)).toEqual(['caixinha']);
  });

  it('conta sem subconta vem sozinha, sem virar caso especial', () => {
    const arvore = agruparEmArvore([c('carteira')]);
    expect(arvore).toEqual([{ conta: c('carteira'), subcontas: [] }]);
  });

  it('mantém a ordem em que as principais chegaram', () => {
    // A consulta já ordena por nome; reordenar aqui seria decidir duas vezes.
    const arvore = agruparEmArvore([c('a'), c('b'), c('a1', 'a'), c('c')]);
    expect(arvore.map((n) => n.conta.id)).toEqual(['a', 'b', 'c']);
  });

  it('uma principal com várias subcontas junta todas', () => {
    const arvore = agruparEmArvore([c('nubank'), c('caixinha', 'nubank'), c('reserva', 'nubank')]);
    expect(arvore[0]?.subcontas.map((s) => s.id)).toEqual(['caixinha', 'reserva']);
  });

  it('subconta órfã sobe para o topo em vez de sumir', () => {
    // Acontece quando a principal foi arquivada ou filtrada: sem isto o filho
    // ficaria invisível, com o saldo dele entrando na soma do mesmo jeito.
    const arvore = agruparEmArvore([c('caixinha', 'nubank-arquivado')]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0]?.conta.id).toBe('caixinha');
  });

  it('lista vazia não vira nó nenhum', () => {
    expect(agruparEmArvore([])).toEqual([]);
  });
});

describe('quem pode ser conta principal', () => {
  const lista = [c('nubank'), c('caixinha', 'nubank'), c('carteira')];

  it('subconta não pode ser principal de outra: um nível só', () => {
    expect(principaisPossiveis(lista, 'nova').map((x) => x.id)).toEqual(['nubank', 'carteira']);
  });

  it('a própria conta não aparece na lista dela', () => {
    expect(principaisPossiveis(lista, 'carteira').map((x) => x.id)).toEqual(['nubank']);
  });

  it('quem já tem subcontas não sobra escolha nenhuma: seria o terceiro nível', () => {
    // Nubank já é principal da Caixinha. Torná-la subconta de outra empurraria
    // a Caixinha para um nível que a lista não desenha.
    expect(principaisPossiveis(lista, 'nubank')).toEqual([]);
  });
});
