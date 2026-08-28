import { Link } from 'react-router-dom';
import { formatar } from '../dominio/dinheiro';
import { entraNoConsolidado } from '../dominio/saldo';
import { useAutenticacao } from '../dados/autenticacao';
import { usarContasComSaldo } from '../dados/usarContas';

/**
 * Início provisório. O dashboard de verdade é da Fase 5 — aqui só mostra o que
 * já existe de fato. Estado vazio explícito em vez de gráfico zerado (§13.5):
 * nunca exibir R$ 0,00 onde a resposta certa é "ainda não sei".
 */
export function Inicio() {
  const { sessao } = useAutenticacao();
  const contas = usarContasComSaldo();

  const lista = contas.data ?? [];
  const disponiveis = lista.filter(entraNoConsolidado);
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Início</h1>
        <p className="text-sm text-slate-500">{sessao?.user.email}</p>
      </header>

      {contas.isPending && <p className="text-slate-400">Carregando…</p>}

      {contas.isError && (
        <p className="text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>
      )}

      {contas.isSuccess && disponiveis.length === 0 && (
        <section className="rounded-xl border border-dashed border-slate-700 p-6">
          <p className="text-slate-300">Ainda não há contas cadastradas.</p>
          <p className="mt-2 text-sm text-slate-500">
            Sem conta não existe saldo para mostrar — e mostrar R$ 0,00 aqui seria mentira, não
            informação.
          </p>
          <Link
            to="/contas"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Cadastrar conta
          </Link>
        </section>
      )}

      {contas.isSuccess && disponiveis.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Disponível para gastar</p>
          <p className="mt-1 text-3xl font-semibold text-slate-100">{formatar(consolidado)}</p>
          <Link to="/contas" className="mt-3 inline-block text-sm text-emerald-400">
            Ver contas
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-slate-800/60 p-4">
        <p className="text-sm text-slate-400">Em construção</p>
        <p className="mt-1 text-xs text-slate-500">
          Fase 1 em andamento: contas já funcionam. Faltam cartões, o onboarding e a folha de
          lançamento rápido — que é a razão de existir desta fase.
        </p>
      </section>
    </div>
  );
}
