import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatarBR, hoje, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import {
  descreverFatura,
  faturaDeReferencia,
  faturaDoMes,
  saldoDaFatura,
} from '../dominio/fatura';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { usarCartoes } from '../dados/usarCartoes';
import type { CartaoComConta } from '../dados/tipos';
import { podePagarFatura } from '../dominio/saldo';
import {
  tabelaDeAmortizacao,
  taxaImplicita,
  taxaMensalDeAnual,
} from '../dominio/divida';
import { usarContas } from '../dados/usarContas';
import { usarBuscaDeCategoria } from '../dados/usarTransacoes';
import {
  cartoesComFaturaPendente,
  desfazerPagamentoDeFatura,
  listarFaturas,
  pagarFatura,
  parcelarFatura,
  totalPagoDaFatura,
  type Fatura,
} from '../dados/faturas';
import { listarTransacoesDaFatura, type Transacao } from '../dados/transacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import {
  ALVO_DE_TOQUE,
  Botao,
  Campo,
  Chip,
  ENTRADA,
  Pagina,
  Vazio,
} from '../ui/base';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';
import { EditarTransacao } from './EditarTransacao';

const ROTULO_STATUS: Record<Fatura['status'], string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
};

/**
 * Faturas (§2.1). Uma compra no cartão não é saída de caixa no dia — é despesa
 * que entra numa fatura, e o dinheiro só sai no vencimento.
 *
 * O total exibido é SOMADO das transações, não lido de `valor_total`: enquanto a
 * fatura está aberta ela muda a cada lançamento, e coluna guardada
 * dessincroniza na primeira edição de transação antiga (§13.2).
 */
export function Faturas() {
  const cartoes = usarCartoes(true);
  const [cartaoId, setCartaoId] = useState<string | null>(null);

  // Cartão encerrado com fatura por pagar continua aqui, e só aqui: ele já
  // sumiu do seletor de lançamento, mas sumir também da tela onde a dívida se
  // paga transformaria "encerrei o cartão" em "esqueci o que devia".
  const pendentes = useQuery({
    queryKey: ['cartoes-com-fatura-pendente'],
    queryFn: cartoesComFaturaPendente,
  });

  const lista = (cartoes.data ?? []).filter(
    (c) => c.conta.ativo || (pendentes.data ?? []).includes(c.contaId),
  );

  useEffect(() => {
    if (cartaoId === null && lista.length > 0) setCartaoId(lista[0]?.contaId ?? null);
  }, [lista, cartaoId]);

  if (cartoes.isPending || pendentes.isPending) {
    return (
      <Pagina titulo="Faturas">
        <p className="text-slate-400">Carregando…</p>
      </Pagina>
    );
  }

  if (lista.length === 0) {
    return (
      <Pagina titulo="Faturas">
        <Vazio
          titulo="Nenhum cartão cadastrado"
          descricao="A fatura só existe a partir do cartão: é o dia de fechamento dele que decide em qual fatura cada compra cai."
        />
      </Pagina>
    );
  }

  const cartao = lista.find((c) => c.contaId === cartaoId) ?? lista[0]!;

  return (
    <Pagina titulo="Faturas" subtitulo="Compra no cartão não é saída de caixa no dia">
      {lista.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lista.map((c) => (
            <Chip
              key={c.contaId}
              ativo={cartao.contaId === c.contaId}
              aoClicar={() => setCartaoId(c.contaId)}
            >
              {c.conta.nome}
              {!c.conta.ativo && ' · encerrado'}
            </Chip>
          ))}
        </div>
      )}

      <FaturaDoMes cartao={cartao} />
    </Pagina>
  );
}

/**
 * Uma fatura por vez, o mês inteiro (§2.1).
 *
 * Antes eram todos os meses empilhados na mesma tela, cada um numa sanfona.
 * Fatura não se lê assim: a do banco é um documento fechado, de um mês só, com
 * tudo à vista. Empilhar doze delas obrigava a abrir e fechar caixas para
 * encontrar a de setembro, e o que importa quase sempre é uma só.
 *
 * A navegação é por mês de referência, como na lista de lançamentos, e para nas
 * pontas: antes da primeira fatura gerada e depois da última não há o que
 * mostrar.
 */
