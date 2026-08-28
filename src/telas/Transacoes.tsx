import { useState } from 'react';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  excluirParcelamento,
  excluirTransacao,
  type EscopoDeParcelamento,
  type Transacao,
} from '../dados/transacoes';
import { chaves } from '../dados/chaves';
import { usarAviso } from '../ui/Aviso';

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

  const contas = usarContas();
  const categorias = usarCategorias(true);
  const transacoes = usarTransacoes({
    de: mes,
    ate: ultimoDiaDoMes(mes),
    contaId,
  });

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const lista = transacoes.data ?? [];

  // Fixa, variável e eventual nunca viram um total único (§14). Aqui, no
  // mínimo, receita e despesa ficam separadas — e transferência fora das duas.
  const receitas = lista.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const despesas = lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <button
          onClick={() => setMes(somarMeses(mes, -1))}
          className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300"
        >
          ‹
        </button>
        <h1 className="text-lg font-medium text-slate-100">{nomeDoMes(mes)}</h1>
        <button
          onClick={() => setMes(somarMeses(mes, 1))}
          className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300"
        >
          ›
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-500">Entrou</p>
          <p className="text-lg text-slate-100">{formatar(receitas)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-500">Saiu</p>
          <p className="text-lg text-slate-100">{formatar(Math.abs(despesas))}</p>
        </div>
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

      {transacoes.isPending && <p className="text-slate-400">Carregando…</p>}
      {transacoes.isError && (
        <p className="text-red-400">Erro: {(transacoes.error as Error).message}</p>
      )}

      {transacoes.isSuccess && lista.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <p className="text-slate-300">Nenhum lançamento em {nomeDoMes(mes)}.</p>
          <p className="mt-2 text-sm text-slate-500">
            Use o botão + para lançar. Ele está visível em todas as telas.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {lista.map((transacao) => (
          <ItemDeTransacao
            key={transacao.id}
            transacao={transacao}
            nomeConta={nomeConta.get(transacao.contaId) ?? '—'}
            nomeCategoria={
              transacao.categoriaId ? (nomeCategoria.get(transacao.categoriaId) ?? null) : null
            }
          />
        ))}
      </ul>
    </div>
  );
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
      className={`rounded-full px-3 py-1 text-xs ${
        ativo ? 'bg-slate-700 text-slate-100' : 'border border-slate-800 text-slate-400'
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
}: {
  transacao: Transacao;
  nomeConta: string;
  nomeCategoria: string | null;
}) {
  const [confirmandoParcelamento, setConfirmandoParcelamento] = useState(false);
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const invalidar = async () => {
    await cliente.invalidateQueries({ queryKey: ['transacoes'] });
    await cliente.invalidateQueries({ queryKey: chaves.contas.todas });
  };

  const excluir = useMutation({
    mutationFn: () => excluirTransacao(transacao),
    onSuccess: async () => {
      await invalidar();
      mostrar('Lançamento excluído.');
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
    <li className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-slate-100">
            {transacao.descricao || nomeCategoria || (ehTransferencia ? 'Transferência' : 'Sem descrição')}
          </p>
          <p className="truncate text-xs text-slate-500">
            {formatarBR(transacao.dataCompetencia)} · {nomeConta}
            {nomeCategoria && ` · ${nomeCategoria}`}
            {ehParcelado && ` · ${transacao.parcelaNum}/${transacao.parcelaTotal}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ehTransferencia && (
              <Etiqueta titulo="Não conta como receita nem como despesa (§2.3)">
                transferência
              </Etiqueta>
            )}
            {transacao.motivoEmpresa && <Etiqueta>{transacao.motivoEmpresa}</Etiqueta>}
            {futura && <Etiqueta titulo="Já está no banco, mas ainda não entrou no saldo">futura</Etiqueta>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={
              ehTransferencia
                ? 'text-slate-400'
                : transacao.valor < 0
                  ? 'text-slate-100'
                  : 'text-emerald-400'
            }
          >
            {formatar(transacao.valor)}
          </span>
          <button
            onClick={() =>
              ehParcelado ? setConfirmandoParcelamento(true) : excluir.mutate()
            }
            disabled={excluir.isPending}
            className="text-xs text-slate-500 hover:text-red-400"
          >
            excluir
          </button>
        </div>
      </div>

      {confirmandoParcelamento && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
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

function Etiqueta({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500"
    >
      {children}
    </span>
  );
}

function BotaoEscopo({ children, aoClicar }: { children: React.ReactNode; aoClicar: () => void }) {
  return (
    <button
      onClick={aoClicar}
      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400"
    >
      {children}
    </button>
  );
}
