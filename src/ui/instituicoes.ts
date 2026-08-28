/**
 * Instituições conhecidas, com a cor que vai junto (§4).
 *
 * A lista é atalho, não cadastro: digitar o nome de qualquer outra continua
 * valendo, e nada aqui é validado contra o que o usuário escreve. Um banco que
 * mude de marca, ou que saia desta lista, não invalida conta nenhuma — o que
 * fica gravado é o texto e a cor, não uma referência.
 *
 * As cores são as de marca, com uma correção: as muito escuras (C6, XP) foram
 * clareadas. Um ponto preto sobre o tema escuro não é um ponto, é um buraco.
 */
export type Instituicao = { nome: string; cor: string };

export const INSTITUICOES: readonly Instituicao[] = [
  { nome: 'Nubank', cor: '#a855f7' },
  { nome: 'Itaú', cor: '#f97316' },
  { nome: 'Bradesco', cor: '#e11d48' },
  { nome: 'Banco do Brasil', cor: '#eab308' },
  { nome: 'Caixa', cor: '#0ea5e9' },
  { nome: 'Santander', cor: '#ef4444' },
  { nome: 'Inter', cor: '#fb923c' },
  { nome: 'C6 Bank', cor: '#64748b' },
  { nome: 'BTG', cor: '#38bdf8' },
  { nome: 'XP', cor: '#94a3b8' },
  { nome: 'Mercado Pago', cor: '#22d3ee' },
  { nome: 'PicPay', cor: '#22c55e' },
  { nome: 'Neon', cor: '#06b6d4' },
  { nome: 'Sicoob', cor: '#10b981' },
  { nome: 'Sicredi', cor: '#65a30d' },
  { nome: 'Banrisul', cor: '#3b82f6' },
  { nome: 'Will Bank', cor: '#f5c518' },
  { nome: 'Original', cor: '#14b8a6' },
];

/**
 * Cores para quem digitou uma instituição que não está na lista.
 *
 * Poucas e bem separadas de propósito: a cor aqui serve para diferenciar duas
 * contas de relance, e vinte tons de azul não diferenciam nada.
 */
export const CORES_DE_CONTA: readonly string[] = [
  '#a855f7',
  '#f97316',
  '#e11d48',
  '#eab308',
  '#0ea5e9',
  '#22c55e',
  '#14b8a6',
  '#f472b6',
  '#94a3b8',
];

/** A cor sugerida para um nome de instituição, se ele for conhecido. */
export function corDaInstituicao(nome: string): string | null {
  const alvo = nome.trim().toLowerCase();
  return INSTITUICOES.find((i) => i.nome.toLowerCase() === alvo)?.cor ?? null;
}
