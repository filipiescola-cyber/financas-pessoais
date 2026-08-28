// Fila de sincronização offline (§12, Fase 8).
//
// "Boa parte dos gastos acontece na rua." Sem rede, o lançamento não pode
// falhar nem sumir: ele entra na fila e sobe quando a conexão volta.
//
// Três decisões que sustentam isso:
//
//   OS IDS SÃO GERADOS AQUI, no cliente, antes de qualquer envio. É o que torna
//   o reenvio idempotente: se a inserção chegou ao banco mas a resposta se
//   perdeu, a tentativa seguinte reinsere a MESMA linha e o banco ignora, em vez
//   de criar uma duplicata que ninguém pediu.
//
//   `fatura_id` fica nulo no que sai da fila. Descobrir a fatura exige consultar
//   o banco, o que offline não dá — e o backfill que roda na abertura do app já
//   resolve isso de forma determinística (§13.3).
//
//   A fila mora no `localStorage`, não em IndexedDB. É síncrona, o que importa
//   quando a gravação acontece com o app fechando, e o volume é irrisório: um
//   lançamento ocupa poucas centenas de bytes.

import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];

const CHAVE = 'fila-de-sincronizacao';

export type ItemDaFila = {
  id: string;
  criadoEm: string;
  descricao: string;
  linhas: InsercaoTransacao[];
};

function ler(): ItemDaFila[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as ItemDaFila[]) : [];
  } catch {
    // Armazenamento bloqueado ou conteúdo corrompido: a fila volta vazia em vez
    // de derrubar o app. Perder a fila é ruim; travar o lançamento é pior.
    return [];
  }
}

function gravar(itens: ItemDaFila[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    // Sem espaço ou sem permissão. Nada a fazer além de não quebrar.
  }
}

export function estaOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function enfileirar(descricao: string, linhas: InsercaoTransacao[]): ItemDaFila {
  const item: ItemDaFila = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    descricao,
    linhas,
  };

  gravar([...ler(), item]);
  return item;
}

export function listarPendentes(): ItemDaFila[] {
  return ler();
}

export function quantidadePendente(): number {
  return ler().length;
}

export function removerDaFila(id: string): void {
  gravar(ler().filter((item) => item.id !== id));
}

export type ResultadoDaSincronizacao = {
  enviados: number;
  restantes: number;
  erro: string | null;
};

/**
 * Sobe a fila, na ordem em que foi criada.
 *
 * Para na primeira falha de propósito: se o servidor está fora, insistir nos
 * outros só multiplica erro. O que já subiu sai da fila; o resto espera.
 */
export async function sincronizar(): Promise<ResultadoDaSincronizacao> {
  const pendentes = ler();
  if (pendentes.length === 0) return { enviados: 0, restantes: 0, erro: null };
  if (!estaOnline()) return { enviados: 0, restantes: pendentes.length, erro: 'sem conexão' };

  let enviados = 0;

  for (const item of pendentes) {
    // upsert por id: reenviar o que já entrou não duplica nada.
    const { error } = await supabase
      .from('transacoes')
      .upsert(item.linhas, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      return { enviados, restantes: ler().length, erro: error.message };
    }

    removerDaFila(item.id);
    enviados += 1;
  }

  return { enviados, restantes: 0, erro: null };
}

/**
 * Remove da fila os itens cujas linhas foram desfeitas.
 *
 * Sem isso o "desfazer" de um lançamento offline não faria nada: os ids não
 * existem no banco ainda, então a exclusão não tem o que excluir — e o item
 * subiria depois, ressuscitando o que o usuário mandou apagar.
 */
export function removerLinhasDaFila(ids: readonly string[]): number {
  const alvo = new Set(ids);
  const antes = ler();
  const depois = antes.filter((item) => !item.linhas.some((linha) => alvo.has(linha.id ?? '')));
  gravar(depois);
  return antes.length - depois.length;
}
