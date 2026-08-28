import { NavLink, Outlet } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';

const ABAS = [
  { para: '/', rotulo: 'Início' },
  { para: '/contas', rotulo: 'Contas' },
];

/**
 * Casca do app. A barra fica embaixo porque é onde o polegar alcança no celular,
 * e é onde o FAB de lançamento rápido (§5.1) vai morar a partir da 1.7.
 */
export function Layout() {
  const { sair } = useAutenticacao();

  return (
    <div className="min-h-screen">
      <main className="pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
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
