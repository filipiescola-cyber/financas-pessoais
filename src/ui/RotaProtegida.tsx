import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAutenticacao } from '../dados/autenticacao';

export function RotaProtegida({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAutenticacao();

  if (carregando) {
    return <div className="p-6 text-slate-400">Carregando…</div>;
  }

  if (!sessao) {
    return <Navigate to="/entrar" replace />;
  }

  return <>{children}</>;
}
