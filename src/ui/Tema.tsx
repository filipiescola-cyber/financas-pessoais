import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'escuro' | 'claro' | 'sistema';

type ContextoTema = { tema: Tema; definir: (tema: Tema) => void };

const Contexto = createContext<ContextoTema | null>(null);

const CHAVE = 'tema';

/** O que o `sistema` resolve agora. Sem `matchMedia`, assume escuro. */
function preferidoDoSistema(): 'claro' | 'escuro' {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

function aplicar(tema: Tema) {
  const efetivo = tema === 'sistema' ? preferidoDoSistema() : tema;
  document.documentElement.dataset.tema = efetivo;

  // A barra do navegador no celular acompanha: sem isto ela fica escura por
  // cima de uma tela clara, e a emenda aparece.
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', efetivo === 'claro' ? '#f4f6fb' : '#0b1120');
}

/**
 * Tema claro e escuro.
 *
 * O padrão é ESCURO, não "sistema": o app nasceu escuro e mudar sozinho a cara
 * dele na primeira visita depois desta versão seria uma surpresa, não uma
 * melhoria. Quem quiser acompanhar o sistema escolhe.
 *
 * A preferência fica no navegador, e não no banco, pela mesma razão do modo
 * privado: é escolha do aparelho. Faz sentido claro no computador do trabalho
 * e escuro no celular à noite.
 */
export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>('escuro');

  useEffect(() => {
    let inicial: Tema = 'escuro';
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === 'claro' || salvo === 'escuro' || salvo === 'sistema') inicial = salvo;
    } catch {
      // Armazenamento bloqueado: segue no escuro, que é o padrão.
    }
    setTema(inicial);
    aplicar(inicial);
  }, []);

  // Em "sistema", o app acompanha a troca sem precisar recarregar.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const consulta = window.matchMedia('(prefers-color-scheme: light)');
    const aoMudar = () => aplicar('sistema');
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, [tema]);

  const definir = useCallback((proximo: Tema) => {
    setTema(proximo);
    aplicar(proximo);
    try {
      localStorage.setItem(CHAVE, proximo);
    } catch {
      // Preferência não persiste, mas vale nesta sessão.
    }
  }, []);

  return <Contexto.Provider value={{ tema, definir }}>{children}</Contexto.Provider>;
}

export function usarTema() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('usarTema precisa estar dentro de ProvedorTema.');
  return contexto;
}

export const TEMAS: { valor: Tema; rotulo: string }[] = [
  { valor: 'escuro', rotulo: 'Escuro' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'sistema', rotulo: 'Sistema' },
];
