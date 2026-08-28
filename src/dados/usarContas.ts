// Hooks de contas. Concentram a invalidação de cache num lugar só.
//
// Toda escrita invalida também `contas.comSaldo`: saldo é calculado pela view
// (§13.2), então mudar saldo inicial ou arquivar uma conta muda o consolidado.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chaves } from './chaves';
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

function usarInvalidacao() {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: chaves.contas.todas });
}

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
