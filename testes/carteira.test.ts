import { describe, expect, it } from 'vitest';
import { organizarCarteira, type ItemDaCarteira } from '../src/dominio/carteira';

const i = (p: Partial<ItemDaCarteira> & { nome: string; saldo: number }): ItemDaCarteira => ({
  instituicao: null,
  tipo: 'cdb',
  vencimento: null,
  ...p,
});

const carteira = [
  i({ nome: 'CDB Nubank', instituicao: 'Nubank', tipo: 'cdb', saldo: 500000, vencimento: '2027-03-01' }),
  i({ nome: 'RDB caixinha', instituicao: 'Nubank', tipo: 'outro', saldo: 100000 }),
  i({ nome: 'Tesouro Selic', instituicao: 'Itaú', tipo: 'tesouro', saldo: 800000, vencimento: '2029-03-01' }),
];

describe('organizar a carteira', () => {
  it('sem agrupar, devolve um grupo só com o total de tudo', () => {
    const [grupo] = organizarCarteira(carteira, 'nenhum', 'valor');
    expect(grupo?.itens).toHaveLength(3);
    expect(grupo?.total).toBe(1400000);
  });

  it('agrupa por instituição e soma cada uma', () => {
    // A pergunta que isso responde: quanto está no Nubank.
    const grupos = organizarCarteira(carteira, 'instituicao', 'valor');
    expect(grupos.map((g) => [g.titulo, g.total])).toEqual([
      ['Itaú', 800000],
      ['Nubank', 600000],
    ]);
  });

  it('grupos vêm do maior total para o menor', () => {
    const grupos = organizarCarteira(carteira, 'instituicao', 'valor');
    expect(grupos[0]?.titulo).toBe('Itaú');
  });

  it('aplicação sem instituição não some: vai para um grupo próprio', () => {
    const grupos = organizarCarteira([...carteira, i({ nome: 'Cripto', saldo: 1000 })], 'instituicao', 'valor');
    expect(grupos.map((g) => g.titulo)).toContain('Sem instituição');
  });

  it('agrupa por tipo usando o rótulo de fora', () => {
    const grupos = organizarCarteira(carteira, 'tipo', 'valor', (t) =>
      ({ cdb: 'CDB', tesouro: 'Tesouro Direto', outro: 'Outro' })[t] ?? t,
    );
    expect(grupos.map((g) => g.titulo)).toEqual(['Tesouro Direto', 'CDB', 'Outro']);
  });

  it('ordena por valor, do maior para o menor', () => {
    const [grupo] = organizarCarteira(carteira, 'nenhum', 'valor');
    expect(grupo?.itens.map((x) => x.nome)).toEqual(['Tesouro Selic', 'CDB Nubank', 'RDB caixinha']);
  });

  it('ordena por nome em português', () => {
    const [grupo] = organizarCarteira(carteira, 'nenhum', 'nome');
    expect(grupo?.itens.map((x) => x.nome)).toEqual(['CDB Nubank', 'RDB caixinha', 'Tesouro Selic']);
  });

  it('por vencimento, o mais próximo primeiro e quem não vence por último', () => {
    // Liquidez diária não tem data. Empurrá-la para cima esconderia justamente
    // o que precisa de decisão em breve.
    const [grupo] = organizarCarteira(carteira, 'nenhum', 'vencimento');
    expect(grupo?.itens.map((x) => x.nome)).toEqual(['CDB Nubank', 'Tesouro Selic', 'RDB caixinha']);
  });

  it('carteira vazia não vira grupo nenhum', () => {
    expect(organizarCarteira([], 'instituicao', 'valor')).toEqual([]);
    expect(organizarCarteira([], 'nenhum', 'valor')).toEqual([]);
  });
});
