import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  formatarBR,
  hoje,
  primeiroDiaDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import { usarContas } from '../dados/usarContas';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { entraNoConsolidado } from '../dominio/saldo';
import { saldosAoFimDoDia, temMovimentoAdiado } from '../dominio/saldoDiario';
import {
  duplicarTransacao,
  excluirParcelamento,
  excluirTransacao,
  excluirTransacoes,
  movimentosDeCaixa,
  saldoAte,
  type EscopoDeParcelamento,
  type Transacao,
} from '../dados/transacoes';
import { usarCartoes } from '../dados/usarCartoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarAviso } from '../ui/Aviso';
import { listarPendentes } from '../dados/fila';
import { usarFila } from '../dados/usarFila';
import { somarDias } from '../dominio/datas';
import { Botao, Cartao, CartaoIndicador, Dinheiro, Etiqueta, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { IconeConfere, IconeRelogio } from '../ui/icones';
import { EditarTransacao } from './EditarTransacao';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function nomeDoMes(data: DataISO): string {
  const [ano, mes] = data.split('-');
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}

export function Transacoes() {
  const [mes, setMes] = useState<DataISO>(primeiroDiaDoMes(hoje()));
  const [contaId, setContaId] = useState<string | null>(null);
  const [editando, setEditando] = useState<Transacao | null>(null);

  const contas = usarContas();
  const categorias = usarCategorias(true);
  const transacoes = usarTransacoes({ de: mes, ate: ultimoDiaDoMes(mes), contaId });
  const fila = usarFila();

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const lista = transacoes.data ?? [];

  // Receita e despesa nunca viram um total único (§14). Transferência fica fora
  // das duas: ela só move saldo.
  const receitas = lista.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const despesas = lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

  const porDia = agruparPorDia(lista);

  // Saldo diário. Vem por CAIXA, não por competência: é o único que bate com o
  // extrato do banco (§13.2). Sem filtro de conta, usa as mesmas contas que
  // entram no consolidado (§2.6).
  const elegiveis = (contas.data ?? []).filter(entraNoConsolidado).map((c) => c.id);
  const inicio = mes;
  const fim = ultimoDiaDoMes(mes);

  const abertura = useQuery({
    queryKey: ['saldo-abertura', inicio, contaId],
    queryFn: () => saldoAte(somarDias(inicio, -1), contaId),
  });

  const movimentos = useQuery({
    queryKey: ['movimentos-caixa', inicio, fim, contaId, elegiveis.length],
    queryFn: () => movimentosDeCaixa({ de: inicio, ate: fim, contaId, contasElegiveis: elegiveis }),
    enabled: contaId !== null || elegiveis.length > 0,
  });

  const saldosDoDia =
    abertura.data !== undefined && movimentos.data
      ? saldosAoFimDoDia(abertura.data, movimentos.data, porDia.map(([dia]) => dia))
      : null;

  const algumAdiado = lista.some((t) => t.dataCaixa > t.dataCompetencia);

  return (
    <Pagina
      titulo="Lançamentos"
      subtitulo={nomeDoMes(mes)}
      acao={
        <div className="flex items-center gap-1">
          <Botao tipo="secundario" aoClicar={() => setMes(somarMeses(mes, -1))} className="px-3">
            ‹
          </Botao>
          <Botao tipo="secundario" aoClicar={() => setMes(somarMeses(mes, 1))} className="px-3">
            ›
          </Botao>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CartaoIndicador rotulo="Entrou no mês" sotaque="azul" tamanho="medio" valor={formatar(receitas)} />
        <CartaoIndicador
          rotulo="Saiu no mês"
          sotaque="ambar"
          tamanho="medio"
          valor={formatar(Math.abs(despesas))}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroChip ativo={contaId === null} aoClicar={() => setContaId(null)}>
          Todas as contas
        </FiltroChip>
        {(contas.data ?? []).map((conta) => (
          <FiltroChip
            key={conta.id}
            ativo={contaId === conta.id}
            aoClicar={() => setContaId(conta.id)}
          >
            {conta.nome}
          </FiltroChip>
        ))}
      </div>

      {fila.pendentes > 0 && (
        <Secao titulo="Esperando conexão">
          <Cartao>
            <ul className="divide-y divide-borda">
              {listarPendentes().map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-300">{item.descricao}</p>
                    <p className="text-xs text-slate-500">
                      {item.linhas.length} linha(s) · ainda não subiu
                    </p>
                  </div>
                  <Dinheiro
                    centavos={Math.round(Number(item.linhas[0]?.valor ?? 0) * 100)}
                    className="shrink-0 text-sm text-slate-400"
                  />
                </li>
              ))}
            </ul>
          </Cartao>
          <p className="text-xs leading-relaxed text-slate-600">
            Estes lançamentos foram feitos sem conexão e ainda não estão no banco. Eles aparecem
            aqui para você não lançar de novo — e sobem sozinhos quando a rede voltar.
          </p>
        </Secao>
      )}

      {transacoes.isPending && <p className="text-slate-400">Carregando…</p>}
      {transacoes.isError && (
        <p className="text-red-400">Erro: {(transacoes.error as Error).message}</p>
      )}

      {transacoes.isSuccess && lista.length === 0 && (
        <Vazio
          titulo={`Nenhum lançamento em ${nomeDoMes(mes)}`}
          descricao="Use o botão + para lançar. Ele fica visível em todas as telas."
        />
      )}

      {algumAdiado && saldosDoDia && (
        <Nota>
          O saldo ao lado de cada dia é o do <strong>caixa</strong>: ele anda quando o dinheiro sai
          de fato. Compra no cartão aparece no dia da compra e só mexe no saldo no vencimento da
          fatura — por isso um dia pode ter lançamento e o saldo não mudar.
        </Nota>
      )}

      {porDia.map(([dia, doDia]) => (
        <Secao
          key={dia}
          titulo={formatarBR(dia)}
          acao={
            saldosDoDia?.has(dia) ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                {/* Num dia que ainda não chegou, o acumulado é projeção do que
                    já está lançado — chamar de "saldo" seria afirmar demais. */}
                {dia > hoje() ? 'saldo previsto' : 'saldo'}
                <Dinheiro
                  centavos={saldosDoDia.get(dia)!}
                  className={saldosDoDia.get(dia)! < 0 ? 'text-red-400' : 'text-slate-300'}
                />
                {temMovimentoAdiado(doDia) && (
                  <span title="Há compra no cartão neste dia: ela só sai do caixa no vencimento da fatura">
                    ·
                  </span>
                )}
              </span>
            ) : undefined
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {doDia.map((transacao) => (
                <ItemDeTransacao
                  key={transacao.id}
                  transacao={transacao}
                  nomeConta={nomeConta.get(transacao.contaId) ?? '—'}
                  nomeCategoria={
                    transacao.categoriaId ? (nomeCategoria.get(transacao.categoriaId) ?? null) : null
                  }
                  aoEditar={() => setEditando(transacao)}
                />
              ))}
            </ul>
          </Cartao>
        </Secao>
      ))}

      <EditarTransacao transacao={editando} aoFechar={() => setEditando(null)} />
    </Pagina>
  );
}

