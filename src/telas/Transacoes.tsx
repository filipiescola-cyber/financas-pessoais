import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  duplicarTransacao,
  excluirParcelamento,
  excluirTransacao,
  excluirTransacoes,
  type EscopoDeParcelamento,
  type Transacao,
} from '../dados/transacoes';
import { usarCartoes } from '../dados/usarCartoes';
import { chaves } from '../dados/chaves';
import { usarAviso } from '../ui/Aviso';
import { Botao, Cartao, CartaoIndicador, Dinheiro, Etiqueta, Pagina, Secao, Vazio } from '../ui/base';
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

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const lista = transacoes.data ?? [];

  // Receita e despesa nunca viram um total único (§14). Transferência fica fora
  // das duas: ela só move saldo.
  const receitas = lista.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const despesas = lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

  const porDia = agruparPorDia(lista);

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

      {porDia.map(([dia, doDia]) => (
        <Secao key={dia} titulo={formatarBR(dia)}>
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
  const cliente = useQueryClient();
  const cartoes = usarCartoes();
  const { mostrar } = usarAviso();

  const invalidar = async () => {
    await cliente.invalidateQueries({ queryKey: ['transacoes'] });
    await cliente.invalidateQueries({ queryKey: chaves.contas.todas });
    await cliente.invalidateQueries({ queryKey: ['faturas'] });
  };

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
          {(ehTransferencia || transacao.motivoEmpresa || futura) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ehTransferencia && (
                <Etiqueta titulo="Não conta como receita nem como despesa">transferência</Etiqueta>
              )}
              {transacao.motivoEmpresa && <Etiqueta>{transacao.motivoEmpresa}</Etiqueta>}
              {futura && (
                <Etiqueta titulo="Já está no banco, mas ainda não entrou no saldo">futura</Etiqueta>
              )}
            </div>
          )}
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
