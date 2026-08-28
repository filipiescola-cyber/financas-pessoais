import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatarBR, hoje, ontem, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { usarContas } from '../dados/usarContas';
import { usarCartoes } from '../dados/usarCartoes';
import { usarCategorias } from '../dados/usarTransacoes';
import { criarLancamento, excluirTransacoes } from '../dados/transacoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { Botao, Cartao, Chip, Nota, Pagina, Secao } from '../ui/base';

type Linha = {
  chave: number;
  valor: Centavos;
  categoriaId: string | null;
  data: DataISO;
};

function linhaVazia(data: DataISO): Linha {
  return { chave: Date.now() + Math.random(), valor: 0, categoriaId: null, data };
}

/**
 * Lançamento em lote (§5.2).
 *
 * Para quando o usuário ficou dias sem lançar e precisa colocar 10–15 de uma
 * vez. A folha de lançamento rápido é ótima para um gasto; para quinze, o
 * "salvar e novo" ainda cobra um ciclo de abrir e fechar por linha.
 *
 * Conta e tipo ficam no topo, escolhidos uma vez só — é o que a tabela tem de
 * diferente da folha: aqui o que varia é valor, categoria e dia.
 */
export function Lote() {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas();
  const cartoes = usarCartoes();
  const categorias = usarCategorias();

  const [contaId, setContaId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia(hoje())]);

  const disponiveis = (contas.data ?? []).filter((c) => c.tipo !== 'divida');
  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const cartao = cartoes.data?.find((c) => c.contaId === contaId) ?? null;

  useEffect(() => {
    if (contaId !== null || disponiveis.length === 0) return;
    const guardada = localStorage.getItem('ultima-conta');
    const existe = disponiveis.find((c) => c.id === guardada);
    setContaId(existe?.id ?? disponiveis[0]?.id ?? null);
  }, [disponiveis, contaId]);

  const preenchidas = linhas.filter((l) => l.valor > 0);
  const total = preenchidas.reduce((soma, l) => soma + l.valor, 0);

  const salvar = useMutation({
    mutationFn: async () => {
      const criados: string[] = [];
      for (const linha of preenchidas) {
        const ids = await criarLancamento({
          tipo,
          valor: linha.valor,
          contaId: contaId!,
          categoriaId: linha.categoriaId,
          data: linha.data,
          cartao,
        });
        criados.push(...ids);
      }
      return criados;
    },
    onSuccess: async (ids) => {
      await invalidar();

      // Undo cobre o lote inteiro: errar a conta com quinze linhas dentro é o
      // acidente mais caro desta tela.
      mostrar(`${ids.length} lançamento(s) salvos.`, {
        rotulo: 'Desfazer tudo',
        executar: () => {
          void excluirTransacoes(ids).then(invalidar);
        },
      });

      setLinhas([linhaVazia(hoje())]);
    },
  });

  function atualizar(chave: number, campos: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  return (
    <Pagina
      titulo="Lançamento em lote"
      subtitulo="Para colocar vários de uma vez"
      acao={
        <Botao
          aoClicar={() => salvar.mutate()}
          desabilitado={preenchidas.length === 0 || contaId === null || salvar.isPending}
        >
          {salvar.isPending ? 'Salvando…' : `Salvar ${preenchidas.length || ''}`}
        </Botao>
      }
    >
      <Secao titulo="Vale para todas as linhas">
        <Cartao className="space-y-4 p-4">
          <div>
            <span className="text-sm text-slate-400">Conta</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {disponiveis.map((conta) => (
                <Chip key={conta.id} ativo={contaId === conta.id} aoClicar={() => setContaId(conta.id)}>
                  {conta.nome}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm text-slate-400">Tipo</span>
            <div className="mt-2 flex gap-2">
              <Chip ativo={tipo === 'despesa'} aoClicar={() => setTipo('despesa')}>
                Despesa
              </Chip>
              <Chip ativo={tipo === 'receita'} aoClicar={() => setTipo('receita')}>
                Receita
              </Chip>
            </div>
          </div>
        </Cartao>
      </Secao>

      <Secao titulo={`Linhas (${preenchidas.length} preenchida(s))`}>
        <div className="space-y-3">
          {linhas.map((linha, indice) => (
            <Cartao key={linha.chave} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="numero mt-3 w-6 shrink-0 text-sm text-slate-600">
                  {indice + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <CampoValor
                    valor={linha.valor}
                    aoMudar={(v) => atualizar(linha.chave, { valor: v })}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Chip
                      ativo={linha.data === hoje()}
                      aoClicar={() => atualizar(linha.chave, { data: hoje() })}
                    >
                      Hoje
                    </Chip>
                    <Chip
                      ativo={linha.data === ontem()}
                      aoClicar={() => atualizar(linha.chave, { data: ontem() })}
                    >
                      Ontem
                    </Chip>
                    <input
                      type="date"
                      value={linha.data}
                      onChange={(e) =>
                        e.target.value && atualizar(linha.chave, { data: e.target.value })
                      }
                      className="rounded-lg border border-borda-forte bg-superficie-alta px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-600"
                    />
                    {linha.data !== hoje() && linha.data !== ontem() && (
                      <span className="self-center text-xs text-slate-500">
                        {formatarBR(linha.data)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {doTipo.map((categoria) => (
                      <button
                        key={categoria.id}
                        onClick={() =>
                          atualizar(linha.chave, {
                            categoriaId: linha.categoriaId === categoria.id ? null : categoria.id,
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-xs transition ${
                          linha.categoriaId === categoria.id
                            ? 'bg-emerald-600 text-white'
                            : 'border border-borda text-slate-400 hover:border-borda-forte'
                        }`}
                      >
                        {categoria.nome}
                      </button>
                    ))}
                  </div>
                </div>

                {linhas.length > 1 && (
                  <button
                    onClick={() =>
                      setLinhas((atual) => atual.filter((l) => l.chave !== linha.chave))
                    }
                    className="mt-3 shrink-0 text-xs text-slate-600 transition hover:text-red-400"
                  >
                    Remover
                  </button>
                )}
              </div>
            </Cartao>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Botao
            tipo="secundario"
            aoClicar={() =>
              setLinhas((atual) => [
                ...atual,
                // A data da última linha continua: dias em sequência são o caso comum.
                linhaVazia(atual[atual.length - 1]?.data ?? hoje()),
              ])
            }
          >
            + Adicionar linha
          </Botao>
          {total > 0 && (
            <span className="numero dinheiro text-sm text-slate-400">
              Total: {formatar(total)}
            </span>
          )}
        </div>
      </Secao>

      <Nota>
        Linha sem valor é ignorada ao salvar. Categoria é opcional aqui — mas lançamento sem
        categoria não aparece em relatório por categoria depois.
      </Nota>
    </Pagina>
  );
}
