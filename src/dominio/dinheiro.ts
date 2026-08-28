// Dinheiro (§13.1).
//
// Regra central: dentro do app, dinheiro é SEMPRE inteiro em centavos.
// Ponto flutuante só aparece na fronteira com o banco, e é convertido na entrada.
// Motivo: 0.1 + 0.2 !== 0.3 em JavaScript, e num app financeiro isso vira
// diferença de centavo que ninguém acha depois.
//
// O banco guarda numeric(14,2); o PostgREST devolve isso como número JS (ou
// string, dependendo da versão). As duas formas são tratadas em paraCentavos.

export type Centavos = number;

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Converte o que veio do banco (numeric) para centavos inteiros. */
export function paraCentavos(valor: number | string): Centavos {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) {
    throw new Error(`Valor monetário inválido vindo do banco: ${String(valor)}`);
  }
  // Math.round resolve o resíduo de float: 8.7 * 100 = 869.9999...
  return Math.round(numero * 100);
}

/** Converte centavos para o formato que o banco espera em numeric(14,2). */
export function paraNumerico(centavos: Centavos): number {
  return centavos / 100;
}

/**
 * Formata para exibição. Arredondar aqui é seguro porque centavos já é inteiro —
 * não há arredondamento em cascata (§13.1).
 */
export function formatar(centavos: Centavos): string {
  return FORMATADOR.format(centavos / 100);
}

/** Formata sem o símbolo, para campos de entrada: 1250 -> "12,50". */
export function formatarSemSimbolo(centavos: Centavos): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Digitação estilo caixa registradora (§5.1): o usuário digita 1, 2, 5, 0 e vê
 * R$ 0,01 -> R$ 0,12 -> R$ 1,25 -> R$ 12,50. Nunca digita vírgula nem "R$".
 */
export function aplicarDigito(atual: Centavos, digito: string): Centavos {
  if (!/^[0-9]$/.test(digito)) return atual;
  const proximo = atual * 10 + Number(digito);
  // Trava em 999.999.999,99 — acima disso é erro de digitação, não patrimônio.
  return proximo > 99_999_999_999 ? atual : proximo;
}

/** Backspace da digitação estilo caixa registradora. */
export function apagarDigito(atual: Centavos): Centavos {
  return Math.trunc(atual / 10);
}

/**
 * Interpreta texto colado pelo usuário: "R$ 1.234,56", "1234,56", "1234.56".
 * Devolve null quando não dá para entender — nunca chuta.
 */
export function analisarTexto(texto: string): Centavos | null {
  const limpo = texto.replace(/[R$\s ]/gi, '');
  if (limpo === '' || !/^-?[\d.,]+$/.test(limpo)) return null;

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  // Qual separador é o decimal, seguindo a convenção pt-BR (vírgula decimal,
  // ponto milhar) e ainda assim tolerando texto colado de fonte em inglês:
  //   - os dois presentes -> o ÚLTIMO é o decimal ("1.234,56" e "1,234.56");
  //   - só vírgula -> decimal, sempre. "12,345" tem 3 casas e é inválido;
  //   - só ponto -> decimal, exceto quando seguido de exatamente 3 dígitos,
  //     que em pt-BR é milhar: "1.234" são mil duzentos e trinta e quatro.
  // Os demais separadores são milhar e somem.
  const virgula = semSinal.lastIndexOf(',');
  const ponto = semSinal.lastIndexOf('.');
  const separador = Math.max(virgula, ponto);
  const depois = separador === -1 ? '' : semSinal.slice(separador + 1);

  const ehDecimal =
    separador !== -1 &&
    (virgula !== -1 && ponto !== -1
      ? true
      : virgula !== -1
        ? true
        : depois.length !== 3);

  const inteiros = (ehDecimal ? semSinal.slice(0, separador) : semSinal).replace(/[.,]/g, '');
  const decimais = ehDecimal ? depois : '';

  if (decimais.length > 2) return null;
  if (!/^\d*$/.test(inteiros) || !/^\d*$/.test(decimais)) return null;
  if (inteiros === '' && decimais === '') return null;

  const centavos = Number(inteiros || '0') * 100 + Number(decimais.padEnd(2, '0') || '0');
  return negativo ? -centavos : centavos;
}
