import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Aviso de versão nova.
 *
 * O service worker guarda os arquivos do app para ele abrir sem rede (Fase 8).
 * O efeito colateral é que, depois de um deploy, o navegador continua servindo
 * o código antigo até um segundo carregamento — e uma correção recém-publicada
 * parece não ter saído.
 *
 * Num app de finanças isso é pior do que chato: código velho pode calcular com
 * regra velha. Então a troca deixa de ser silenciosa e vira um clique.
 */
export function AtualizacaoDisponivel() {
  const [disponivel, setDisponivel] = useState(false);
  const [atualizar, setAtualizar] = useState<(() => void) | null>(null);

  useEffect(() => {
    const atualizarSW = registerSW({
      onNeedRefresh() {
        setDisponivel(true);
        setAtualizar(() => () => void atualizarSW(true));
      },
    });
  }, []);

  if (!disponivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 md:bottom-8">
      <div className="flex items-center gap-4 rounded-lg border border-emerald-800/60 bg-emerald-950/90 px-4 py-3 shadow-xl backdrop-blur">
        <span className="text-sm text-emerald-100">Nova versão disponível.</span>
        <button
          onClick={() => atualizar?.()}
          className="shrink-0 text-sm font-medium text-emerald-300 underline"
        >
          atualizar
        </button>
      </div>
    </div>
  );
}
