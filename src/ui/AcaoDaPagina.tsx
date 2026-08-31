// O que o botão "+" faz na tela em que você está (§5.1).
//
// Ele nasceu global: lançar, sempre, de qualquer lugar — porque lançar é o
// hábito de que o app inteiro depende, e um toque a mais é onde o hábito morre.
// Continua sendo isso na maioria das telas.
//
// Mas em Contas, Cartões, Investimentos, Categorias e Metas o "+" grande
// prometia uma coisa e fazia outra: você está olhando a carteira, toca no mais
// e abre uma folha de lançamento. Nessas telas o substantivo da página É o que
// se quer adicionar.
//
// A troca é consciente: quem está nessas telas está sentado, decidindo — não
// dentro de uma loja com o cartão na mão. As telas onde se lança de verdade
// (Início, Lançamentos, Fluxo, Relatórios) mantêm o botão como era.
//
// A ação é DECLARADA pela página, não decidida por uma lista de rotas aqui: uma
// lista central envelheceria calada na primeira tela nova.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type AcaoDaPagina = { rotulo: string; aoAtivar: () => void };

type Valor = {
  acao: AcaoDaPagina | null;
  definir: (acao: AcaoDaPagina | null) => void;
};

const Contexto = createContext<Valor | null>(null);

export function ProvedorDeAcao({ children }: { children: ReactNode }) {
  const [acao, setAcao] = useState<AcaoDaPagina | null>(null);
  const valor = useMemo(() => ({ acao, definir: setAcao }), [acao]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** O que o Layout desenha no botão. */
export function usarAcaoAtual(): AcaoDaPagina | null {
  return useContext(Contexto)?.acao ?? null;
}

/**
 * Declara a ação principal da tela enquanto ela estiver montada.
 *
 * O efeito depende só do RÓTULO, nunca da função: a função é recriada a cada
 * render da página, e depender dela registraria de novo a cada tecla digitada
 * num formulário. A chamada mais recente fica guardada numa ref.
 */
export function usarAcaoDaPagina(rotulo: string, aoAtivar: () => void) {
  const contexto = useContext(Contexto);
  const definir = contexto?.definir;

  const maisRecente = useRef(aoAtivar);
  maisRecente.current = aoAtivar;

  const estavel = useCallback(() => maisRecente.current(), []);

  useEffect(() => {
    if (!definir) return;
    definir({ rotulo, aoAtivar: estavel });
    return () => definir(null);
  }, [rotulo, definir, estavel]);
}
