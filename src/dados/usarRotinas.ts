import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rodarRotinasDeAbertura } from './rotinas';
import { usarAviso } from '../ui/Aviso';

/**
 * Dispara as rotinas de abertura uma vez por sessão (§13.3).
 *
 * Falha em silêncio de propósito: se a rotina quebrar, o app continua utilizável
 * e o usuário ainda consegue lançar. Nada aqui pode virar caminho crítico.
 */
export function usarRotinasDeAbertura() {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const jaRodou = useRef(false);

  useEffect(() => {
    if (jaRodou.current) return;
    jaRodou.current = true;

    void (async () => {
      try {
        const resultado = await rodarRotinasDeAbertura();
        if (!resultado) return;

        if (
          resultado.faturasFechadas > 0 ||
          resultado.transacoesVinculadas > 0 ||
          resultado.recorrenciasGeradas > 0
        ) {
          await cliente.invalidateQueries({ queryKey: ['transacoes'] });
          await cliente.invalidateQueries({ queryKey: ['faturas'] });
          await cliente.invalidateQueries({ queryKey: ['contas'] });
        }

        if (resultado.recorrenciasGeradas > 0) {
          mostrar(`${resultado.recorrenciasGeradas} lançamento(s) recorrente(s) gerado(s).`);
        } else if (resultado.transacoesVinculadas > 0) {
          mostrar(
            `${resultado.transacoesVinculadas} lançamento(s) de cartão agrupado(s) em fatura.`,
          );
        } else if (resultado.faturasFechadas > 0) {
          mostrar(`${resultado.faturasFechadas} fatura(s) fechada(s).`);
        }
      } catch {
        // Silêncio proposital: rotina de manutenção não derruba o app.
      }
    })();
  }, [cliente, mostrar]);
}
