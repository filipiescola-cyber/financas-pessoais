import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chaves } from './chaves';
import { usarInvalidarTransacoes } from './usarInvalidacao';
import {
  atualizarCartao,
  criarCartao,
  desarquivarCartao,
  excluirCartaoSemHistorico,
  listarCartoes,
  type NovoCartao,
} from './cartoes';
import { encerrarConta } from './contas';
import type { DataISO } from '../dominio/datas';

export function usarCartoes(incluirArquivados = false) {
  return useQuery({
    queryKey: [...chaves.cartoes.lista, incluirArquivados],
    queryFn: () => listarCartoes(incluirArquivados),
  });
}

function usarInvalidacao() {
  const cliente = useQueryClient();
  const invalidarTransacoes = usarInvalidarTransacoes();
  // Cartão vive em `contas` também, e mexer nele muda fatura e saldo.
  return async () => {
    await cliente.invalidateQueries({ queryKey: chaves.cartoes.todos });
    await invalidarTransacoes();
  };
}

export function usarCriarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({ mutationFn: (novo: NovoCartao) => criarCartao(novo), onSuccess: invalidar });
}

export function usarAtualizarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: ({ contaId, campos }: { contaId: string; campos: Partial<NovoCartao> }) =>
      atualizarCartao(contaId, campos),
    onSuccess: invalidar,
  });
}

/** Cartão é conta (§4.2), então encerrar é o mesmo caminho — com data (§4.8). */
export function usarEncerrarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: ({ contaId, data }: { contaId: string; data: DataISO }) =>
      encerrarConta(contaId, data),
    onSuccess: invalidar,
  });
}

export function usarExcluirCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (contaId: string) => excluirCartaoSemHistorico(contaId),
    onSuccess: invalidar,
  });
}

export function usarDesarquivarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (contaId: string) => desarquivarCartao(contaId),
    onSuccess: invalidar,
  });
}
