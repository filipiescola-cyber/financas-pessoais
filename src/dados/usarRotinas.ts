import { useEffect, useRef } from 'react';
import { rodarRotinasDeAbertura } from './rotinas';
import { usarInvalidarTransacoes } from './usarInvalidacao';
import { usarAviso } from '../ui/Aviso';

/**
 * Dispara as rotinas de abertura uma vez por sessão (§13.3).
 *
 * Falha em silêncio de propósito: se a rotina quebrar, o app continua utilizável
 * e o usuário ainda consegue lançar. Nada aqui pode virar caminho crítico.
 */
export function usarRotinasDeAbertura() {
  const invalidar = usarInvalidarTransacoes();
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
          resultado.recorrenciasGeradas > 0 ||
          // Faltava: parcela de dívida gerada sozinha (§4.7) mexia no saldo e
          // no contador de pagas sem nada na tela mudar até recarregar a
          // página — e como ninguém recarrega um PWA, o débito parecia não ter
          // acontecido justamente no dia em que aconteceu.
          resultado.parcelasGeradas > 0
        ) {
          await invalidar();
        }

        if (resultado.recorrenciasGeradas > 0) {
          mostrar(`${resultado.recorrenciasGeradas} lançamento(s) recorrente(s) gerado(s).`);
        } else if (resultado.parcelasGeradas > 0) {
          mostrar(`${resultado.parcelasGeradas} parcela(s) de dívida lançada(s).`);
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
  }, [invalidar, mostrar]);
}
