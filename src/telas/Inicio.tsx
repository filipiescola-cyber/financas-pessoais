import { useQuery } from '@tanstack/react-query';
import { useAutenticacao } from '../dados/autenticacao';
import { supabase } from '../dados/supabase';

// Tela de verificação da Fase 0. Existe só para provar que conexão, sessão e RLS
// estão de pé (critério de aceite 0.8). A Fase 1 substitui esta tela pelo
// dashboard de verdade — não construir nada em cima dela.
export function Inicio() {
  const { sessao, sair } = useAutenticacao();

  const contagens = useQuery({
    queryKey: ['fase0', 'contagens'],
    queryFn: async () => {
      const contas = await supabase.from('contas').select('*', { count: 'exact', head: true });
      if (contas.error) throw contas.error;

      const categorias = await supabase
        .from('categorias')
        .select('*', { count: 'exact', head: true });
      if (categorias.error) throw categorias.error;

      return { contas: contas.count ?? 0, categorias: categorias.count ?? 0 };
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100">Fase 0 — fundação no ar</h1>
        <p className="text-sm text-slate-400">{sessao?.user.email}</p>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm">
        {contagens.isPending && <p className="text-slate-400">Consultando o banco…</p>}

        {contagens.isError && (
          <p className="text-red-400">
            Erro ao consultar: {(contagens.error as Error).message}
          </p>
        )}

        {contagens.isSuccess && (
          <ul className="space-y-1 text-slate-300">
            <li>
              Contas cadastradas: <strong>{contagens.data.contas}</strong>{' '}
              <span className="text-slate-500">(esperado: 0 nesta fase)</span>
            </li>
            <li>
              Categorias no seed: <strong>{contagens.data.categorias}</strong>{' '}
              <span className="text-slate-500">(esperado: 25)</span>
            </li>
          </ul>
        )}
      </section>

      <button
        onClick={() => void sair()}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
      >
        Sair
      </button>
    </div>
  );
}
