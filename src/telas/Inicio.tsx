import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatar } from '../dominio/dinheiro';
import { entraNoConsolidado } from '../dominio/saldo';
import { ADIAVEIS, lerStatusOnboarding, PASSOS } from '../dados/config';
import { usarContasComSaldo } from '../dados/usarContas';

/**
 * Início provisório. O dashboard de verdade é da Fase 5 — aqui só aparece o que
 * já existe de fato. Estado vazio explícito em vez de gráfico zerado (§13.5):
 * nunca mostrar R$ 0,00 onde a resposta certa é "ainda não sei".
 */
export function Inicio() {
  const contas = usarContasComSaldo();
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: lerStatusOnboarding });

  const lista = contas.data ?? [];
  const disponiveis = lista.filter(entraNoConsolidado);
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);

  const status = onboarding.data;
  const pendente = status && !status.concluido;
  const adiados = (status?.pulados ?? []).filter((p) => ADIAVEIS.includes(p));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Início</h1>
      </header>

      {/* Banner discreto do onboarding retomável (§4.1). */}
      {pendente && (
        <Link
          to="/comecar"
          className="block rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4"
        >
          <p className="text-sm text-emerald-200">Terminar a configuração inicial</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            Parou no passo {PASSOS.indexOf(status.passoAtual) + 1} de {PASSOS.length}. Leva menos de
            10 minutos e é o que faz a projeção começar a funcionar.
          </p>
        </Link>
      )}

      {status?.concluido && adiados.length > 0 && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-200">Configuração incompleta</p>
          <p className="mt-1 text-xs text-amber-200/80">
            {adiados.includes('parcelamentos')
              ? 'Os parcelamentos em andamento ficaram de fora: sem eles os próximos meses aparecem artificialmente baratos.'
              : 'A fatura aberta ficou de fora: sem ela o app acha que o mês está mais barato do que está.'}{' '}
            <Link to="/comecar" className="underline">
              preencher agora
            </Link>
          </p>
        </div>
      )}

      {contas.isPending && <p className="text-slate-400">Carregando…</p>}

      {contas.isError && (
        <p className="text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>
      )}

      {contas.isSuccess && disponiveis.length === 0 && !pendente && (
        <section className="rounded-xl border border-dashed border-slate-700 p-6">
          <p className="text-slate-300">Ainda não há contas cadastradas.</p>
          <p className="mt-2 text-sm text-slate-500">
            Sem conta não existe saldo para mostrar — e exibir R$ 0,00 aqui seria mentira, não
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
          <p className="mt-2 text-xs text-slate-500">
            Não inclui a conta Empresa, dívidas nem faturas de cartão.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-800/60 p-4">
        <p className="text-sm text-slate-400">Em construção</p>
        <p className="mt-1 text-xs text-slate-500">
          O dashboard com gastos por categoria e fatura do mês é da Fase 5. Até lá, esta tela mostra
          só o que já dá para afirmar com certeza.
        </p>
      </section>
    </div>
  );
}
