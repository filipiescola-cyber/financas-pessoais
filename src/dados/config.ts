// Configuração chave-valor (§3).
// Guarda o progresso do onboarding (§4.1), as sementes de renda variável (§4.5)
// e, a partir da Fase 3, a última execução das rotinas de abertura (§13.3).

import { supabase } from './supabase';

export type PassoDoOnboarding =
  | 'carteira'
  | 'contas'
  | 'cartoes'
  | 'fatura-aberta'
  | 'parcelamentos'
  | 'despesas-fixas'
  | 'fontes-de-renda'
  | 'empresa'
  | 'categorias';

export const PASSOS: PassoDoOnboarding[] = [
  'carteira',
  'contas',
  'cartoes',
  'fatura-aberta',
  'parcelamentos',
  'despesas-fixas',
  'fontes-de-renda',
  'empresa',
  'categorias',
];

/** Passos que podem ser adiados, com aviso de que a projeção fica incompleta (§4.1). */
export const ADIAVEIS: PassoDoOnboarding[] = ['fatura-aberta', 'parcelamentos'];

export type StatusOnboarding = {
  concluido: boolean;
  passoAtual: PassoDoOnboarding;
  pulados: PassoDoOnboarding[];
};

const PADRAO: StatusOnboarding = { concluido: false, passoAtual: 'carteira', pulados: [] };

export async function lerConfig<T>(chave: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('config')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle();
  if (error) throw error;
  return (data?.valor as T) ?? null;
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  const { error } = await supabase
    .from('config')
    .upsert({ chave, valor: valor as never }, { onConflict: 'chave' });
  if (error) throw new Error(error.message);
}

/**
 * Onboarding retomável (§4.1): o usuário pode parar no passo 3 e voltar depois.
 * O status vem do banco, não do navegador — trocar de aparelho não pode fazer
 * o wizard começar do zero.
 */
export async function lerStatusOnboarding(): Promise<StatusOnboarding> {
  const bruto = await lerConfig<Record<string, unknown>>('onboarding_status');
  if (!bruto) return PADRAO;

  // O seed gravou o formato antigo, com passo numérico. Traduz sem quebrar.
  const passo = bruto.passoAtual ?? bruto.passo_atual;
  const passoValido = PASSOS.includes(passo as PassoDoOnboarding)
    ? (passo as PassoDoOnboarding)
    : 'carteira';

  return {
    concluido: Boolean(bruto.concluido),
    passoAtual: passoValido,
    pulados: Array.isArray(bruto.pulados) ? (bruto.pulados as PassoDoOnboarding[]) : [],
  };
}

export async function gravarStatusOnboarding(status: StatusOnboarding): Promise<void> {
  await gravarConfig('onboarding_status', status);
}

export type SementesDeRenda = {
  /** "Num mês típico, quanto entra?" — cenário provável (§4.5). */
  mesTipico: number;
  /** "Num mês ruim, quanto entra?" — cenário pessimista. */
  mesRuim: number;
};

export async function gravarSementesDeRenda(sementes: SementesDeRenda): Promise<void> {
  await gravarConfig('sementes_renda', sementes);
}
