import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, somarDias } from '../dominio/datas';
import { formatar } from '../dominio/dinheiro';
import { analisarOFX, ErroDeOFX, removerDuplicadasDoArquivo, type ExtratoOFX } from '../import/ofx';
import {
  EXPLICACAO_SITUACAO,
  montarPreview,
  resumirPreview,
  ROTULO_SITUACAO,
  type LinhaDoPreview,
} from '../import/conciliacao';
import {
  candidatosAConciliacao,
  desfazerImportacao,
  fitidsExistentes,
  importarLote,
  listarImportacoes,
} from '../dados/importacao';
import { memoriaCompleta } from '../dados/modelos';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarContas } from '../dados/usarContas';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarAviso } from '../ui/Aviso';
import { ALVO_DE_TOQUE, Botao, Cartao, Chip, Dinheiro, Nota, Pagina, Secao, Vazio } from '../ui/base';

type Etapa = 'escolher' | 'preview';

/**
 * Importação de extrato (§6).
 *
 * "Melhor custo-benefício do projeto: elimina a maior parte da digitação sem
 * custo, sem API e sem entregar credencial bancária a ninguém."
 *
 * O arquivo é lido no navegador e não sai daqui. Nada entra no banco sem passar
 * pelo preview, e todo lote pode ser desfeito (§6.5).
 */
