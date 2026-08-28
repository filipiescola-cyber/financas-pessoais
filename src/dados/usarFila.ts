import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chaves } from './chaves';
import { estaOnline, quantidadePendente, sincronizar } from './fila';

/**
 * Estado da conexão e da fila (Fase 8).
 *
 * A sincronização dispara em dois momentos: quando a conexão volta e quando o
 * app é aberto. `navigator.onLine` mente com alguma frequência — diz online em
 * wi-fi de hotel sem saída — então a fila também é tentada na abertura, e uma
 * falha só devolve os itens para a fila em vez de perdê-los.
 */
export function usarFila() {
  const cliente = useQueryClient();
  const [online, setOnline] = useState(estaOnline());
  const [pendentes, setPendentes] = useState(quantidadePendente());
  const [sincronizando, setSincronizando] = useState(false);

  const enviar = useCallback(async () => {
    if (quantidadePendente() === 0 || !estaOnline()) {
      setPendentes(quantidadePendente());
      return;
    }

    setSincronizando(true);
    try {
      const resultado = await sincronizar();
      if (resultado.enviados > 0) {
        await cliente.invalidateQueries({ queryKey: ['transacoes'] });
        await cliente.invalidateQueries({ queryKey: chaves.contas.todas });
      }
    } catch {
      // Falha de rede: os itens continuam na fila para a próxima tentativa.
    } finally {
      setPendentes(quantidadePendente());
      setSincronizando(false);
    }
  }, [cliente]);

  useEffect(() => {
    function aoVoltar() {
      setOnline(true);
      void enviar();
    }
    function aoCair() {
      setOnline(false);
    }

    window.addEventListener('online', aoVoltar);
    window.addEventListener('offline', aoCair);
    void enviar();

    return () => {
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('offline', aoCair);
    };
  }, [enviar]);

  return {
    online,
    pendentes,
    sincronizando,
    sincronizarAgora: enviar,
    atualizarContagem: () => setPendentes(quantidadePendente()),
  };
}
