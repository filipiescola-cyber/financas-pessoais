import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatarBR, type DataISO } from '../dominio/datas';
import type { Centavos } from '../dominio/dinheiro';
import { BottomSheet } from '../ui/BottomSheet';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { usarCartoes } from '../dados/usarCartoes';
import { usarContas } from '../dados/usarContas';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import {
  atualizarParcelamento,
  atualizarTransacao,
  excluirParcelamento,
  excluirTransacao,
  type EscopoDeParcelamento,
  type Transacao,
} from '../dados/transacoes';
import { ConfirmacaoDeExclusao } from '../ui/ConfirmacaoDeExclusao';

/**
 * Edição de lançamento. Abre na mesma folha de baixo do lançamento rápido —
 * não existe página nova neste app (§14).
 *
 * Em parcelamento, editar oferece os mesmos três escopos da exclusão (§2.2):
 * corrigir o valor de uma parcela e o das futuras é caso comum; alterar as 12
 * sem perguntar seria destrutivo e silencioso.
 */
export function EditarTransacao({
  transacao,
  aoFechar,
}: {
  transacao: Transacao | null;
  aoFechar: () => void;
}) {
  if (!transacao) return null;
  return <Formulario transacao={transacao} aoFechar={aoFechar} />;
}

function Formulario({ transacao, aoFechar }: { transacao: Transacao; aoFechar: () => void }) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas();
  const cartoes = usarCartoes();
  const categorias = usarCategorias();

  const [valor, setValor] = useState<Centavos>(Math.abs(transacao.valor));
  const [categoriaId, setCategoriaId] = useState<string | null>(transacao.categoriaId);
  const [descricao, setDescricao] = useState(transacao.descricao ?? '');
  const [data, setData] = useState<DataISO>(transacao.dataCompetencia);
  const [escopo, setEscopo] = useState<EscopoDeParcelamento>('esta');
  const [excluindo, setExcluindo] = useState(false);

  const ehParcelado = transacao.grupoParcelamentoId !== null;
  const ehTransferencia = transacao.tipo === 'transferencia';
  const cartao = cartoes.data?.find((c) => c.contaId === transacao.contaId) ?? null;

  const doTipo = (categorias.data ?? []).filter(
    (c) => c.tipo === (transacao.tipo === 'receita' ? 'receita' : 'despesa'),
  );
  const conta = contas.data?.find((c) => c.id === transacao.contaId);

  const salvar = useMutation({
    mutationFn: async () => {
      if (ehParcelado && escopo !== 'esta') {
        await atualizarParcelamento(
          transacao.grupoParcelamentoId!,
          escopo,
          transacao.dataCompetencia,
          { valor, categoriaId, descricao },
          transacao.tipo,
        );
        return;
      }
      await atualizarTransacao(transacao, { valor, categoriaId, descricao, data }, cartao);
    },
    onSuccess: async () => {
      await invalidar();
      mostrar('Lançamento atualizado.');
      aoFechar();
    },
  });

  /**
   * Excluir daqui de dentro (§2.2, §5.4).
   *
   * Da lista de Lançamentos dá para excluir pela própria linha; da fatura, a
   * única porta é esta folha — e ela só sabia editar. Quem lançou a compra
   * errada no cartão ficava sem saída, ou pior: mudava o valor para zero, que
   * deixa uma linha morta na fatura para sempre.
   *
   * Em parcelamento vale o MESMO escopo já escolhido acima. Apagar as 12
   * parcelas quando se queria corrigir uma é destrutivo e silencioso — é a
   * regra do §2.2, e ela não muda por a exclusão ter mudado de lugar.
   */
  const excluir = useMutation({
    mutationFn: async () => {
      if (ehParcelado && escopo !== 'esta') {
        await excluirParcelamento(
          transacao.grupoParcelamentoId!,
          escopo,
          transacao.dataCompetencia,
        );
        return;
      }
      await excluirTransacao(transacao);
    },
    onSuccess: async () => {
      await invalidar();
      mostrar('Lançamento excluído.');
      aoFechar();
    },
  });

  const oQueSome = ehParcelado
    ? escopo === 'esta'
      ? `Some só a parcela ${transacao.parcelaNum} de ${transacao.parcelaTotal}. As outras ficam.`
      : escopo === 'esta-e-futuras'
        ? 'Somem esta parcela e todas as futuras. As já pagas ficam.'
        : `Somem as ${transacao.parcelaTotal} parcelas, inclusive as já pagas.`
    : ehTransferencia
      ? 'Some das duas contas ao mesmo tempo: deixar uma ponta sozinha desequilibraria dois saldos.'
      : cartao
        ? 'Some da fatura, e o total dela cai.'
        : 'O saldo da conta volta ao que era antes deste lançamento.';

  return (
    <BottomSheet aberto aoFechar={aoFechar}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-slate-100">Editar lançamento</h2>
          <p className="text-xs text-slate-500">
            {conta?.nome ?? '—'} · {formatarBR(transacao.dataCompetencia)}
            {ehParcelado && ` · parcela ${transacao.parcelaNum} de ${transacao.parcelaTotal}`}
          </p>
        </div>

        <CampoValor valor={valor} aoMudar={setValor} autoFocus />

        {!ehTransferencia && (
          <div>
            <span className="text-sm text-slate-400">Categoria</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {doTipo.map((categoria) => (
                <button
                  key={categoria.id}
                  onClick={() =>
                    setCategoriaId(categoriaId === categoria.id ? null : categoria.id)
                  }
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    categoriaId === categoria.id
                      ? 'bg-emerald-600 text-white'
                      : 'border border-borda-forte text-slate-300'
                  }`}
                >
                  {categoria.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {(!ehParcelado || escopo === 'esta') && (
          <div>
            <label className="mb-1 block text-sm text-slate-400">Data</label>
            <input
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className="rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-200 outline-none focus:border-slate-500"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-slate-400">Descrição</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </div>

        {ehParcelado && (
          <div>
            <span className="text-sm text-slate-400">Aplicar em</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['esta', 'Só esta'],
                  ['esta-e-futuras', 'Esta e as futuras'],
                  ['todas', 'Todas'],
                ] as const
              ).map(([valorEscopo, rotulo]) => (
                <button
                  key={valorEscopo}
                  onClick={() => setEscopo(valorEscopo)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    escopo === valorEscopo
                      ? 'bg-slate-700 text-slate-100'
                      : 'border border-borda-forte text-slate-300'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            {escopo !== 'esta' && (
              <p className="mt-2 text-xs text-slate-500">
                A data não é alterada em lote: cada parcela tem a sua, e igualar todas destruiria o
                parcelamento.
              </p>
            )}
          </div>
        )}

        {ehTransferencia && (
          <p className="rounded-md border border-borda-forte px-3 py-2 text-xs text-slate-400">
            Transferência tem duas pontas ligadas. Valor, data e descrição são alterados nas duas ao
            mesmo tempo, senão os dois saldos ficam errados.
          </p>
        )}

        {salvar.isError && <p className="text-sm text-red-400">{(salvar.error as Error).message}</p>}

        {excluindo ? (
          <ConfirmacaoDeExclusao
            consequencia={oQueSome}
            emAndamento={excluir.isPending}
            erro={excluir.isError ? (excluir.error as Error).message : null}
            aoConfirmar={() => excluir.mutate()}
            aoCancelar={() => setExcluindo(false)}
          />
        ) : (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => salvar.mutate()}
                disabled={valor <= 0 || salvar.isPending}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
              >
                {salvar.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={aoFechar}
                className="rounded-lg border border-borda-forte px-4 py-3 text-sm text-slate-300"
              >
                Cancelar
              </button>
            </div>

            <button
              onClick={() => setExcluindo(true)}
              className="w-full text-center text-xs text-slate-500 transition hover:text-red-400"
            >
              Excluir lançamento
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
