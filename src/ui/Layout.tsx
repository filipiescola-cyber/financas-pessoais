import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';
import { LancamentoRapido } from '../telas/LancamentoRapido';

const ABAS = [
  { para: '/', rotulo: 'Início' },
  { para: '/transacoes', rotulo: 'Lançamentos' },
  { para: '/contas', rotulo: 'Contas' },
  { para: '/mais', rotulo: 'Mais' },
];

/**
 * Casca do app. A barra e o FAB ficam embaixo porque é onde o polegar alcança.
 *
 * O botão de lançar é fixo e visível em TODAS as telas (§5.1) — é o módulo mais
 * usado do app, e caçá-lo dentro de um menu já seria atrito demais.
 */
export function Layout() {
  const { sair } = useAutenticacao();
  const [lancando, setLancando] = useState(false);

  return (
    <div className="min-h-screen">
      <main className="pb-24">
        <Outlet />
      </main>

      <button
        onClick={() => setLancando(true)}
        aria-label="Lançar"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl leading-none text-white shadow-lg active:scale-95"
      >
        +
      </button>

      <LancamentoRapido aberto={lancando} aoFechar={() => setLancando(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-1">
            {ABAS.map((aba) => (
              <NavLink
                key={aba.para}
                to={aba.para}
                end={aba.para === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${
                    isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {aba.rotulo}
              </NavLink>
            ))}
          </div>
          <button onClick={() => void sair()} className="text-xs text-slate-500 hover:text-slate-300">
            Sair
          </button>
        </div>
      </nav>
    </div>
  );
}
