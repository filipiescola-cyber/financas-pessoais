import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, ultimoDiaDoMes } from '../dominio/datas';
import { entraNoConsolidado, rotuloDaContaEmpresa } from '../dominio/saldo';
import { agruparEmArvore } from '../dominio/arvoreDeContas';
import { ADIAVEIS, lerStatusOnboarding, passosDaTrilha, trilhaDe } from '../dados/config';
import { usarContasComSaldo } from '../dados/usarContas';
import { usarTransacoes } from '../dados/usarTransacoes';
import { usarCartoes } from '../dados/usarCartoes';
import { proximosVencimentos } from '../dados/projecao';
import { montarEntradaDosAlertas } from '../dados/alertas';
import { gerarAlertas, ordenarPorGravidade } from '../dominio/alertas';
import { formatarBR } from '../dominio/datas';
import { useMutation } from '@tanstack/react-query';
import { previstoDoMes, resumirPrevisto, type ItemPrevisto } from '../dominio/previsto';
import { gerarUmaOcorrencia, ocorrenciasDoPeriodo } from '../dados/geracaoRecorrencias';
import { RevisarELancar } from '../ui/RevisarELancar';
import { usarRecorrencias } from '../dados/usarModelos';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarFeriados } from '../dados/usarFeriados';
import { usarAviso } from '../ui/Aviso';
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
    // Os alertas custam várias consultas e uma projeção inteira. Recalcular a
    // cada volta ao Início deixaria a tela mais usada do app lenta, e o que
    // eles medem muda por dia, não por minuto.
    staleTime: 10 * 60 * 1000,
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
  const passosDoUsuario = passosDaTrilha(status ? trilhaDe(status) : 'rapida');
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
            Parou no passo {passosDoUsuario.indexOf(status.passoAtual) + 1} de{' '}
            {passosDoUsuario.length}. Leva menos de
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
              Preencher agora
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
            rotulo="Saldo"
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
              Ver todas
            </Link>
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {/* Mesma hierarquia da tela de Contas: caixinha e cofrinho ficam
                  recuados sob a principal. O saldo de cada um continua sendo o
                  dele — o consolidado lá em cima já somou os dois (§13.2). */}
              {agruparEmArvore(disponiveis).map(({ conta, subcontas }) => (
                <li key={conta.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-200">{conta.nome}</span>
                    <Dinheiro
                      centavos={conta.saldoAtual}
                      className={`shrink-0 text-sm ${
                        conta.saldoAtual < 0 ? 'text-red-400' : 'text-slate-200'
                      }`}
                    />
                  </div>

                  {subcontas.length > 0 && (
                    <ul className="mt-1.5 space-y-1 border-l border-borda pl-3">
                      {subcontas.map((sub) => (
                        <li key={sub.id} className="flex items-center justify-between gap-3">
                          <span className="truncate text-xs text-slate-400">{sub.nome}</span>
                          <Dinheiro
                            centavos={sub.saldoAtual}
                            className={`shrink-0 text-xs ${
                              sub.saldoAtual < 0 ? 'text-red-400' : 'text-slate-400'
                            }`}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
        </Secao>
      )}

      <PrevistoDoMes mes={mes} />

      {(vencimentos.data ?? []).length > 0 && (
        <Secao
          titulo="Faturas a vencer"
          acao={
            <Link to="/faturas" className="text-xs text-emerald-400 hover:text-emerald-300">
              Ver faturas
            </Link>
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {(vencimentos.data ?? []).map((fatura) => (
                <LinhaDeFatura
                  key={fatura.id}
                  nome={
                    cartoes.data?.find((c) => c.contaId === fatura.cartaoId)?.conta.nome ?? 'Cartão'
                  }
                  total={fatura.total}
                  vencimento={fatura.vencimento}
                  vencida={fatura.vencida}
                />
              ))}
            </ul>
          </Cartao>
        </Secao>
      )}
    </Pagina>
  );
}

/**
 * Linha de fatura a vencer.
 *
 * O total chega pronto: era uma consulta por fatura aqui dentro, e agora sai
 * somado junto com a lista, numa ida só. De quebra é o mesmo número que decide
 * se a fatura aparece — vazia não entra.
 */
function LinhaDeFatura({
  nome,
  total,
  vencimento,
  vencida,
}: {
  nome: string;
  total: Centavos;
  vencimento: string;
  vencida: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-200">{nome}</p>
        <p className={`text-xs ${vencida ? 'text-amber-400' : 'text-slate-500'}`}>
          {vencida ? 'Venceu' : 'Vence'} em {formatarBR(vencimento)}
        </p>
      </div>
      <Dinheiro centavos={Math.abs(total)} className="shrink-0 text-sm text-slate-200" />
    </li>
  );
}

/**
 * O previsto do mês (§5.2).
 *
 * Duas perguntas que a tela inicial precisava responder e não respondia: o que
 * já entrou e o que ainda falta. E, principalmente: o que era para ter
 * acontecido e não aconteceu.
 *
 * O lançamento é sob comando — "eu reviso e lanço". A geração automática cobre
 * o caminho normal; isto cobre o que ela deliberadamente não faz, que é criar
 * vencimento anterior à data em que a recorrência foi cadastrada.
 */
function PrevistoDoMes({ mes }: { mes: string }) {
  const recorrencias = usarRecorrencias();
  const cartoes = usarCartoes();
  const feriados = usarFeriados();
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();

  const geradas = useQuery({
    queryKey: ['ocorrencias-geradas', mes],
    queryFn: () => ocorrenciasDoPeriodo(mes, ultimoDiaDoMes(mes)),
  });

  const lancar = useMutation({
    mutationFn: ({ id, data, valor }: { id: string; data: string; valor: Centavos }) =>
      gerarUmaOcorrencia(id, data, valor),
    onSuccess: async (resultado) => {
      await invalidar();
      mostrar(
        resultado === 'criada'
          ? 'Lançado. Dá para ajustar o valor na lista, se veio diferente.'
          : 'Esse já estava lançado.',
      );
    },
  });

  if (!recorrencias.data || recorrencias.data.length === 0 || !geradas.data) return null;

  // No cartão a cobrança e a saída de dinheiro caem em datas diferentes (§2.1).
  // A lista fica na data da cobrança, que é a que a pessoa reconhece, mas cada
  // linha diz em qual fatura o valor entra.
  const cartaoPorConta = new Map(
    (cartoes.data ?? []).map((c) => [
      c.contaId,
      { diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento },
    ]),
  );

  const itens = previstoDoMes(
    recorrencias.data.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      tipo: r.tipo,
      valorPrevisto: r.valorPrevisto,
      dia: r.dia,
      regra: r.regra,
      comecaEm: r.comecaEm,
      terminaEm: r.terminaEm,
      incremento: r.incremento,
      cartao: cartaoPorConta.get(r.contaId) ?? null,
    })),
    geradas.data.geradas,
    mes,
    hoje(),
    feriados,
    geradas.data.puladas,
  );

  const resumo = resumirPrevisto(itens);
  const pendentes = itens.filter((i) => i.situacao !== 'lancado');

  return (
    <Secao
      titulo="Previsto para o mês"
      acao={
        resumo.atrasados > 0 ? (
          <span className="text-xs text-amber-400">
            {resumo.atrasados} esperando você
          </span>
        ) : undefined
      }
    >
      {(resumo.faltaEntrar > 0 || resumo.faltaSair > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Cartao className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Ainda falta entrar</p>
            <Dinheiro centavos={resumo.faltaEntrar} className="mt-1 block text-xl text-slate-100" />
          </Cartao>
          <Cartao className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Ainda falta sair</p>
            <Dinheiro centavos={resumo.faltaSair} className="mt-1 block text-xl text-slate-100" />
          </Cartao>
        </div>
      )}

      {pendentes.length === 0 ? (
        <Cartao className="p-4">
          <p className="text-sm text-slate-400">
            Tudo que era previsto para este mês já foi lançado.
          </p>
        </Cartao>
      ) : (
        <Cartao>
          <ul className="divide-y divide-borda">
            {pendentes.map((item) => (
              <LinhaPrevista
                key={`${item.recorrenciaId}-${item.dataPrevista}`}
                item={item}
                lancando={lancar.isPending}
                aoLancar={(valor) =>
                  lancar.mutate({ id: item.recorrenciaId, data: item.dataPrevista, valor })
                }
              />
            ))}
          </ul>
        </Cartao>
      )}
    </Secao>
  );
}

function LinhaPrevista({
  item,
  lancando,
  aoLancar,
}: {
  item: ItemPrevisto;
  lancando: boolean;
  aoLancar: (valorReal: Centavos) => void;
}) {
  const [revisando, setRevisando] = useState(false);
  const atrasado = item.situacao === 'atrasado';

  return (
    <li className="px-4 py-3">
      {/* Envolve tudo: fechado, o gatilho fica na mesma linha do valor; aberto,
          o painel é `w-full` e cai sozinho para a linha de baixo. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{item.descricao}</p>
          <p className={`text-xs ${atrasado ? 'text-amber-400' : 'text-slate-500'}`}>
            {atrasado ? 'Era para ter acontecido em ' : 'Previsto para '}
            {formatarBR(item.dataPrevista)}
            {item.valor === null && ' · valor varia'}
            {/* No cartão a cobrança é numa data e a saída de dinheiro é noutra (§2.1). */}
            {item.vencimentoDaFatura && ` · entra na fatura de ${formatarBR(item.vencimentoDaFatura)}`}
          </p>
        </div>

        {item.valor !== null && (
          <Dinheiro
            centavos={item.tipo === 'receita' ? item.valor : -item.valor}
            className={`shrink-0 text-sm ${
              item.tipo === 'receita' ? 'text-emerald-400' : 'text-slate-300'
            }`}
          />
        )}

        {atrasado && !revisando && (
          <Botao
            tipo="secundario"
            aoClicar={() => setRevisando(true)}
            className="shrink-0 px-3 py-1 text-xs"
          >
            Revisar e lançar
          </Botao>
        )}

        {revisando && (
          <RevisarELancar
            valorPrevisto={item.valor}
            tipo={item.tipo}
            lancando={lancando}
            aoConfirmar={aoLancar}
            aoCancelar={() => setRevisando(false)}
          />
        )}
      </div>
    </li>
  );
}
