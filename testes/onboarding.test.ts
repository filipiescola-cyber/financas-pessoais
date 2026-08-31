import { describe, expect, it } from 'vitest';
import {
  STATUS_INICIAL,
  passoDeEntrada,
  passosDaTrilha,
  soExplica,
  trilhaDe,
} from '../src/dominio/onboarding';

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
    expect(entrada).toBe('trilha');
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

  it('app recém-instalado começa pela escolha da trilha', () => {
    // Antes começava direto na carteira. A escolha vem antes porque decide o
    // tamanho de tudo que vem depois — e escolher isso no meio seria pedir
    // para o usuário reavaliar um caminho que ele já começou a andar.
    expect(passoDeEntrada(STATUS_INICIAL)).toBe('trilha');
  });
});

describe('trilhas', () => {
  it('a rápida é mais curta, mas não abre mão do piso', () => {
    const rapida = passosDaTrilha('rapida');
    const completa = passosDaTrilha('completa');

    expect(rapida.length).toBeLessThan(completa.length);

    // Sem fatura aberta e parcelamentos os próximos meses aparecem
    // artificialmente baratos (§4.1). Isso não é "detalhe da trilha completa".
    expect(rapida).toContain('fatura-aberta');
    expect(rapida).toContain('parcelamentos');
    expect(rapida).toContain('fontes-de-renda');
  });

  it('nenhum passo que só explica entra na trilha rápida', () => {
    // Onboarding longo é onde se abandona: quem escolheu rápido escolheu
    // cadastrar, não ler.
    for (const passo of passosDaTrilha('rapida')) {
      if (passo === 'trilha') continue;
      expect(soExplica(passo)).toBe(false);
    }
  });

  it('a completa contém tudo da rápida', () => {
    const completa = passosDaTrilha('completa');
    for (const passo of passosDaTrilha('rapida')) {
      expect(completa).toContain(passo);
    }
  });

  it('as duas começam pela escolha da trilha', () => {
    expect(passosDaTrilha('rapida')[0]).toBe('trilha');
    expect(passosDaTrilha('completa')[0]).toBe('trilha');
  });
});

describe('entrada com trilha', () => {
  it('quem começou antes da escolha existir cai na rápida', () => {
    expect(trilhaDe({ concluido: false, passoAtual: 'contas', pulados: [] })).toBe('rapida');
  });

  it('passo gravado que não existe na trilha atual volta para o começo', () => {
    // Trocar de completa para rápida pode deixar o usuário parado num passo de
    // conceito que a trilha nova não tem — e uma tela inalcançável trava o
    // wizard sem dizer por quê.
    const status = {
      concluido: false,
      passoAtual: 'conceito-cartao' as const,
      pulados: [],
      trilha: 'rapida' as const,
    };
    expect(passoDeEntrada(status)).toBe('trilha');
  });

  it('concluído com passo adiado abre no adiado, respeitando a trilha', () => {
    const status = {
      concluido: true,
      passoAtual: 'categorias' as const,
      pulados: ['parcelamentos' as const],
      trilha: 'completa' as const,
    };
    expect(passoDeEntrada(status)).toBe('parcelamentos');
  });
});
