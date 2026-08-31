// Acesso a categorias (§4.3).
// O conjunto padrão já veio no seed da Fase 0; aqui é só leitura e edição.

import { supabase } from './supabase';
import type { Categoria, LinhaCategoria, TipoDeCategoria } from './tipos';
import type { Natureza } from '../dominio/natureza';
import type { Database } from './tipos-gerados';

type AtualizacaoCategoria = Database['public']['Tables']['categorias']['Update'];

function daLinha(linha: LinhaCategoria): Categoria {
  return {
    id: linha.id,
    nome: linha.nome,
    tipo: linha.tipo as TipoDeCategoria,
    categoriaPaiId: linha.categoria_pai_id,
    cor: linha.cor,
    icone: linha.icone,
    natureza: linha.natureza as Natureza | null,
    sistema: linha.sistema,
    ativo: linha.ativo,
  };
}

export async function listarCategorias(incluirArquivadas = false): Promise<Categoria[]> {
  let consulta = supabase.from('categorias').select('*').order('nome');
  if (!incluirArquivadas) consulta = consulta.eq('ativo', true);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map(daLinha);
}

export async function criarCategoria(nova: {
  nome: string;
  tipo: TipoDeCategoria;
  natureza: Natureza | null;
  cor?: string | null;
  /** Chave do banco de ícones do front, não o desenho (§4.3). */
  icone?: string | null;
}): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categorias')
    .insert({
      nome: nova.nome.trim(),
      tipo: nova.tipo,
      natureza: nova.natureza,
      cor: nova.cor ?? null,
      icone: nova.icone ?? null,
    })
    .select()
    .single();

  if (error) throw traduzirErro(error);
  return daLinha(data);
}

export async function atualizarCategoria(
  id: string,
  campos: {
    nome?: string;
    natureza?: Natureza | null;
    cor?: string | null;
    icone?: string | null;
  },
): Promise<Categoria> {
  const atualizacao: AtualizacaoCategoria = {};
  if (campos.nome !== undefined) atualizacao.nome = campos.nome.trim();
  if (campos.natureza !== undefined) atualizacao.natureza = campos.natureza;
  if (campos.cor !== undefined) atualizacao.cor = campos.cor;
  if (campos.icone !== undefined) atualizacao.icone = campos.icone;

  const { data, error } = await supabase
    .from('categorias')
    .update(atualizacao)
    .eq('id', id)
    .select()
    .single();

  if (error) throw traduzirErro(error);
  return daLinha(data);
}

/** Categoria de sistema não pode ser arquivada — "Ajuste de saldo" (§4.3, §5.3). */
/** O que impede a exclusão de uma categoria, item a item. */
export type PrevisaoDeCategoria = {
  transacoes: number;
  recorrencias: number;
  orcamentos: number;
  modelos: number;
  subcategorias: number;
  podeExcluir: boolean;
};

/**
 * Excluir categoria é para a que NUNCA foi usada (§4.3).
 *
 * Arquivar é para a categoria que você parou de usar: ela some dos seletores e
 * os lançamentos antigos continuam classificados. Não serve para o erro de
 * digitação — "Alimentaçao" criada por engano fica escondida para sempre.
 *
 * A diferença com investimento é o que a exclusão desfaria: lá, os lançamentos
 * do aporte foram INVENTADOS pelo app e apagá-los conserta o saldo. Aqui, os
 * lançamentos são seus e a categoria só os classifica — apagá-la junto perderia
 * a classificação de meses fechados. Por isso a regra é mais dura: com qualquer
 * uso, o caminho é arquivar, e a tela diz onde ela está sendo usada.
 */
export async function previaDaExclusao(id: string): Promise<PrevisaoDeCategoria> {
  const contar = async (tabela: 'transacoes' | 'recorrencias' | 'orcamentos' | 'modelos') => {
    const { count } = await supabase
      .from(tabela)
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', id);
    return count ?? 0;
  };

  const { count: filhas } = await supabase
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_pai_id', id);

  const [transacoes, recorrencias, orcamentos, modelos] = await Promise.all([
    contar('transacoes'),
    contar('recorrencias'),
    contar('orcamentos'),
    contar('modelos'),
  ]);

  const subcategorias = filhas ?? 0;

  return {
    transacoes,
    recorrencias,
    orcamentos,
    modelos,
    subcategorias,
    podeExcluir:
      transacoes === 0 &&
      recorrencias === 0 &&
      orcamentos === 0 &&
      modelos === 0 &&
      subcategorias === 0,
  };
}

export async function excluirCategoria(id: string): Promise<void> {
  const previa = await previaDaExclusao(id);
  if (!previa.podeExcluir) {
    throw new Error(
      'Esta categoria já está em uso. Arquive em vez de excluir — apagar tiraria a classificação de lançamentos que já aconteceram.',
    );
  }

  // A memória de descrição aponta com `on delete set null`: o autocomplete
  // apenas esquece a sugestão, que é o comportamento certo para uma categoria
  // que nunca chegou a classificar nada.
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function arquivarCategoria(id: string): Promise<void> {
  const { data, error: erroLeitura } = await supabase
    .from('categorias')
    .select('sistema, nome')
    .eq('id', id)
    .single();
  if (erroLeitura) throw erroLeitura;

  if (data.sistema) {
    throw new Error(`"${data.nome}" é uma categoria de sistema e não pode ser removida.`);
  }

  const { error } = await supabase.from('categorias').update({ ativo: false }).eq('id', id);
  if (error) throw error;
}

export async function desarquivarCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('categorias').update({ ativo: true }).eq('id', id);
  if (error) throw traduzirErro(error);
}

type ErroPostgrest = { code?: string; message?: string };

function traduzirErro(erro: ErroPostgrest): Error {
  if (erro.code === '23505') {
    return new Error('Já existe uma categoria com esse nome e tipo.');
  }
  return new Error(erro.message ?? 'Erro ao gravar a categoria.');
}
