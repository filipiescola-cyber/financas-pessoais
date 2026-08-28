import { describe, expect, it } from 'vitest';
import { passoDeEntrada, PASSOS, STATUS_INICIAL } from '../src/dominio/onboarding';

describe('onde o wizard abre (§4.1)', () => {
  it('em andamento, retoma de onde parou', () => {
    expect(
      passoDeEntrada({ concluido: false, passoAtual: 'cartoes', pulados: [] }),
    ).toBe('cartoes');
  });

  it('NÃO abre no último passo depois de concluído', () => {
    // O bug que motivou este arquivo: o passo gravado é onde o usuário parou,
    // e depois de concluir isso é o último. Entrar por ele deixava a tela sem
    // nada para fazer além de concluir de novo.
    const entrada = passoDeEntrada({
      concluido: true,
      passoAtual: 'categorias',
      pulados: [],
    });
    expect(entrada).not.toBe('categorias');
    expect(entrada).toBe('carteira');
  });

  it('concluído com passo adiado, abre no adiado', () => {
    // É o que o banner do Início promete quando diz "preencher agora".
    expect(
      passoDeEntrada({
        concluido: true,
        passoAtual: 'categorias',
        pulados: ['parcelamentos'],
      }),
    ).toBe('parcelamentos');
  });

  it('com mais de um adiado, abre no primeiro da ordem do wizard', () => {
    expect(
      passoDeEntrada({
        concluido: true,
        passoAtual: 'categorias',
        pulados: ['parcelamentos', 'fatura-aberta'],
      }),
    ).toBe('fatura-aberta');
  });

  it('app recém-instalado começa no primeiro passo', () => {
    expect(passoDeEntrada(STATUS_INICIAL)).toBe(PASSOS[0]);
    expect(PASSOS[0]).toBe('carteira');
  });
});
