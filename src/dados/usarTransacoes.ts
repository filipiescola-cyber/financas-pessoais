import { useMutation, useQuery } from '@tanstack/react-query';
import { hoje, somarDias, type DataISO } from '../dominio/datas';
import { chaves } from './chaves';
import { listarCategorias } from './categorias';
import {
  categoriasMaisUsadas,
  criarLancamento,
  criarTransferencia,
  excluirTransacoes,
  listarTransacoes,
  montarLinhasDeTransferenciaOffline,
  montarLinhasOffline,
  registrarDescricao,
  type NovaTransferencia,
  type NovoLancamento,
  type TipoDeLancamento,
} from './transacoes';
import { enfileirar, estaOnline, removerLinhasDaFila } from './fila';
import { usarInvalidarTransacoes } from './usarInvalidacao';

const CHAVE_TRANSACOES = ['transacoes'] as const;

export function usarCategorias(incluirArquivadas = false) {
  return useQuery({
    queryKey: chaves.categorias.lista(incluirArquivadas),
    queryFn: () => listarCategorias(incluirArquivadas),
  });
}

export function usarTransacoes(filtros: {
  de: DataISO;
  ate: DataISO;
  contaId?: string | null;
  categoriaId?: string | null;
  porData?: 'competencia' | 'caixa';
}) {
  return useQuery({
    queryKey: [...CHAVE_TRANSACOES, filtros],
    queryFn: () => listarTransacoes(filtros),
  });
}

/**
 * Chips de categoria da folha de lançamento (§5.1): as 8 mais usadas nos
 * últimos 30 dias, por frequência real. Enquanto não houver histórico, cai
 * para a ordem alfabética — estado vazio explícito, não lista vazia (§13.5).
 */
export function usarCategoriasSugeridas(tipo: TipoDeLancamento, quantidade = 8) {
  const categorias = usarCategorias();
  const desde = somarDias(hoje(), -30);

  const frequencia = useQuery({
    queryKey: ['categorias-mais-usadas', tipo, desde],
    queryFn: () => categoriasMaisUsadas(desde, tipo),
  });

  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const ranking = new Map((frequencia.data ?? []).map((f) => [f.categoriaId, f.vezes]));

  const ordenadas = [...doTipo].sort((a, b) => {
    const diferenca = (ranking.get(b.id) ?? 0) - (ranking.get(a.id) ?? 0);
    return diferenca !== 0 ? diferenca : a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return {
    sugeridas: ordenadas.slice(0, quantidade),
    todas: doTipo,
    carregando: categorias.isPending,
  };
}

// Saldo é calculado (§13.2): toda escrita precisa invalidar tudo que deriva de
// transação. A lista mora em um lugar só — ver `usarInvalidarTransacoes`.
const usarInvalidacao = usarInvalidarTransacoes;

export function usarCriarLancamento() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: async (novo: NovoLancamento) => {
      // Sem rede o lançamento não falha: entra na fila com ids já gerados e
      // sobe quando a conexão voltar (Fase 8).
      if (!estaOnline()) {
        const linhas = montarLinhasOffline(novo);
        enfileirar(novo.descricao?.trim() || 'Lançamento', linhas);
        return linhas.map((linha) => linha.id!).filter(Boolean);
      }

      const ids = await criarLancamento(novo);
      // A memória de autocomplete não pode derrubar o lançamento se falhar.
      void registrarDescricao(novo.descricao, novo.categoriaId, novo.contaId).catch(() => {});
      return ids;
    },
    onSuccess: invalidar,
  });
}

export function usarCriarTransferencia() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: async (nova: NovaTransferencia) => {
      if (!estaOnline()) {
        // As duas pontas já saem ligadas: offline não há um segundo passo para
        // amarrar o par (§2.3).
        const linhas = montarLinhasDeTransferenciaOffline(nova);
        enfileirar('Transferência', linhas);
        return linhas.map((linha) => linha.id!).filter(Boolean);
      }
      return criarTransferencia(nova);
    },
    onSuccess: invalidar,
  });
}

export function usarDesfazer() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      // O que ainda está na fila é desfeito removendo da fila: no banco esses
      // ids não existem, e deixá-los passar faria o item subir depois,
      // ressuscitando o que o usuário mandou apagar.
      const removidos = removerLinhasDaFila(ids);
      if (removidos > 0) return;
      await excluirTransacoes(ids);
    },
    onSuccess: invalidar,
  });
}
