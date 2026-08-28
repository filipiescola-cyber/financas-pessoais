import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { criarModelo, excluirModelo, listarModelos, sugerirDescricoes } from './modelos';
import { listarRecorrencias } from './recorrencias';

export function usarModelos() {
  return useQuery({ queryKey: ['modelos'], queryFn: listarModelos });
}

export function usarCriarModelo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: criarModelo,
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['modelos'] }),
  });
}

export function usarExcluirModelo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: excluirModelo,
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['modelos'] }),
  });
}

/**
 * Sugestões de descrição enquanto o usuário digita (§5.2).
 *
 * Só consulta a partir de dois caracteres, e o resultado fica em cache: o campo
 * de descrição é digitado letra a letra, e uma consulta por tecla transformaria
 * o autocomplete num peso em vez de um atalho.
 */
export function usarSugestoesDeDescricao(termo: string) {
  return useQuery({
    queryKey: ['sugestoes-descricao', termo.trim().toLowerCase()],
    queryFn: () => sugerirDescricoes(termo),
    enabled: termo.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function usarRecorrencias() {
  return useQuery({ queryKey: ['recorrencias'], queryFn: listarRecorrencias });
}
