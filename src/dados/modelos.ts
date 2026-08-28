// Modelos de lançamento (§5.2).
//
// "Almoço", "Uber", "Gasolina": um toque preenche categoria, conta e tipo, e só
// falta o valor. Junto com o autocomplete e as recorrências, é o que elimina a
// maior parte da digitação e sobra só o gasto avulso do dia.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { supabase } from './supabase';

export type Modelo = {
  id: string;
  nome: string;
  /** null = pergunta o valor. É o caso mais comum. */
  valorPadrao: Centavos | null;
  categoriaId: string | null;
  contaId: string | null;
  tipo: 'receita' | 'despesa';
  ordem: number;
};

export async function listarModelos(): Promise<Modelo[]> {
  const { data, error } = await supabase.from('modelos').select('*').order('ordem');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    valorPadrao: linha.valor_padrao === null ? null : paraCentavos(linha.valor_padrao),
    categoriaId: linha.categoria_id,
    contaId: linha.conta_id,
    tipo: linha.tipo as 'receita' | 'despesa',
    ordem: linha.ordem,
  }));
}

export async function criarModelo(novo: {
  nome: string;
  valorPadrao: Centavos | null;
  categoriaId: string | null;
  contaId: string | null;
  tipo: 'receita' | 'despesa';
}): Promise<void> {
  const { count } = await supabase.from('modelos').select('id', { count: 'exact', head: true });

  const { error } = await supabase.from('modelos').insert({
    nome: novo.nome.trim(),
    valor_padrao: novo.valorPadrao === null ? null : paraNumerico(novo.valorPadrao),
    categoria_id: novo.categoriaId,
    conta_id: novo.contaId,
    tipo: novo.tipo,
    ordem: count ?? 0,
  });

  if (error) throw new Error(error.message);
}

export async function excluirModelo(id: string): Promise<void> {
  const { error } = await supabase.from('modelos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type SugestaoDeDescricao = {
  descricao: string;
  categoriaId: string | null;
  contaId: string | null;
  vezesUsada: number;
};

/**
 * Toda a memória de uma vez, para casar em lote.
 *
 * A importação precisa sugerir categoria para dezenas de descrições de um
 * arquivo; uma consulta por linha transformaria o preview numa espera longa.
 */
export async function memoriaCompleta(): Promise<SugestaoDeDescricao[]> {
  const { data, error } = await supabase
    .from('memoria_descricao')
    .select('descricao, categoria_id, conta_id, vezes_usada')
    .order('vezes_usada', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    descricao: linha.descricao,
    categoriaId: linha.categoria_id,
    contaId: linha.conta_id,
    vezesUsada: linha.vezes_usada,
  }));
}

/**
 * Autocomplete que aprende (§5.2). A escrita em `memoria_descricao` começou na
 * Fase 1; aqui entra a leitura.
 *
 * Ordena por frequência e depois por uso recente: o que você lança toda semana
 * aparece antes do que lançou uma vez em março.
 */
export async function sugerirDescricoes(
  termo: string,
  limite = 5,
): Promise<SugestaoDeDescricao[]> {
  const texto = termo.trim();
  if (texto.length < 2) return [];

  const { data, error } = await supabase
    .from('memoria_descricao')
    .select('descricao, categoria_id, conta_id, vezes_usada')
    .ilike('descricao', `${texto}%`)
    .order('vezes_usada', { ascending: false })
    .order('ultimo_uso', { ascending: false })
    .limit(limite);

  if (error) throw error;

  return (data ?? []).map((linha) => ({
    descricao: linha.descricao,
    categoriaId: linha.categoria_id,
    contaId: linha.conta_id,
    vezesUsada: linha.vezes_usada,
  }));
}
