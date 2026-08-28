import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LancamentoRapido } from '../telas/LancamentoRapido';
import { usarPrivacidade } from './Privacidade';
import { usarRotinasDeAbertura } from '../dados/usarRotinas';
import {
  IconeCategorias,
  IconeContas,
  IconeDados,
  IconeFaturas,
  IconeImportar,
  IconeInicio,
  IconeLancamentos,
  IconeMais,
  IconeOlho,
} from './icones';

type Item = { para: string; rotulo: string; icone: (p: { className?: string }) => ReactNode };

/** No celular só cabem quatro; o resto vive atrás de "Mais". */
const PRINCIPAIS: Item[] = [
  { para: '/', rotulo: 'Início', icone: IconeInicio },
  { para: '/transacoes', rotulo: 'Lançamentos', icone: IconeLancamentos },
  { para: '/contas', rotulo: 'Contas', icone: IconeContas },
];

const SECUNDARIOS: Item[] = [
  { para: '/faturas', rotulo: 'Faturas', icone: IconeFaturas },
  { para: '/lote', rotulo: 'Em lote', icone: IconeLancamentos },
  { para: '/atalhos', rotulo: 'Atalhos', icone: IconeCategorias },
  { para: '/importar', rotulo: 'Importar', icone: IconeImportar },
  { para: '/cartoes', rotulo: 'Cartões', icone: IconeContas },
  { para: '/categorias', rotulo: 'Categorias', icone: IconeCategorias },
  { para: '/dados', rotulo: 'Dados', icone: IconeDados },
];

/**
 * Casca do app, responsiva de propósito.
 *
 * No celular: barra embaixo e FAB no canto, porque é onde o polegar alcança e
 * porque boa parte dos gastos acontece na rua.
 * No desktop: barra lateral fixa, que dá espaço para o nome de cada seção e
 * deixa o conteúdo respirar.
 *
 * O botão de lançar é fixo e visível em TODAS as telas (§5.1).
 */
export function Layout() {
  const { privado, alternar } = usarPrivacidade();
  const [lancando, setLancando] = useState(false);

  // Nada roda sozinho neste app: quem dispara é a abertura (§13.3).
  usarRotinasDeAbertura();

  return (
    <div className="min-h-screen md:flex">
      <BarraLateral privado={privado} aoAlternarPrivacidade={alternar} />

      <div className="min-w-0 flex-1">
        <CabecalhoCelular privado={privado} aoAlternarPrivacidade={alternar} />
        <main>
          <Outlet />
        </main>
      </div>

      <button
        onClick={() => setLancando(true)}
        aria-label="Lançar"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl leading-none text-white shadow-xl shadow-emerald-950/50 transition active:scale-95 md:bottom-8 md:right-8 md:h-16 md:w-16"
      >
        +
      </button>

      <LancamentoRapido aberto={lancando} aoFechar={() => setLancando(false)} />

      <BarraInferior />
    </div>
  );
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-base font-semibold text-white">
        F
      </div>
      {!compacta && (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-100">Finanças</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Pessoais</p>
        </div>
      )}
    </div>
  );
}

function BotaoPrivacidade({
  privado,
  aoAlternar,
  comRotulo = false,
}: {
  privado: boolean;
  aoAlternar: () => void;
  comRotulo?: boolean;
}) {
  return (
    <button
      onClick={aoAlternar}
      aria-pressed={privado}
      title="Modo privado: borra os valores da tela"
      className="flex items-center gap-2 rounded-lg border border-borda px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-borda-forte hover:text-slate-200"
    >
      <IconeOlho fechado={privado} className="h-4 w-4" />
      {comRotulo && <span>{privado ? 'Mostrar valores' : 'Ocultar valores'}</span>}
    </button>
  );
}

function BarraLateral({
  privado,
  aoAlternarPrivacidade,
}: {
  privado: boolean;
  aoAlternarPrivacidade: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-borda bg-superficie md:flex">
      <div className="px-5 py-6">
        <Marca />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {[...PRINCIPAIS, ...SECUNDARIOS].map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            end={item.para === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? 'bg-superficie-alta font-medium text-slate-100'
                  : 'text-slate-400 hover:bg-superficie-alta/60 hover:text-slate-200'
              }`
            }
          >
            <item.icone />
            {item.rotulo}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-borda px-4 py-4">
        <BotaoPrivacidade privado={privado} aoAlternar={aoAlternarPrivacidade} comRotulo />
        <NavLink to="/mais" className="block text-xs text-slate-500 hover:text-slate-300">
          Conta e preferências
        </NavLink>
      </div>
    </aside>
  );
}

function CabecalhoCelular({
  privado,
  aoAlternarPrivacidade,
}: {
  privado: boolean;
  aoAlternarPrivacidade: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-borda bg-fundo/90 px-4 py-3 backdrop-blur md:hidden">
      <Marca />
      <BotaoPrivacidade privado={privado} aoAlternar={aoAlternarPrivacidade} />
    </header>
  );
}

function BarraInferior() {
  const abas: Item[] = [...PRINCIPAIS, { para: '/mais', rotulo: 'Mais', icone: IconeMais }];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie/95 backdrop-blur md:hidden">
      <div className="flex items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {abas.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.para === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] transition ${
                isActive ? 'text-emerald-400' : 'text-slate-500'
              }`
            }
          >
            <aba.icone />
            {aba.rotulo}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
