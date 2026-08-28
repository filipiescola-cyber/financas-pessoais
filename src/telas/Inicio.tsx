import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatar } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, ultimoDiaDoMes } from '../dominio/datas';
import { entraNoConsolidado, rotuloDaContaEmpresa } from '../dominio/saldo';
import { ADIAVEIS, lerStatusOnboarding, PASSOS } from '../dados/config';
import { usarContasComSaldo } from '../dados/usarContas';
import { usarTransacoes } from '../dados/usarTransacoes';
import { usarCartoes } from '../dados/usarCartoes';
import { proximosVencimentos } from '../dados/projecao';
import { montarEntradaDosAlertas } from '../dados/alertas';
import { gerarAlertas, ordenarPorGravidade } from '../dominio/alertas';
import { totalDaFatura } from '../dados/faturas';
import { formatarBR } from '../dominio/datas';
import { Botao, Cartao, CartaoIndicador, Dinheiro, Pagina, Secao, Vazio } from '../ui/base';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Início. O dashboard completo é da Fase 5 — aqui só aparece o que já dá para
 * afirmar com certeza. Estado vazio explícito em vez de gráfico zerado (§13.5):
 * nunca mostrar R$ 0,00 onde a resposta certa é "ainda não sei".
 */
export function Inicio() {
  const contas = usarContasComSaldo();
  const mes = primeiroDiaDoMes(hoje());
  const transacoes = usarTransacoes({ de: mes, ate: ultimoDiaDoMes(mes) });
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: lerStatusOnboarding });
  const vencimentos = useQuery({ queryKey: ['vencimentos'], queryFn: () => proximosVencimentos() });
  const cartoes = usarCartoes();
  const entradaDosAlertas = useQuery({
    queryKey: ['alertas'],
    queryFn: () => montarEntradaDosAlertas(),
  });

  const alertas = entradaDosAlertas.data
    ? ordenarPorGravidade(gerarAlertas(entradaDosAlertas.data))
    : [];

  // O fechamento é do dia 1º (§8.7). O lembrete some depois do dia 7 para não
  // virar cobrança permanente.
  const diaDeHoje = Number(hoje().split('-')[2]);
  const lembrarFechamento = diaDeHoje <= 7;

  const lista = contas.data ?? [];
  const disponiveis = lista.filter(entraNoConsolidado);
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);
  const empresa = lista.find((c) => c.tipo === 'empresa');

  const doMes = transacoes.data ?? [];
  const receitas = doMes.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const despesas = doMes.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

  const status = onboarding.data;
  const pendente = status && !status.concluido;
  const adiados = (status?.pulados ?? []).filter((p) => ADIAVEIS.includes(p));
  const nomeDoMes = MESES[Number(mes.split('-')[1]) - 1];

  const semDados = contas.isSuccess && disponiveis.length === 0;

  return (
    <Pagina titulo="Início" subtitulo={`Visão geral de ${nomeDoMes}`}>
      {pendente && (
        <Link
          to="/comecar"
          className="block rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 transition hover:border-emerald-700"
        >
          <p className="text-sm font-medium text-emerald-200">Terminar a configuração inicial</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/70">
            Parou no passo {PASSOS.indexOf(status.passoAtual) + 1} de {PASSOS.length}. Leva menos de
            10 minutos e é o que faz a projeção começar a funcionar.
          </p>
        </Link>
      )}

      {status?.concluido && adiados.length > 0 && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <p className="text-sm font-medium text-amber-200">Configuração incompleta</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            {adiados.includes('parcelamentos')
              ? 'Os parcelamentos em andamento ficaram de fora: sem eles os próximos meses aparecem artificialmente baratos.'
              : 'A fatura aberta ficou de fora: sem ela o app acha que o mês está mais barato do que está.'}{' '}
            <Link to="/comecar" className="underline">
              preencher agora
            </Link>
          </p>
        </div>
      )}

      {lembrarFechamento && (
        <Link
          to="/fechamento"
          className="block rounded-xl border border-sky-900/50 bg-sky-950/30 p-4 transition hover:border-sky-800"
        >
          <p className="text-sm font-medium text-sky-200">Fechar o mês passado</p>
          <p className="mt-1 text-xs leading-relaxed text-sky-200/70">
            Dez minutos: conferir saldos, revisar o que ficou sem categoria, ver como foi o mês e
            preparar o novo. É o ritual que mantém o app confiável.
          </p>
        </Link>
      )}

      {alertas.length > 0 && (
        <Secao titulo="Vale olhar">
          <div className="space-y-2">
            {alertas.map((alerta) => (
              <Link
                key={alerta.id}
                to={alerta.destino ?? '/'}
                className={`block rounded-xl border p-4 transition ${
                  alerta.gravidade === 'urgente'
                    ? 'border-red-900/50 bg-red-950/25 hover:border-red-800'
                    : alerta.gravidade === 'atencao'
                      ? 'border-amber-800/40 bg-amber-950/20 hover:border-amber-700'
                      : 'border-borda bg-superficie hover:border-borda-forte'
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    alerta.gravidade === 'urgente'
                      ? 'text-red-200'
                      : alerta.gravidade === 'atencao'
                        ? 'text-amber-200'
                        : 'text-slate-200'
                  }`}
                >
                  {alerta.titulo}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{alerta.detalhe}</p>
              </Link>
            ))}
          </div>
        </Secao>
      )}

      {contas.isError && (
        <p className="text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>
      )}

      {semDados && !pendente ? (
        <Vazio
          titulo="Ainda não há contas cadastradas"
          descricao="Sem conta não existe saldo para mostrar — e exibir R$ 0,00 aqui seria mentira, não informação."
          acao={
            <Link to="/contas">
              <Botao>Cadastrar conta</Botao>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CartaoIndicador
            rotulo="Disponível para gastar"
            sotaque="verde"
            valor={formatar(consolidado)}
            detalhe="Não inclui a conta Empresa, dívidas nem faturas de cartão."
          />
          <CartaoIndicador
            rotulo={`Entrou em ${nomeDoMes}`}
            sotaque="azul"
            valor={formatar(receitas)}
            detalhe="Transferência não conta como receita."
          />
          <CartaoIndicador
            rotulo={`Saiu em ${nomeDoMes}`}
            sotaque="ambar"
            valor={formatar(Math.abs(despesas))}
            detalhe="Pagamento de fatura não entra aqui: a despesa já foi contada em cada compra."
          />
          {empresa && (
            <CartaoIndicador
              rotulo={rotuloDaContaEmpresa(empresa.saldoAtual)}
              /* Nunca verde: número subindo aqui parece boa notícia e é o oposto (§2.6). */
              sotaque="neutro"
              tamanho="medio"
              valor={formatar(Math.abs(empresa.saldoAtual))}
              detalhe="Dinheiro seu parado dentro do negócio. É recebível, não caixa."
            />
          )}
        </div>
      )}

      {disponiveis.length > 0 && (
        <Secao
          titulo="Contas"
          acao={
            <Link to="/contas" className="text-xs text-emerald-400 hover:text-emerald-300">
              ver todas
            </Link>
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {disponiveis.map((conta) => (
                <li key={conta.id} className="flex items-center justify-between px-4 py-3">
                  <span className="truncate text-sm text-slate-200">{conta.nome}</span>
                  <Dinheiro
                    centavos={conta.saldoAtual}
                    className={`text-sm ${conta.saldoAtual < 0 ? 'text-red-400' : 'text-slate-200'}`}
                  />
                </li>
              ))}
            </ul>
          </Cartao>
        </Secao>
      )}

      {(vencimentos.data ?? []).length > 0 && (
        <Secao
          titulo="Faturas a vencer"
          acao={
            <Link to="/faturas" className="text-xs text-emerald-400 hover:text-emerald-300">
              ver faturas
            </Link>
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {(vencimentos.data ?? []).map((fatura) => (
                <LinhaDeFatura
                  key={fatura.id}
                  faturaId={fatura.id}
                  nome={
                    cartoes.data?.find((c) => c.contaId === fatura.cartaoId)?.conta.nome ?? 'Cartão'
                  }
                  vencimento={fatura.vencimento}
                  vencida={fatura.vencida}
                />
              ))}
            </ul>
          </Cartao>
        </Secao>
      )}

      <Cartao className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Em construção</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          O fechamento mensal guiado e os alertas ainda não existem. Relatórios, fluxo de caixa e
          simulador já estão em Mais.
        </p>
      </Cartao>
    </Pagina>
  );
}

/**
 * Linha de fatura a vencer. O total é somado das transações, não lido de
 * `valor_total`: enquanto a fatura está aberta ela muda a cada lançamento (§13.2).
 */
function LinhaDeFatura({
  faturaId,
  nome,
  vencimento,
  vencida,
}: {
  faturaId: string;
  nome: string;
  vencimento: string;
  vencida: boolean;
}) {
  const total = useQuery({
    queryKey: ['fatura-total', faturaId],
    queryFn: () => totalDaFatura(faturaId),
  });

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-200">{nome}</p>
        <p className={`text-xs ${vencida ? 'text-amber-400' : 'text-slate-500'}`}>
          {vencida ? 'venceu' : 'vence'} em {formatarBR(vencimento)}
        </p>
      </div>
      <Dinheiro centavos={Math.abs(total.data ?? 0)} className="shrink-0 text-sm text-slate-200" />
    </li>
  );
}
