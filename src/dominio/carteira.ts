// Organizar a carteira de investimentos (§7).
//
// Uma lista plana de aplicações responde "o que eu tenho" e nenhuma das
// perguntas seguintes: quanto está no Nubank, quanto está em CDB, o que vence
// primeiro. Com cinco RDBs de nomes parecidos, ela deixa de responder até a
// primeira.
//
// Agrupar produz SUBTOTAIS, e subtotal é número — por isso mora aqui, e não na
// tela: erro em soma de dinheiro é silencioso, e o único jeito de saber que
// está certo é testar (§13.4).

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

export type Agrupamento = 'nenhum' | 'instituicao' | 'tipo';
export type Ordenacao = 'valor' | 'vencimento' | 'nome';

export type ItemDaCarteira = {
  nome: string;
  instituicao: string | null;
  tipo: string;
  vencimento: DataISO | null;
  saldo: Centavos;
};

export type GrupoDaCarteira<T> = {
  titulo: string;
  itens: T[];
  /** Soma dos saldos do grupo. É a resposta de "quanto tenho aqui". */
  total: Centavos;
};

const SEM_INSTITUICAO = 'Sem instituição';

function ordenar<T extends ItemDaCarteira>(itens: readonly T[], por: Ordenacao): T[] {
  const lista = [...itens];

  if (por === 'valor') return lista.sort((a, b) => b.saldo - a.saldo);
  if (por === 'nome') return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Vencimento: o mais próximo primeiro, e quem não vence vai para o fim.
  // Liquidez diária não tem data, e empurrá-la para cima esconderia justamente
  // o que precisa de decisão.
  return lista.sort((a, b) => {
    if (a.vencimento === null && b.vencimento === null) {
      return a.nome.localeCompare(b.nome, 'pt-BR');
    }
    if (a.vencimento === null) return 1;
    if (b.vencimento === null) return -1;
    return a.vencimento.localeCompare(b.vencimento);
  });
}

/**
 * Agrupa e ordena a carteira.
 *
 * Os grupos vêm do maior total para o menor: a pergunta que o agrupamento
 * responde é onde está o dinheiro, e ela se responde de cima para baixo.
 *
 * `rotuloDoTipo` vem de fora porque o nome bonito de cada tipo é da camada de
 * dados (§7), e este módulo não deve conhecê-lo para continuar testável sem
 * arrastar o resto junto.
 */
export function organizarCarteira<T extends ItemDaCarteira>(
  itens: readonly T[],
  agrupamento: Agrupamento,
  ordenacao: Ordenacao,
  rotuloDoTipo: (tipo: string) => string = (t) => t,
): GrupoDaCarteira<T>[] {
  const ordenados = ordenar(itens, ordenacao);

  if (agrupamento === 'nenhum') {
    if (ordenados.length === 0) return [];
    return [{ titulo: '', itens: ordenados, total: somar(ordenados) }];
  }

  const chave = (item: T) =>
    agrupamento === 'tipo' ? rotuloDoTipo(item.tipo) : (item.instituicao?.trim() || SEM_INSTITUICAO);

  const grupos = new Map<string, T[]>();
  for (const item of ordenados) {
    const titulo = chave(item);
    grupos.set(titulo, [...(grupos.get(titulo) ?? []), item]);
  }

  return [...grupos.entries()]
    .map(([titulo, lista]) => ({ titulo, itens: lista, total: somar(lista) }))
    .sort((a, b) => b.total - a.total || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

function somar(itens: readonly ItemDaCarteira[]): Centavos {
  return itens.reduce((total, item) => total + item.saldo, 0);
}
