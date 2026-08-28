// Natureza: fixa, variável e eventual (§2.5, §2.7).
//
// A natureza mora na categoria e pode ser sobrescrita na transação. É ela que
// decide dois números que o app não pode errar:
//
//   - o custo de vida mínimo = soma das FIXAS. Para MEI, é o piso do pró-labore.
//   - a renda projetada = só receita FIXA e VARIÁVEL. Eventual fica de fora (§8.3).
//
// A segunda regra é a que mais dá problema quando ignorada: uma venda de bem
// pessoal de R$ 3.000 dentro da janela de 6 meses distorce a mediana e faz o app
// dizer que você pode gastar mais do que pode (§2.7).

export type Natureza = 'fixa' | 'variavel' | 'eventual';

export type ComNatureza = { natureza: Natureza | null };

/** A da transação vence a da categoria. Sem nenhuma das duas, null. */
export function naturezaEfetiva(
  transacao: ComNatureza,
  categoria: ComNatureza | null,
): Natureza | null {
  return transacao.natureza ?? categoria?.natureza ?? null;
}

/**
 * Receita eventual entra no caixa e fica FORA do cálculo de renda projetada.
 * Natureza ausente também fica de fora: sem saber o que é, não entra em projeção.
 */
export function entraNaProjecaoDeRenda(natureza: Natureza | null): boolean {
  return natureza === 'fixa' || natureza === 'variavel';
}

/** Custo de vida mínimo: o que precisa entrar todo mês para nada atrasar. */
export function ehCustoDeVidaMinimo(natureza: Natureza | null): boolean {
  return natureza === 'fixa';
}

/** Onde dá para cortar. Relatório de corte de gasto só faz sentido aqui. */
export function ehCortavel(natureza: Natureza | null): boolean {
  return natureza === 'variavel';
}

/**
 * Despesa eventual precisa de provisão mensal: o valor anual dividido por 12,
 * reservado todo mês. Sem isso o IPVA de janeiro sempre parece um desastre (§2.5).
 */
export function provisaoMensal(valorAnual: number): number {
  return Math.round(valorAnual / 12);
}

export const ROTULOS: Record<Natureza, string> = {
  fixa: 'Fixa',
  variavel: 'Variável',
  eventual: 'Eventual',
};