export function Importar() {
  const contas = usarContas();
  const categorias = usarCategorias();
  const cliente = useQueryClient();
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const entradaDeArquivo = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [contaId, setContaId] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [extrato, setExtrato] = useState<ExtratoOFX | null>(null);
  const [linhas, setLinhas] = useState<LinhaDoPreview[]>([]);
  const [categoriaPorFitid, setCategoriaPorFitid] = useState<Record<string, string | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);

  // Conta corrente, poupança e carteira. Fatura de cartão é sub-etapa posterior
  // do §6.6 — importar fatura na conta errada é o erro mais chato de desfazer.
  const elegiveis = (contas.data ?? []).filter((c) =>
    ['corrente', 'poupanca', 'investimento'].includes(c.tipo),
  );

  async function aoEscolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo || contaId === null) return;

    setErro(null);
    setAnalisando(true);

    try {
      // Banco antigo ainda emite Latin-1. Ler como UTF-8 estragaria acentos, e
      // descrição estragada polui a memória de autocomplete.
      const bruto = await arquivo.arrayBuffer();
      const texto = decodificar(bruto);

      const lido = analisarOFX(texto);
      const { unicas, removidas } = removerDuplicadasDoArquivo(lido.transacoes);
      if (removidas > 0) {
        mostrar(`${removidas} linha(s) repetida(s) dentro do próprio arquivo foram ignoradas.`);
      }

      const [jaImportados, manuais] = await Promise.all([
        fitidsExistentes(contaId),
        candidatosAConciliacao(
          contaId,
          somarDias(lido.periodoInicio ?? '2000-01-01', -5),
          somarDias(lido.periodoFim ?? '2100-01-01', 5),
        ),
      ]);

      // Categorização automática pela memória de descrição (§6.5). Sem match,
      // fica sem categoria — nunca chutar.
      //
      // A memória inteira vem numa consulta só: um extrato tem dezenas de
      // descrições distintas, e uma consulta por linha faria o preview demorar
      // mais que o próprio download do arquivo.
      const memoria = await memoriaCompleta();
      const porPrefixo = (descricao: string) =>
        memoria.find((m) => m.descricao.toLowerCase() === descricao.toLowerCase())
          ?.categoriaId ??
        memoria.find((m) => descricao.toLowerCase().startsWith(m.descricao.toLowerCase()))
          ?.categoriaId ??
        null;

      const preview = montarPreview(unicas, jaImportados, manuais, porPrefixo);

      setExtrato({ ...lido, transacoes: unicas });
      setLinhas(preview);
      setCategoriaPorFitid(
        Object.fromEntries(preview.map((l) => [l.transacao.fitid, l.categoriaSugeridaId])),
      );
      setNomeArquivo(arquivo.name);
      setEtapa('preview');
    } catch (e) {
      setErro(e instanceof ErroDeOFX ? e.message : `Falha ao ler o arquivo: ${(e as Error).message}`);
    } finally {
      setAnalisando(false);
      if (entradaDeArquivo.current) entradaDeArquivo.current.value = '';
    }
  }

  const importar = useMutation({
    mutationFn: () =>
      importarLote({
        contaId: contaId!,
        nomeArquivo,
        periodoInicio: extrato?.periodoInicio ?? null,
        periodoFim: extrato?.periodoFim ?? null,
        linhas,
        categoriaPorFitid,
      }),
    onSuccess: async (resultado) => {
      await invalidar();
      await cliente.invalidateQueries({ queryKey: ['importacoes'] });
      mostrar(
        `${resultado.criadas} novo(s), ${resultado.conciliadas} conciliado(s). Dá para desfazer no histórico.`,
      );
      voltar();
    },
  });

  function voltar() {
    setEtapa('escolher');
    setExtrato(null);
    setLinhas([]);
    setCategoriaPorFitid({});
    setNomeArquivo('');
  }

  const resumo = resumirPreview(linhas);
  const doTipoDespesa = (categorias.data ?? []).filter((c) => c.tipo === 'despesa');
  const doTipoReceita = (categorias.data ?? []).filter((c) => c.tipo === 'receita');

  if (etapa === 'preview') {
    return (
      <Pagina
        titulo="Conferir antes de importar"
        subtitulo={nomeArquivo}
        acao={
          <Botao tipo="secundario" aoClicar={voltar}>
            Cancelar
          </Botao>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Resumo rotulo="Novas" valor={resumo.novas} />
          <Resumo rotulo="Já lançadas" valor={resumo.conciliadas} />
          <Resumo rotulo="Já importadas" valor={resumo.duplicadas} />
          <Resumo rotulo="Para revisar" valor={resumo.ambiguas} destaque={resumo.ambiguas > 0} />
        </div>

        {resumo.ambiguas > 0 && (
          <Nota tom="atencao">
            {resumo.ambiguas} linha(s) casaram com mais de um lançamento seu. O app não escolhe
            sozinho: confira e marque manualmente o que deve entrar.
          </Nota>
        )}

        <Secao titulo={`${linhas.length} linha(s) no arquivo`}>
          <div className="space-y-2">
            {linhas.map((linha) => (
              <LinhaDoArquivo
                key={linha.transacao.fitid}
                linha={linha}
                categoriaId={categoriaPorFitid[linha.transacao.fitid] ?? null}
                categorias={linha.transacao.valor >= 0 ? doTipoReceita : doTipoDespesa}
                aoAlternar={() =>
                  setLinhas((atual) =>
                    atual.map((l) =>
                      l.transacao.fitid === linha.transacao.fitid
                        ? { ...l, importar: !l.importar }
                        : l,
                    ),
                  )
                }
                aoMudarCategoria={(id) =>
                  setCategoriaPorFitid((atual) => ({ ...atual, [linha.transacao.fitid]: id }))
                }
              />
            ))}
          </div>
        </Secao>

        {importar.isError && (
          <p className="text-sm text-red-400">{(importar.error as Error).message}</p>
        )}

        <div className="sticky bottom-24 flex gap-2 md:bottom-8">
          <Botao
            aoClicar={() => importar.mutate()}
            desabilitado={resumo.aImportar === 0 || importar.isPending}
            className="flex-1 py-3"
          >
            {importar.isPending ? 'Importando…' : `Importar ${resumo.aImportar} linha(s)`}
          </Botao>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina titulo="Importar extrato" subtitulo="OFX de conta corrente">
      <Nota>
        O arquivo é lido aqui no seu navegador e não sai do aparelho. Baixe o extrato pela opção
        "Exportar" ou "Salvar" do internet banking — não é preciso entregar senha de banco a
        ninguém.
      </Nota>

      {elegiveis.length === 0 ? (
        <Vazio
          titulo="Nenhuma conta elegível"
          descricao="A importação começa por conta corrente, poupança e investimento. Fatura de cartão vem depois."
        />
      ) : (
        <>
          <Secao titulo="1. Para qual conta">
            <div className="flex flex-wrap gap-2">
              {elegiveis.map((conta) => (
                <Chip key={conta.id} ativo={contaId === conta.id} aoClicar={() => setContaId(conta.id)}>
                  {conta.nome}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Sempre explícito: importar na conta errada é o erro mais comum e o mais chato de
              desfazer.
            </p>
          </Secao>

          <Secao titulo="2. O arquivo">
            <input
              ref={entradaDeArquivo}
              type="file"
              accept=".ofx,.OFX,text/plain"
              onChange={(e) => void aoEscolherArquivo(e)}
              disabled={contaId === null || analisando}
              className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white disabled:opacity-40"
            />
            {contaId === null && (
              <p className="text-xs text-slate-500">Escolha a conta antes de selecionar o arquivo.</p>
            )}
            {analisando && <p className="text-sm text-slate-400">Lendo o arquivo…</p>}
            {erro && (
              <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {erro}
              </p>
            )}
          </Secao>
        </>
      )}

      <Historico />
    </Pagina>
  );
}

/** Latin-1 é comum em banco antigo; UTF-8 no resto. O BOM decide. */
function decodificar(bruto: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bruto);
  // O caractere de substituição indica bytes que não são UTF-8 válido.
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bruto) : utf8;
}

function Resumo({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{rotulo}</p>
      <p className={`numero mt-1 text-2xl font-semibold ${destaque ? 'text-amber-400' : 'text-slate-100'}`}>
        {valor}
      </p>
    </div>
  );
}

function LinhaDoArquivo({
  linha,
  categoriaId,
  categorias,
  aoAlternar,
  aoMudarCategoria,
}: {
  linha: LinhaDoPreview;
  categoriaId: string | null;
  categorias: { id: string; nome: string }[];
  aoAlternar: () => void;
  aoMudarCategoria: (id: string | null) => void;
}) {
  const [mostrandoCategorias, setMostrandoCategorias] = useState(false);
  const cor = {
    nova: 'text-emerald-400',
    conciliada: 'text-sky-400',
    duplicada: 'text-slate-600',
    ambigua: 'text-amber-400',
  }[linha.situacao];

  return (
    <Cartao className={`p-3 ${linha.importar ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={linha.importar}
          onChange={aoAlternar}
          disabled={linha.situacao === 'duplicada'}
          className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm text-slate-100">
              {linha.transacao.descricao || 'Sem descrição'}
            </p>
            <Dinheiro
              centavos={linha.transacao.valor}
              className={`shrink-0 text-sm ${
                linha.transacao.valor >= 0 ? 'text-emerald-400' : 'text-slate-200'
              }`}
            />
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            {formatarBR(linha.transacao.data)} · <span className={cor}>{ROTULO_SITUACAO[linha.situacao]}</span>
          </p>

          {linha.situacao !== 'nova' && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {EXPLICACAO_SITUACAO[linha.situacao]}
            </p>
          )}

          {linha.situacao === 'ambigua' && (
            <ul className="mt-1 space-y-0.5">
              {linha.candidatas.map((candidata) => (
                <li key={candidata.id} className="text-xs text-slate-500">
                  · {formatarBR(candidata.dataCaixa)} — {candidata.descricao || 'sem descrição'}{' '}
                  {formatar(candidata.valor)}
                </li>
              ))}
            </ul>
          )}

          {linha.situacao === 'nova' && (
            <div className="mt-2">
              {mostrandoCategorias ? (
                <div className="flex flex-wrap gap-1.5">
                  {categorias.map((categoria) => (
                    <button
                      key={categoria.id}
                      onClick={() => {
                        aoMudarCategoria(categoriaId === categoria.id ? null : categoria.id);
                        setMostrandoCategorias(false);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs transition ${
                        categoriaId === categoria.id
                          ? 'bg-emerald-600 text-white'
                          : 'border border-borda text-slate-400'
                      }`}
                    >
                      {categoria.nome}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setMostrandoCategorias(true)}
                  className={`text-xs text-emerald-400 hover:text-emerald-300 ${ALVO_DE_TOQUE}`}
                >
                  {categoriaId
                    ? categorias.find((c) => c.id === categoriaId)?.nome
                    : 'escolher categoria'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}

function Historico() {
  const cliente = useQueryClient();
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const contas = usarContas(true);
  const importacoes = useQuery({ queryKey: ['importacoes'], queryFn: listarImportacoes });

  const desfazer = useMutation({
    mutationFn: desfazerImportacao,
    onSuccess: async (quantidade) => {
      await invalidar();
      await cliente.invalidateQueries({ queryKey: ['importacoes'] });
      mostrar(`Importação desfeita: ${quantidade} lançamento(s) revertido(s).`);
    },
  });

  const lista = importacoes.data ?? [];
  if (lista.length === 0) return null;

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));

  return (
    <Secao titulo="Importações anteriores">
      <Cartao>
        <ul className="divide-y divide-borda">
          {lista.map((importacao) => (
            <li key={importacao.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">{importacao.nomeArquivo}</p>
                <p className="text-xs text-slate-500">
                  {nomeConta.get(importacao.contaId) ?? '—'} ·{' '}
                  {importacao.importadas} nova(s), {importacao.conciliadas} conciliada(s),{' '}
                  {importacao.ignoradasDuplicadas} ignorada(s)
                </p>
                {importacao.periodoInicio && importacao.periodoFim && (
                  <p className="text-xs text-slate-600">
                    {formatarBR(importacao.periodoInicio)} a {formatarBR(importacao.periodoFim)}
                  </p>
                )}
              </div>
              <button
                onClick={() => desfazer.mutate(importacao.id)}
                disabled={desfazer.isPending}
                className={`shrink-0 text-xs text-slate-600 transition hover:text-red-400 ${ALVO_DE_TOQUE}`}
              >
                Desfazer
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
      <p className="text-xs leading-relaxed text-slate-600">
        Desfazer apaga os lançamentos criados pelo lote e devolve os conciliados ao estado de
        antes, prontos para casar de novo numa importação futura.
      </p>
    </Secao>
  );
}
