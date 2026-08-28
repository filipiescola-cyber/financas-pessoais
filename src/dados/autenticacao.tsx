import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type ContextoAutenticacao = {
  sessao: Session | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<ContextoAutenticacao | null>(null);

export function ProvedorAutenticacao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  // Começa carregando: sem isso a rota protegida chuta o usuário para o login
  // no primeiro render, antes de a sessão persistida ser lida.
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
    });

    return () => inscricao.subscription.unsubscribe();
  }, []);

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  return (
    <Contexto.Provider value={{ sessao, carregando, entrar, sair }}>{children}</Contexto.Provider>
  );
}

export function useAutenticacao() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useAutenticacao precisa estar dentro de ProvedorAutenticacao.');
  return contexto;
}
