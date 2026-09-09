import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Acao = { rotulo: string; executar: () => void };
type Tipo = 'informacao' | 'erro';
type AvisoAtual = { texto: string; acao?: Acao; tipo: Tipo } | null;

type ContextoAviso = {
  mostrar: (texto: string, acao?: Acao) => void;
  /** Falha. Fica na tela até um toque — ver `avisarErro`. */
  mostrarErro: (texto: string) => void;
};

const Contexto = createContext<ContextoAviso | null>(null);

const DURACAO = 7000;

/**
 * A porta para quem não está dentro do React.
 *
 * O tratamento global de erro vive no `QueryClient`, criado antes de qualquer
 * componente montar — ele não alcança o contexto. Guardar a função num
 * módulo é a ponte mais simples, e ela some junto com o provedor.
 */
let canal = null as ((texto: string, tipo: Tipo) => void) | null;

/**
 * Mostra uma falha para o usuário.
 *
 * Existe porque o app tinha setenta e cinco mutations e UM `onError`. Quando
 * uma gravação falhava — sem rede, RLS recusando, restrição do banco — o
 * botão parava de girar e nada acontecia. Pior: a camada de dados escreve
 * mensagens boas ("Já existe uma conta Empresa", "Esta conta já tem
 * lançamentos, arquive em vez de excluir") e nenhuma delas chegava à tela.
 *
 * Num app de finanças, silêncio depois de salvar é o pior desfecho possível:
 * quem não vê nem confirmação nem erro tenta de novo — e aí ou duplica o
 * lançamento, ou desiste achando que o app quebrou.
 */
export function avisarErro(texto: string): void {
  canal?.(texto, 'erro');
}

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
      setAviso({ texto, acao, tipo: 'informacao' });
      temporizador.current = window.setTimeout(() => setAviso(null), DURACAO);
    },
    [limpar],
  );

  /*
    Erro NÃO desaparece sozinho.

    Um aviso de sucesso pode sumir: o resultado dele está na lista logo abaixo,
    e quem perdeu o aviso vê o lançamento. Um erro não deixa nada para conferir
    depois — se passar despercebido, a pessoa fica achando que gravou.
  */
  const mostrarErro = useCallback(
    (texto: string) => {
      limpar();
      setAviso({ texto, tipo: 'erro' });
    },
    [limpar],
  );

  useEffect(() => {
    canal = (texto, tipo) => (tipo === 'erro' ? mostrarErro(texto) : mostrar(texto));
    return () => {
      canal = null;
      limpar();
    };
  }, [limpar, mostrar, mostrarErro]);

  return (
    <Contexto.Provider value={{ mostrar, mostrarErro }}>
      {children}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div
            className={`pointer-events-auto flex max-w-lg items-start gap-4 rounded-lg border px-4 py-3 shadow-xl ${
              aviso.tipo === 'erro'
                ? 'border-red-900/70 bg-red-950/60'
                : 'border-borda-forte bg-superficie-alta'
            }`}
          >
            <span className={aviso.tipo === 'erro' ? 'text-sm text-red-200' : 'text-sm text-slate-200'}>
              {aviso.texto}
            </span>
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
            {aviso.tipo === 'erro' && (
              <button
                onClick={() => setAviso(null)}
                aria-label="Fechar aviso"
                className="shrink-0 text-sm font-medium text-red-300"
              >
                Fechar
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
