// Rendimento de renda fixa (§7).
//
// O valor calculado aqui é ESTIMATIVA, nunca saldo real (§7.3, §14). O número
// verdadeiro é o do banco ou da corretora, e o app tem uma tela de conferência
// justamente porque acreditar num número inventado por meses é o modo de falha
// mais caro desta parte.

import type { Centavos } from './dinheiro';
import { DIAS_UTEIS_NO_ANO, diasCorridosEntre, diasUteisEntre, type Feriados } from './diasUteis';
import type { DataISO } from './datas';

export type Indexador = 'CDI' | 'SELIC' | 'IPCA' | 'PREFIXADO';

export type Aplicacao = {
  valorAplicado: Centavos;
  dataAplicacao: DataISO;
  indexador: Indexador | null;
  /** 110 = 110% do CDI. */
  percentualIndexador: number | null;
  /** % ao ano, quando prefixado. */
  taxaPrefixada: number | null;
  isentoIR: boolean;
};

/**
 * Taxa anual efetiva da aplicação, em decimal (0.12 = 12% a.a.).
 *
 * Devolve null quando falta a informação — e a tela precisa dizer isso em vez
 * de mostrar rendimento zero, que pareceria "não rendeu" em vez de "não sei"
 * (§13.5).
 */
export function taxaAnual(aplicacao: Aplicacao, taxaDoIndexador: number | null): number | null {
  if (aplicacao.indexador === 'PREFIXADO' || aplicacao.indexador === null) {
    return aplicacao.taxaPrefixada === null ? null : aplicacao.taxaPrefixada / 100;
  }

  if (taxaDoIndexador === null) return null;

  const percentual = (aplicacao.percentualIndexador ?? 100) / 100;
  return (taxaDoIndexador / 100) * percentual;
}

/**
 * Fator de um dia útil, a partir da taxa anual (§7.1).
 *
 *   fator_dia = (1 + taxa_anual) ^ (1/252) - 1
 */
export function fatorDiario(taxaAnualDecimal: number): number {
  return (1 + taxaAnualDecimal) ** (1 / DIAS_UTEIS_NO_ANO) - 1;
}

/**
 * Saldo bruto depois de N dias úteis de capitalização composta.
 *
 * Arredonda só no fim, uma vez: arredondar a cada dia acumularia erro dia após
 * dia, que é exatamente o arredondamento em cascata que o §13.1 proíbe.
 */
export function saldoBruto(
  valorAplicado: Centavos,
  taxaAnualDecimal: number,
  diasUteis: number,
): Centavos {
  if (diasUteis <= 0) return valorAplicado;
  return Math.round(valorAplicado * (1 + fatorDiario(taxaAnualDecimal)) ** diasUteis);
}

export type FaixaDeIR = { diasMin: number; diasMax: number | null; aliquota: number };

/**
 * Alíquota de IR pela tabela regressiva (§7.2).
 *
 * A tabela vem do banco, nunca hardcoded (§14): regra tributária muda, e um
 * número cravado no código vira erro silencioso no dia em que mudar.
 */
export function aliquotaDeIR(diasCorridos: number, tabela: readonly FaixaDeIR[]): number {
  const faixa = tabela.find(
    (f) => diasCorridos >= f.diasMin && (f.diasMax === null || diasCorridos <= f.diasMax),
  );
  // Sem faixa aplicável, assume a mais alta: errar para menos no imposto criaria
  // uma expectativa de saldo que o resgate não confirma.
  return faixa?.aliquota ?? Math.max(...tabela.map((f) => f.aliquota), 0);
}

/**
 * IOF sobre o RENDIMENTO em resgate antes de 30 dias (§7.2).
 *
 * A tabela oficial é regressiva de 96% no primeiro dia a 0% no trigésimo, e
 * segue exatamente esta fórmula — por isso ela é calculada em vez de copiada.
 */
export function aliquotaDeIOF(diasCorridos: number): number {
  if (diasCorridos >= 30) return 0;
  if (diasCorridos <= 0) return 0.96;
  return Math.floor(((30 - diasCorridos) / 30) * 100) / 100;
}

export type Resultado = {
  diasUteis: number;
  diasCorridos: number;
  saldoBruto: Centavos;
  rendimentoBruto: Centavos;
  ir: Centavos;
  iof: Centavos;
  saldoLiquido: Centavos;
  aliquotaIR: number;
  /** null quando falta taxa: a tela mostra "ainda não sei", não zero. */
  taxaAnualUsada: number | null;
};

/**
 * Bruto e líquido lado a lado (§7.2). "O bruto anima, o líquido é o que o
 * usuário realmente recebe."
 *
 * Imposto incide só sobre o rendimento, nunca sobre o principal.
 */
export function calcular(
  aplicacao: Aplicacao,
  taxaDoIndexador: number | null,
  ate: DataISO,
  feriados: Feriados,
  tabelaDeIR: readonly FaixaDeIR[],
): Resultado {
  const diasUteis = diasUteisEntre(aplicacao.dataAplicacao, ate, feriados);
  const diasCorridos = diasCorridosEntre(aplicacao.dataAplicacao, ate);
  const taxa = taxaAnual(aplicacao, taxaDoIndexador);

  if (taxa === null) {
    return {
      diasUteis,
      diasCorridos,
      saldoBruto: aplicacao.valorAplicado,
      rendimentoBruto: 0,
      ir: 0,
      iof: 0,
      saldoLiquido: aplicacao.valorAplicado,
      aliquotaIR: 0,
      taxaAnualUsada: null,
    };
  }

  const bruto = saldoBruto(aplicacao.valorAplicado, taxa, diasUteis);
  const rendimentoBruto = bruto - aplicacao.valorAplicado;

  // IOF entra antes do IR e reduz a base sobre a qual o IR incide.
  const iof = Math.round(rendimentoBruto * aliquotaDeIOF(diasCorridos));
  const baseDoIR = rendimentoBruto - iof;

  const aliquota = aplicacao.isentoIR ? 0 : aliquotaDeIR(diasCorridos, tabelaDeIR);
  const ir = Math.round(baseDoIR * aliquota);

  return {
    diasUteis,
    diasCorridos,
    saldoBruto: bruto,
    rendimentoBruto,
    ir,
    iof,
    saldoLiquido: bruto - ir - iof,
    aliquotaIR: aliquota,
    taxaAnualUsada: taxa,
  };
}
