import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { formatarBR, hoje, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { descreverFatura, faturaDoMes } from '../dominio/fatura';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { usarCartoes } from '../dados/usarCartoes';
import { podePagarFatura } from '../dominio/saldo';
import { usarContas } from '../dados/usarContas';
import {
  cartoesComFaturaPendente,
  listarFaturas,
  pagarFatura,
  totalDaFatura,
  type Fatura,
} from '../dados/faturas';
import { listarTransacoesDaFatura } from '../dados/transacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { Chip, Pagina, Vazio } from '../ui/base';

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

      <ListaDeFaturas cartaoId={cartao.contaId} nomeDoCartao={cartao.conta.nome} />
    </Pagina>
  );
}

function ListaDeFaturas({ cartaoId, nomeDoCartao }: { cartaoId: string; nomeDoCartao: string }) {
  const faturas = useQuery({
    queryKey: ['faturas', cartaoId],
    queryFn: () => listarFaturas(cartaoId),
  });

  const lista = faturas.data ?? [];

  // Os totais vêm somados por fatura. São poucas consultas e evita depender de
  // uma coluna que só é confiável depois do fechamento.
  const totais = useQueries({
    queries: lista.map((fatura) => ({
      queryKey: ['fatura-total', fatura.id],
      queryFn: () => totalDaFatura(fatura.id),
    })),
  });

  const [abertaId, setAbertaId] = useState<string | null>(null);

  if (faturas.isPending) return <p className="text-slate-400">Carregando faturas…</p>;
  if (faturas.isError) return <p className="text-red-400">{(faturas.error as Error).message}</p>;

  if (lista.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-borda-forte p-6 text-center text-sm text-slate-400">
        As faturas são geradas na abertura do app. Recarregue a página se esta lista continuar
        vazia.
      </p>
    );
  }

  // Mostra da mais recente para trás, começando pela que ainda não fechou.
  const ordenadas = [...lista].sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
  const relevantes = ordenadas.filter((f) => f.mesReferencia <= proximoLimite());

  return (
    <div className="space-y-2">
      {relevantes.map((fatura, indice) => {
        const total = totais[lista.indexOf(fatura)]?.data ?? 0;
        return (
          <CartaoDeFatura
            key={fatura.id}
            fatura={fatura}
            total={total}
            cartaoId={cartaoId}
            nomeDoCartao={nomeDoCartao}
            expandida={abertaId === fatura.id || (abertaId === null && indice === 0)}
            aoAlternar={() => setAbertaId(abertaId === fatura.id ? '' : fatura.id)}
          />
        );
      })}
    </div>
  );
}

/** Não faz sentido listar 12 faturas futuras vazias: mostra até 2 meses à frente. */
function proximoLimite(): DataISO {
  const [ano, mes] = hoje().split('-').map(Number);
  const alvo = new Date(Date.UTC(ano!, mes! + 1, 1));
  return alvo.toISOString().slice(0, 10);
}

function CartaoDeFatura({
  fatura,
  total,
  cartaoId,
  nomeDoCartao,
  expandida,
  aoAlternar,
}: {
  fatura: Fatura;
  total: Centavos;
  cartaoId: string;
  nomeDoCartao: string;
  expandida: boolean;
  aoAlternar: () => void;
}) {
  const transacoes = useQuery({
    queryKey: ['transacoes-fatura', fatura.id],
    queryFn: () => listarTransacoesDaFatura(fatura.id),
    enabled: expandida,
  });

  const vencida = fatura.status !== 'paga' && fatura.dataVencimento < hoje();

  return (
    <article className="rounded-xl border border-borda bg-superficie">
      <button onClick={aoAlternar} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div>
          <p className="text-slate-100">
            Vence em {formatarBR(fatura.dataVencimento)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Fecha em {formatarBR(fatura.dataFechamento)} · {ROTULO_STATUS[fatura.status]}
            {vencida && ' · vencida'}
          </p>
        </div>
        <span className="dinheiro shrink-0 text-lg text-slate-100">{formatar(Math.abs(total))}</span>
      </button>

      {expandida && (
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

          <ul className="space-y-1">
            {(transacoes.data ?? []).map((transacao) => (
              <li key={transacao.id} className="flex justify-between gap-3 text-sm">
                <span className="truncate text-slate-300">
                  {transacao.descricao || 'Sem descrição'}
                  {transacao.parcelaNum && (
                    <span className="text-slate-500">
                      {' '}
                      {transacao.parcelaNum}/{transacao.parcelaTotal}
                    </span>
                  )}
                </span>
                <span className="dinheiro shrink-0 text-slate-400">
                  {formatar(Math.abs(transacao.valor))}
                </span>
              </li>
            ))}
          </ul>

          {fatura.status === 'paga' ? (
            <p className="rounded-md border border-borda-forte px-3 py-2 text-xs text-slate-400">
              Fatura paga. O pagamento quitou uma dívida; ele não é despesa, porque a despesa já
              foi contada em cada compra.
            </p>
          ) : (
            <PagamentoDeFatura
              faturaId={fatura.id}
              cartaoId={cartaoId}
              nomeDoCartao={nomeDoCartao}
              total={Math.abs(total)}
              vencimento={fatura.dataVencimento}
            />
          )}
        </div>
      )}
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
