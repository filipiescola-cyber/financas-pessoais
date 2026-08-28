import { describe, expect, it } from 'vitest';
import {
  analisarTexto,
  aplicarDigito,
  apagarDigito,
  formatar,
  formatarSemSimbolo,
  paraCentavos,
  paraNumerico,
} from '../src/dominio/dinheiro';

describe('conversão com o banco', () => {
  it('converte numeric para centavos inteiros', () => {
    expect(paraCentavos(12.5)).toBe(1250);
    expect(paraCentavos(0.05)).toBe(5);
    expect(paraCentavos(-1234.56)).toBe(-123456);
  });

  it('aceita numeric vindo como string', () => {
    expect(paraCentavos('12.50')).toBe(1250);
  });

  it('não deixa resíduo de float virar centavo perdido', () => {
    // 8.7 * 100 = 869.9999999999999 em ponto flutuante; sem o round viraria 869.
    expect(paraCentavos(8.7)).toBe(870);
    expect(paraCentavos(29.29)).toBe(2929);
    expect(paraCentavos(1.15)).toBe(115);
  });

  it('recusa valor que não é número', () => {
    expect(() => paraCentavos('abc')).toThrow();
  });

  it('volta para numeric sem perder valor', () => {
    expect(paraNumerico(1250)).toBe(12.5);
    expect(paraNumerico(paraCentavos(99.99))).toBe(99.99);
  });
});

describe('formatação', () => {
  it('formata em real brasileiro', () => {
    // O Intl usa espaço não separável depois do R$; normalizamos para comparar.
    expect(formatar(1250).replace(/ /g, ' ')).toBe('R$ 12,50');
    expect(formatar(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });

  it('formata sem símbolo para campo de entrada', () => {
    expect(formatarSemSimbolo(123456)).toBe('1.234,56');
  });
});

describe('digitação estilo caixa registradora (§5.1)', () => {
  it('constrói o valor dígito a dígito', () => {
    let valor = 0;
    for (const digito of '1250') valor = aplicarDigito(valor, digito);
    expect(valor).toBe(1250);
    expect(formatar(valor).replace(/ /g, ' ')).toBe('R$ 12,50');
  });

  it('o primeiro dígito são centavos', () => {
    expect(formatar(aplicarDigito(0, '5')).replace(/ /g, ' ')).toBe('R$ 0,05');
  });

  it('ignora o que não é dígito', () => {
    expect(aplicarDigito(1250, ',')).toBe(1250);
    expect(aplicarDigito(1250, 'a')).toBe(1250);
  });

  it('apaga da direita para a esquerda', () => {
    expect(apagarDigito(1250)).toBe(125);
    expect(apagarDigito(1)).toBe(0);
    expect(apagarDigito(0)).toBe(0);
  });

  it('trava antes de estourar o limite da coluna numeric(14,2)', () => {
    const cheio = 99_999_999_999;
    expect(aplicarDigito(cheio, '9')).toBe(cheio);
  });
});

describe('texto colado pelo usuário', () => {
  it('entende os formatos comuns', () => {
    expect(analisarTexto('R$ 1.234,56')).toBe(123456);
    expect(analisarTexto('1234,56')).toBe(123456);
    expect(analisarTexto('1234.56')).toBe(123456);
    expect(analisarTexto('12')).toBe(1200);
    expect(analisarTexto('0,05')).toBe(5);
    expect(analisarTexto('-50')).toBe(-5000);
  });

  it('lê separador de milhar sem inventar decimal', () => {
    expect(analisarTexto('1.234')).toBe(123400);
    expect(analisarTexto('1.234.567,89')).toBe(123456789);
  });

  it('completa um decimal só', () => {
    expect(analisarTexto('12,5')).toBe(1250);
  });

  it('devolve null em vez de chutar', () => {
    expect(analisarTexto('')).toBeNull();
    expect(analisarTexto('abc')).toBeNull();
    expect(analisarTexto('12,345')).toBeNull();
  });
});
