// Hooks de contas. Concentram a invalidação de cache num lugar só.
//
// Toda escrita invalida também `contas.comSaldo`: saldo é calculado pela view
// (§13.2), então mudar saldo inicial ou arquivar uma conta muda o consolidado.

import { useMutation, useQuery } from '@tanstack/react-query';
import { chaves } from './chaves';
import { usarInvalidarTransacoes } from './usarInvalidacao';
import {
  arquivarConta,
  atualizarConta,
  criarConta,
  desarquivarConta,
  excluirContaSemHistorico,
  listarContas,
  listarContasComSaldo,
  type NovaConta,
} from './contas';

export function usarContas(incluirArquivadas = false) {
  return useQuery({
    queryKey: chaves.contas.lista(incluirArquivadas),
    queryFn: () => listarContas(incluirArquivadas),
  });
}

export function usarContasComSaldo() {
  return useQuery({
    queryKey: chaves.contas.comSaldo,
    queryFn: listarContasComSaldo,
  });
}

// Criar ou arquivar conta muda o consolidado e o saldo de abertura da linha
// diária, porque o saldo inicial dela entra na conta. Por isso a invalidação é
// a mesma de transação, e não só a lista de contas.
const usarInvalidacao = usarInvalidarTransacoes;

export function usarCriarConta() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (nova: NovaConta) => criarConta(nova),
    onSuccess: invalidar,
  });
}

export function usarAtualizarConta() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: ({ id, campos }: { id: string; campos: Parameters<typeof atualizarConta>[1] }) =>
      atualizarConta(id, campos),
    onSuccess: invalidar,
  });
}

export function usarArquivarConta() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (id: string) => arquivarConta(id),
    onSuccess: invalidar,
  });
}

export function usarDesarquivarConta() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (id: string) => desarquivarConta(id),
    onSuccess: invalidar,
  });
}

export function usarExcluirConta() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (id: string) => excluirContaSemHistorico(id),
    onSuccess: invalidar,
  });
}