function agruparPorDia(lista: Transacao[]): [DataISO, Transacao[]][] {
  const mapa = new Map<DataISO, Transacao[]>();
  for (const transacao of lista) {
    const atual = mapa.get(transacao.dataCompetencia) ?? [];
    atual.push(transacao);
    mapa.set(transacao.dataCompetencia, atual);
  }
  return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function FiltroChip({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={aoClicar}
      className={`rounded-full px-3 py-1.5 text-xs transition ${
        ativo
          ? 'bg-superficie-alta text-slate-100'
          : 'border border-borda text-slate-400 hover:border-borda-forte'
      }`}
    >
      {children}
    </button>
  );
}

function ItemDeTransacao({
  transacao,
  nomeConta,
  nomeCategoria,
  aoEditar,
}: {
  transacao: Transacao;
  nomeConta: string;
  nomeCategoria: string | null;
  aoEditar: () => void;
}) {
  const [confirmandoParcelamento, setConfirmandoParcelamento] = useState(false);
  const cartoes = usarCartoes();
  const { mostrar } = usarAviso();

  const invalidar = usarInvalidarTransacoes();

  const excluir = useMutation({
    mutationFn: () => excluirTransacao(transacao),
    onSuccess: async () => {
      await invalidar();
      mostrar('Lançamento excluído.');
    },
  });

  // Duplicar: dois toques para repetir um gasto que se repete (§5.2).
  const duplicar = useMutation({
    mutationFn: () =>
      duplicarTransacao(
        transacao,
        cartoes.data?.find((c) => c.contaId === transacao.contaId) ?? null,
      ),
    onSuccess: async (ids) => {
      await invalidar();
      mostrar('Duplicado para hoje.', {
        rotulo: 'Desfazer',
        executar: () => {
          void excluirTransacoes(ids).then(invalidar);
        },
      });
    },
  });

  const excluirGrupo = useMutation({
    mutationFn: (escopo: EscopoDeParcelamento) =>
      excluirParcelamento(transacao.grupoParcelamentoId!, escopo, transacao.dataCompetencia),
    onSuccess: async () => {
      await invalidar();
      setConfirmandoParcelamento(false);
      mostrar('Parcelamento atualizado.');
    },
  });

  const ehTransferencia = transacao.tipo === 'transferencia';
  const ehParcelado = transacao.grupoParcelamentoId !== null;
  const futura = transacao.dataCompetencia > hoje();

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          <Marcador futura={futura} revisado={transacao.revisado} />

          <div className="min-w-0">
            <p className="truncate text-slate-100">
              {transacao.descricao ||
                nomeCategoria ||
                (ehTransferencia ? 'Transferência' : 'Sem descrição')}
            </p>
            <p className="truncate text-xs text-slate-500">
              {nomeConta}
              {nomeCategoria && ` · ${nomeCategoria}`}
              {ehParcelado && ` · parcela ${transacao.parcelaNum}/${transacao.parcelaTotal}`}
            </p>
            {(ehTransferencia || transacao.motivoEmpresa) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ehTransferencia && (
                  <Etiqueta titulo="Não conta como receita nem como despesa">transferência</Etiqueta>
                )}
                {transacao.motivoEmpresa && <Etiqueta>{transacao.motivoEmpresa}</Etiqueta>}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Dinheiro
            centavos={transacao.valor}
            className={
              ehTransferencia
                ? 'text-slate-400'
                : transacao.valor < 0
                  ? 'text-slate-100'
                  : 'text-emerald-400'
            }
          />
          <div className="flex gap-3">
            <button onClick={aoEditar} className="text-xs text-slate-600 transition hover:text-slate-300">
              editar
            </button>
            {!ehTransferencia && (
              <button
                onClick={() => duplicar.mutate()}
                disabled={duplicar.isPending}
                title="Repete este lançamento com a data de hoje"
                className="text-xs text-slate-600 transition hover:text-slate-300"
              >
                duplicar
              </button>
            )}
            <button
              onClick={() => (ehParcelado ? setConfirmandoParcelamento(true) : excluir.mutate())}
              disabled={excluir.isPending}
              className="text-xs text-slate-600 transition hover:text-red-400"
            >
              excluir
            </button>
          </div>
        </div>
      </div>

      {confirmandoParcelamento && (
        <div className="mt-3 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <p className="text-xs text-slate-300">
            Esta é a parcela {transacao.parcelaNum} de {transacao.parcelaTotal}. O que excluir?
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoEscopo aoClicar={() => excluirGrupo.mutate('esta')}>Só esta</BotaoEscopo>
            <BotaoEscopo aoClicar={() => excluirGrupo.mutate('esta-e-futuras')}>
              Esta e as futuras
            </BotaoEscopo>
            <BotaoEscopo aoClicar={() => excluirGrupo.mutate('todas')}>Todas</BotaoEscopo>
            <button
              onClick={() => setConfirmandoParcelamento(false)}
              className="px-2 text-xs text-slate-500"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function BotaoEscopo({ children, aoClicar }: { children: React.ReactNode; aoClicar: () => void }) {
  return (
    <button
      onClick={aoClicar}
      className="rounded-lg border border-borda-forte px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-400"
    >
      {children}
    </button>
  );
}

/**
 * Marcador de estado do lançamento.
 *
 *   relógio — data futura. Já está gravado, mas ainda não aconteceu: é parcela
 *             ou recorrência à frente, e por isso não entra no saldo de hoje
 *             (§13.2).
 *   confere — aconteceu e está confirmado.
 *   ponto   — aconteceu mas não foi revisado: veio de importação ou de
 *             recorrência de valor que oscila, e o número ainda pode estar
 *             errado. É o único dos três que pede alguma coisa de você.
 */
function Marcador({ futura, revisado }: { futura: boolean; revisado: boolean }) {
  if (futura) {
    return (
      <span title="Previsto: já está lançado, mas ainda não aconteceu" className="mt-0.5 text-sky-400/80">
        <IconeRelogio className="h-4 w-4" />
      </span>
    );
  }

  if (revisado) {
    return (
      <span title="Confirmado" className="mt-0.5 text-emerald-500/70">
        <IconeConfere className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span
      title="Ainda não revisado: veio de importação ou de recorrência de valor variável"
      className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
    />
  );
}