function FaturaDoMes({ cartao }: { cartao: CartaoComConta }) {
  const faturas = useQuery({
    queryKey: ['faturas', cartao.contaId],
    queryFn: () => listarFaturas(cartao.contaId),
  });

  // Começa na fatura em que uma compra de hoje cairia — a que está aberta
  // agora, que é a que se quer ver ao entrar na tela.
  const mesAtual = faturaDeReferencia(hoje(), cartao).mesReferencia;
  const [mes, setMes] = useState<DataISO>(mesAtual);

  const lista = faturas.data ?? [];
  const fatura = lista.find((f) => f.mesReferencia === mes) ?? null;

  const meses = lista.map((f) => f.mesReferencia).sort();
  const temAnterior = meses.some((m) => m < mes);
  const temSeguinte = meses.some((m) => m > mes);

  if (faturas.isPending) return <p className="text-slate-400">Carregando faturas…</p>;
  if (faturas.isError) return <p className="text-red-400">{(faturas.error as Error).message}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-200">Fatura de {nomeDoMes(mes)}</p>
          {fatura && (
            <p className="text-xs text-slate-500">
              Fecha em {formatarBR(fatura.dataFechamento)} · vence em{' '}
              {formatarBR(fatura.dataVencimento)} · {ROTULO_STATUS[fatura.status]}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Botao
            tipo="secundario"
            aoClicar={() => setMes(somarMeses(mes, -1))}
            desabilitado={!temAnterior}
            className="px-3"
          >
            ‹
          </Botao>
          <Botao
            tipo="secundario"
            aoClicar={() => setMes(somarMeses(mes, 1))}
            desabilitado={!temSeguinte}
            className="px-3"
          >
            ›
          </Botao>
        </div>
      </div>

      {fatura === null ? (
        <p className="rounded-xl border border-dashed border-borda-forte p-6 text-center text-sm text-slate-400">
          Não há fatura gerada para {nomeDoMes(mes)}. Elas são criadas na abertura do app, doze
          meses à frente.
        </p>
      ) : (
        <CartaoDeFatura
          fatura={fatura}
          cartaoId={cartao.contaId}
          nomeDoCartao={cartao.conta.nome}
        />
      )}
    </div>
  );
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function nomeDoMes(data: DataISO): string {
  const [ano, mes] = data.split('-');
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}


function CartaoDeFatura({
  fatura,
  cartaoId,
  nomeDoCartao,
}: {
  fatura: Fatura;
  cartaoId: string;
  nomeDoCartao: string;
}) {
  const transacoes = useQuery({
    queryKey: ['transacoes-fatura', fatura.id],
    queryFn: () => listarTransacoesDaFatura(fatura.id),
  });

  // Somado das compras, nunca lido de `valor_total`: enquanto a fatura está
  // aberta a coluna vale zero (§13.2). Como a tela mostra as compras de
  // qualquer jeito, o total sai da mesma consulta — sem uma ida a mais.
  const total = (transacoes.data ?? [])
    .filter((t) => t.transacaoPaiId === null)
    .reduce((soma, t) => soma + t.valor, 0);

  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const buscarCategoria = usarBuscaDeCategoria();
  const [editando, setEditando] = useState<Transacao | null>(null);


  const desfazer = useMutation({
    mutationFn: () => desfazerPagamentoDeFatura(fatura.id),
    onSuccess: async () => {
      await invalidar();
      mostrar('Pagamento desfeito. A fatura voltou a ficar em aberto.');
    },
  });

  const pagamentos = useQuery({
    queryKey: ['fatura-pago', fatura.id],
    queryFn: () => totalPagoDaFatura(fatura.id),
  });

  // O que falta é calculado, nunca lido do status: pagamento parcial marcava a
  // fatura inteira como paga e o resto sumia de "o que você deve" (§13.2).
  const saldo = saldoDaFatura(total, pagamentos.data ?? 0);
  const parcial = saldo.pago > 0 && !saldo.quitada;
  const vencida = !saldo.quitada && fatura.dataVencimento < hoje();

  return (
    <article className="rounded-xl border border-borda bg-superficie">
      {/* Cabeçalho como o da fatura do banco: o valor em destaque e, ao lado,
          o que ele quer dizer. Deixou de ser botão — a tela mostra uma fatura
          só, e não há mais o que abrir ou fechar. */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {saldo.quitada ? 'Você pagou' : parcial ? 'Ainda falta' : 'Você deve'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {vencida ? 'Venceu' : 'Vence'} em {formatarBR(fatura.dataVencimento)}
            {vencida && ' · vencida'}
          </p>
          {parcial && (
            <p className="mt-0.5 text-xs text-slate-500">
              Já pagos {formatar(saldo.pago)} de {formatar(saldo.total)}.
            </p>
          )}
        </div>
        <span
          className={`dinheiro shrink-0 text-2xl font-semibold ${
            vencida ? 'text-amber-400' : 'text-slate-100'
          }`}
        >
          {formatar(saldo.quitada ? saldo.total : saldo.falta)}
        </span>
      </div>

      <div className="space-y-3 border-t border-borda p-4">
          <p className="text-xs text-slate-500">
            {descreverFatura(
              faturaDoMes(fatura.mesReferencia, {
                diaFechamento: Number(fatura.dataFechamento.slice(8)),
                diaVencimento: Number(fatura.dataVencimento.slice(8)),
              }),
            )}
          </p>

          {transacoes.isPending && <p className="text-sm text-slate-500">Carregando…</p>}

          {transacoes.isSuccess && transacoes.data.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma compra nesta fatura.</p>
          )}

          {/* A compra abre para edição daqui também: era preciso sair para
              Lançamentos e procurar de novo o que já estava na tela. */}
          <ul className="space-y-1">
            {(transacoes.data ?? []).map((transacao) => {
              const categoria = buscarCategoria(transacao.categoriaId);

              return (
              <li key={transacao.id}>
                <button
                  onClick={() => setEditando(transacao)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition hover:bg-superficie-alta"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                    <IconeDeCategoria
                      chave={categoria?.icone ?? null}
                      cor={categoria?.cor ?? null}
                      className="h-4 w-4"
                    />
                    <span className="truncate">
                    {/* Sem descrição, cai na categoria — igual à lista de
                        lançamentos. "Sem descrição 2/2" não identifica nada. */}
                    {transacao.descricao || categoria?.nome || 'Sem descrição'}
                    {transacao.parcelaNum && (
                      <span className="text-slate-500">
                        {' '}
                        {transacao.parcelaNum}/{transacao.parcelaTotal}
                      </span>
                    )}
                    </span>
                  </span>
                  <span className="dinheiro shrink-0 text-slate-400">
                    {formatar(Math.abs(transacao.valor))}
                  </span>
                </button>
              </li>
              );
            })}
          </ul>

          {saldo.quitada ? (
            <div className="space-y-2 rounded-md border border-borda-forte px-3 py-2">
              <p className="text-xs leading-relaxed text-slate-400">
                Fatura paga. O pagamento quitou uma dívida; ele não é despesa, porque a despesa já
                foi contada em cada compra.
              </p>
              <button
                onClick={() => desfazer.mutate()}
                disabled={desfazer.isPending}
                className={`text-xs text-slate-500 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
              >
                {desfazer.isPending ? 'Desfazendo…' : 'Desfazer pagamento'}
              </button>
              {desfazer.isError && (
                <p className="text-xs text-red-400">{(desfazer.error as Error).message}</p>
              )}
            </div>
          ) : (
            <>
              {parcial && (
                <div className="rounded-md border border-borda-forte px-3 py-2">
                  <p className="text-xs leading-relaxed text-slate-400">
                    Pagamento parcial registrado. O que falta continua contando em "o que você
                    deve" e no limite do cartão — e você pode registrar outro pagamento abaixo.
                  </p>
                  <button
                    onClick={() => desfazer.mutate()}
                    disabled={desfazer.isPending}
                    className={`mt-1 text-xs text-slate-500 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
                  >
                    {desfazer.isPending ? 'Desfazendo…' : 'Desfazer o último pagamento'}
                  </button>
                </div>
              )}

              <PagamentoDeFatura
                faturaId={fatura.id}
                cartaoId={cartaoId}
                nomeDoCartao={nomeDoCartao}
                total={saldo.falta}
                vencimento={fatura.dataVencimento}
              />

              <ParcelamentoDaFatura
                faturaId={fatura.id}
                cartaoId={cartaoId}
                nomeDoCartao={nomeDoCartao}
                restante={saldo.falta}
              />
            </>
          )}
      </div>

      <EditarTransacao transacao={editando} aoFechar={() => setEditando(null)} />
    </article>
  );
}

function PagamentoDeFatura({
  faturaId,
  cartaoId,
  nomeDoCartao,
  total,
  vencimento,
}: {
  faturaId: string;
  cartaoId: string;
  nomeDoCartao: string;
  total: Centavos;
  vencimento: DataISO;
}) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas();
  const cartoes = usarCartoes();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState<Centavos>(total);
  const [contaOrigemId, setContaOrigemId] = useState<string | null>(null);
  const [data, setData] = useState<DataISO>(hoje());

  useEffect(() => setValor(total), [total]);

  const origens = (contas.data ?? []).filter(podePagarFatura);

  // A conta cadastrada no cartão é o padrão. Sem ela sobra a primeira da lista,
  // que é uma escolha arbitrária — e pagar da conta errada custa dois
  // lançamentos espelhados para desfazer.
  const padrao = (cartoes.data ?? []).find((c) => c.contaId === cartaoId)?.contaPagamentoId ?? null;

  useEffect(() => {
    if (contaOrigemId !== null || origens.length === 0) return;
    const cadastrada = padrao !== null && origens.some((c) => c.id === padrao) ? padrao : null;
    setContaOrigemId(cadastrada ?? origens[0]?.id ?? null);
  }, [origens, contaOrigemId, padrao]);

  const pagar = useMutation({
    mutationFn: () =>
      pagarFatura({ faturaId, cartaoId, contaOrigemId: contaOrigemId!, valor, data }),
    onSuccess: async () => {
      await invalidar();
      setAberto(false);
      mostrar('Fatura paga. Registrado como quitação da dívida, não como despesa.');
    },
  });

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        disabled={total === 0}
        className="w-full rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
      >
        Registrar pagamento
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <p className="text-xs leading-relaxed text-slate-400">
        Isto <strong>quita uma dívida</strong>, não é uma despesa nova. O gasto já foi contado em
        cada compra: contar de novo aqui dobraria o mês e jogaria tudo numa categoria só, em vez de
        Mercado, Transporte e o resto.
      </p>

      <CampoValor valor={valor} aoMudar={setValor} rotulo={`Valor pago para ${nomeDoCartao}`} />

      <div>
        <span className="text-sm text-slate-400">Pago de</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {origens.map((conta) => (
            <button
              key={conta.id}
              onClick={() => setContaOrigemId(conta.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                contaOrigemId === conta.id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-borda-forte text-slate-300'
              }`}
            >
              {conta.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-500"
        />
        <button
          onClick={() => setData(vencimento)}
          className="rounded-full border border-borda-forte px-3 py-1.5 text-xs text-slate-300"
        >
          No vencimento
        </button>
      </div>

      {valor !== total && (
        <p className="text-xs text-amber-300">
          Pagamento parcial. O que sobrar continua devido, e o app não calcula juros de rotativo.
        </p>
      )}

      {pagar.isError && <p className="text-sm text-red-400">{(pagar.error as Error).message}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => pagar.mutate()}
          disabled={valor <= 0 || contaOrigemId === null || pagar.isPending}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pagar.isPending ? 'Registrando…' : 'Confirmar pagamento'}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-lg border border-borda-forte px-3 py-2 text-sm text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Parcelar o que falta da fatura (§2.1, §4.7).
 *
 * O banco tira o restante desta fatura e recobra com juros. A fatura fica
 * quitada — não por pagamento, mas porque a dívida mudou de forma — e nasce uma
 * dívida com taxa e prazo, que é quem sabe responder quanto isso custou.
 *
 * Onde a parcela é cobrada muda o que aparece, e é a pergunta que a tela faz:
 * no CARTÃO ela cai nas próximas faturas, que é como o banco faz no
 * parcelamento do próprio cartão; numa CONTA é empréstimo à parte.
 *
 * A taxa aceita os dois caminhos do cadastro de dívida — quem tem a proposta do
 * banco informa a taxa, quem tem só o valor da parcela informa a parcela.
 */
function ParcelamentoDaFatura({
  faturaId,
  cartaoId,
  nomeDoCartao,
  restante,
}: {
  faturaId: string;
  cartaoId: string;
  nomeDoCartao: string;
  restante: Centavos;
}) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas();

  const [aberto, setAberto] = useState(false);
  const [parcelas, setParcelas] = useState('');
  const [modo, setModo] = useState<'taxa' | 'parcela'>('taxa');
  const [taxaAnual, setTaxaAnual] = useState('');
  const [valorDaParcela, setValorDaParcela] = useState<Centavos>(0);
  const [cobrarEm, setCobrarEm] = useState<string>(cartaoId);

  const n = Number(parcelas);

  const taxaMensal =
    modo === 'taxa'
      ? taxaMensalDeAnual((Number(taxaAnual.replace(',', '.')) || 0) / 100)
      : taxaImplicita(restante, valorDaParcela, n);

  const podeCalcular = restante > 0 && n >= 1 && taxaMensal !== null;
  const tabela = podeCalcular ? tabelaDeAmortizacao(restante, taxaMensal, n, 'price') : [];
  const juros = tabela.reduce((soma, p) => soma + p.juros, 0);

  const parcelar = useMutation({
    mutationFn: () =>
      parcelarFatura({
        faturaId,
        cartaoId,
        nomeDoCartao,
        restante,
        parcelas: n,
        taxaMensal: taxaMensal ?? 0,
        cobrarEm,
        data: hoje(),
      }),
    onSuccess: async () => {
      await invalidar();
      setAberto(false);
      mostrar('Fatura parcelada. A dívida aparece em Dívidas, com os juros.');
    },
  });

  if (restante <= 0) return null;

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className={`w-full text-xs text-slate-500 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        Parcelar o restante
      </button>
    );
  }

  const cobraveis = [
    { id: cartaoId, nome: `${nomeDoCartao} — nas próximas faturas`, cor: null as string | null },
    ...(contas.data ?? [])
      .filter(podePagarFatura)
      .map((c) => ({ id: c.id, nome: `${c.nome} — empréstimo à parte`, cor: c.cor })),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <p className="text-xs leading-relaxed text-slate-400">
        Parcelar tira os <strong>{formatar(restante)}</strong> desta fatura e recobra com juros. A
        fatura fica quitada — nenhum dinheiro sai agora — e a dívida passa a viver em{' '}
        <strong>Dívidas</strong>, onde dá para ver o saldo devedor e o quanto os juros custaram.
      </p>

      <Campo rotulo="Em quantas vezes">
        <input
          inputMode="numeric"
          value={parcelas}
          onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="12"
          className={ENTRADA}
        />
      </Campo>

      <Campo rotulo="Juros">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Chip ativo={modo === 'taxa'} aoClicar={() => setModo('taxa')}>
              Sei a taxa
            </Chip>
            <Chip ativo={modo === 'parcela'} aoClicar={() => setModo('parcela')}>
              Sei a parcela
            </Chip>
          </div>

          {modo === 'taxa' ? (
            <input
              inputMode="decimal"
              value={taxaAnual}
              onChange={(e) => setTaxaAnual(e.target.value)}
              placeholder="Taxa ao ano (%)"
              className={ENTRADA}
            />
          ) : (
            <CampoValor valor={valorDaParcela} aoMudar={setValorDaParcela} rotulo="Valor da parcela" />
          )}
        </div>
      </Campo>

      <Campo
        rotulo="Onde a parcela é cobrada"
        ajuda="No cartão ela cai nas próximas faturas, como o banco faz no parcelamento do próprio cartão. Numa conta, é empréstimo à parte."
      >
        <div className="flex flex-wrap gap-2">
          {cobraveis.map((opcao) => (
            <Chip key={opcao.id} ativo={cobrarEm === opcao.id} aoClicar={() => setCobrarEm(opcao.id)}>
              {opcao.nome}
            </Chip>
          ))}
        </div>
      </Campo>

      {podeCalcular && tabela.length > 0 && (
        <p className="rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-sm text-slate-200">
          {n}x de <strong>{formatar(tabela[0]!.valor)}</strong> ·{' '}
          <span className="text-slate-400">
            {formatar(juros)} de juros ao todo, {((juros / restante) * 100).toFixed(0)}% do que foi
            parcelado
          </span>
        </p>
      )}

      {parcelar.isError && (
        <p className="text-sm text-red-400">{(parcelar.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => parcelar.mutate()}
          desabilitado={!podeCalcular || parcelar.isPending}
        >
          {parcelar.isPending ? 'Parcelando…' : 'Parcelar'}
        </Botao>
        <Botao tipo="secundario" aoClicar={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
