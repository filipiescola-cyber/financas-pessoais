// Configuração chave-valor (§3).
// Guarda o progresso do onboarding (§4.1), as sementes de renda variável (§4.5)
// e, a partir da Fase 3, a última execução das rotinas de abertura (§13.3).

import {
  passosDaTrilha,
  STATUS_INICIAL,
  type PassoDoOnboarding,
  type StatusOnboarding,
  type Trilha,
} from '../dominio/onboarding';
import { supabase } from './supabase';

// Os passos e a regra de entrada moram no domínio; aqui fica só a persistência.
export {
  ADIAVEIS,
  passoDeEntrada,
  passosDaTrilha,
  soExplica,
  STATUS_INICIAL,
  trilhaDe,
  type PassoDoOnboarding,
  type StatusOnboarding,
  type Trilha,
} from '../dominio/onboarding';

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
    // A chave primária é (usuario_id, chave) desde o multiusuário: `chave`
    // sozinha deixou de ser única, e o upsert por ela dava erro de restrição.
    // O usuario_id não vai no payload — o default `auth.uid()` preenche.
    .upsert({ chave, valor: valor as never }, { onConflict: 'usuario_id,chave' });
  if (error) throw new Error(error.message);
}

/**
 * Onboarding retomável (§4.1): o usuário pode parar no passo 3 e voltar depois.
 * O status vem do banco, não do navegador — trocar de aparelho não pode fazer
 * o wizard começar do zero.
 */
export async function lerStatusOnboarding(): Promise<StatusOnboarding> {
  const bruto = await lerConfig<Record<string, unknown>>('onboarding_status');
  if (!bruto) return STATUS_INICIAL;

  const trilha = bruto.trilha === 'completa' ? ('completa' as Trilha) : undefined;

  // O seed gravou o formato antigo, com passo numérico. Traduz sem quebrar.
  // Um passo desconhecido cai no primeiro da trilha em vez de travar o wizard
  // numa tela que ela não tem.
  const passo = bruto.passoAtual ?? bruto.passo_atual;
  const daTrilha = passosDaTrilha(trilha ?? 'rapida');
  const passoValido = daTrilha.includes(passo as PassoDoOnboarding)
    ? (passo as PassoDoOnboarding)
    : daTrilha[0]!;

  return {
    concluido: Boolean(bruto.concluido),
    passoAtual: passoValido,
    pulados: Array.isArray(bruto.pulados) ? (bruto.pulados as PassoDoOnboarding[]) : [],
    ...(trilha ? { trilha } : {}),
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
