import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Acao = { rotulo: string; executar: () => void };
type AvisoAtual = { texto: string; acao?: Acao } | null;

type ContextoAviso = {
  mostrar: (texto: string, acao?: Acao) => void;
};

const Contexto = createContext<ContextoAviso | null>(null);

const DURACAO = 7000;

/**
 * Avisos com ação, no rodapé. Existe por causa do §5.4: lançamento simples salva
 * DIRETO, sem diálogo de "deseja salvar?" — e o desfazer é o que torna isso
 * seguro. Perguntar antes custa um toque em cada lançamento; oferecer desfazer
 * custa zero nos que estavam certos.
 *
 * A janela é de 7 segundos, mais longa que a de um toast comum, porque quem
 * lançou errado costuma perceber ao ver o valor aparecer na lista.
 */
export function ProvedorAviso({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<AvisoAtual>(null);
  const temporizador = useRef<number | null>(null);

  const limpar = useCallback(() => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const mostrar = useCallback(
    (texto: string, acao?: Acao) => {
      limpar();
      setAviso({ texto, acao });
      temporizador.current = window.setTimeout(() => setAviso(null), DURACAO);
    },
    [limpar],
  );

  useEffect(() => limpar, [limpar]);

  return (
    <Contexto.Provider value={{ mostrar }}>
      {children}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-lg items-center gap-4 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 shadow-xl">
            <span className="text-sm text-slate-200">{aviso.texto}</span>
            {aviso.acao && (
              <button
                onClick={() => {
                  aviso.acao?.executar();
                  limpar();
                  setAviso(null);
                }}
                className="shrink-0 text-sm font-medium text-emerald-400"
              >
                {aviso.acao.rotulo}
              </button>
            )}
          </div>
        </div>
      )}
    </Contexto.Provider>
  );
}

export function usarAviso() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('usarAviso precisa estar dentro de ProvedorAviso.');
  return contexto;
}
