import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DERIVADO_DE_TRANSACAO } from './chaves';

/**
 * Invalida tudo que depende de transação (§13.2).
 *
 * Um lugar só, usado por toda tela que grava: era a lista montada à mão em cada
 * uma que deixava o saldo diário, a projeção e os alertas parados até um
 * recarregamento.
 */
export function usarInvalidarTransacoes() {
  const cliente = useQueryClient();

  return useCallback(async () => {
    await Promise.all(
      DERIVADO_DE_TRANSACAO.map((chave) => cliente.invalidateQueries({ queryKey: chave })),
    );
  }, [cliente]);
}
