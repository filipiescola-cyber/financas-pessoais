import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chaves } from './chaves';
import {
  arquivarCartao,
  atualizarCartao,
  criarCartao,
  desarquivarCartao,
  listarCartoes,
  type NovoCartao,
} from './cartoes';

export function usarCartoes(incluirArquivados = false) {
  return useQuery({
    queryKey: [...chaves.cartoes.lista, incluirArquivados],
    queryFn: () => listarCartoes(incluirArquivados),
  });
}

function usarInvalidacao() {
  const cliente = useQueryClient();
  // Cartão vive em `contas` também: mexer nele muda a listagem de contas.
  return async () => {
    await cliente.invalidateQueries({ queryKey: chaves.cartoes.todos });
    await cliente.invalidateQueries({ queryKey: chaves.contas.todas });
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

export function usarArquivarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({ mutationFn: (contaId: string) => arquivarCartao(contaId), onSuccess: invalidar });
}

export function usarDesarquivarCartao() {
  const invalidar = usarInvalidacao();
  return useMutation({
    mutationFn: (contaId: string) => desarquivarCartao(contaId),
    onSuccess: invalidar,
  });
}
