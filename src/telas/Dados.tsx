import { useState } from 'react';
import {
  baixarArquivo,
  exportarTudo,
  nomeDoArquivo,
  paraCSV,
  TABELAS,
  type Exportacao,
} from '../dados/exportar';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recomecarDoZero } from '../dados/reiniciar';
import { usarAviso } from '../ui/Aviso';
import { Pagina } from '../ui/base';

/**
 * Backup e export (§10.2). Um botão, baixa tudo.
 *
 * Não é conveniência: é o que permite rodar migration destrutiva em banco com
 * dado real sem apostar. O §13.6 exige exportar antes de qualquer uma delas — e
 * a primeira já está marcada, no backfill que abre a Fase 2.
 */
export function Dados() {
  const { mostrar } = usarAviso();
  const [exportando, setExportando] = useState(false);
  const [ultimo, setUltimo] = useState<Exportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function baixarJSON() {
    setExportando(true);
    setErro(null);
    try {
      const dados = await exportarTudo();
      baixarArquivo(nomeDoArquivo('json'), JSON.stringify(dados, null, 2), 'application/json');
      setUltimo(dados);
      mostrar('Export concluído.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  async function baixarCSVs() {
    setExportando(true);
    setErro(null);
    try {
      const dados = ultimo ?? (await exportarTudo());
      setUltimo(dados);
      let baixados = 0;
      for (const tabela of TABELAS) {
        const linhas = dados.tabelas[tabela] ?? [];
        if (linhas.length === 0) continue;
        baixarArquivo(nomeDoArquivo('csv', tabela), paraCSV(linhas), 'text/csv;charset=utf-8');
        baixados += 1;
      }
      mostrar(`${baixados} arquivo(s) CSV baixado(s).`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const totalLinhas = ultimo
    ? Object.values(ultimo.contagem).reduce((soma, n) => soma + n, 0)
    : null;

  return (
    <Pagina titulo="Dados" subtitulo="Backup e exportação">

      <section className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <div>
          <h2 className="text-slate-100">Export completo em JSON</h2>
          <p className="mt-1 text-sm text-slate-400">
            Todas as {TABELAS.length} tabelas, inclusive as que ainda não são usadas. É o formato
            que serve para restaurar.
          </p>
        </div>
        <button
          onClick={() => void baixarJSON()}
          disabled={exportando}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Baixar JSON'}
        </button>
      </section>

      <section className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
        <div>
          <h2 className="text-slate-100">Export em CSV por tabela</h2>
          <p className="mt-1 text-sm text-slate-400">
            Um arquivo por tabela com conteúdo, separado por ponto e vírgula. Serve para abrir no
            Excel ou migrar para outro app um dia — não para restaurar.
          </p>
        </div>
        <button
          onClick={() => void baixarCSVs()}
          disabled={exportando}
          className="rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
        >
          Baixar CSVs
        </button>
        <p className="text-xs text-slate-500">
          O navegador vai pedir permissão para baixar vários arquivos de uma vez.
        </p>
      </section>

      {erro && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {erro}
        </p>
      )}

      {ultimo && (
        <section className="rounded-xl border border-borda bg-superficie p-4">
          <h2 className="text-sm text-slate-400">Último export desta sessão</h2>
          <p className="mt-1 text-xs text-slate-500">
            {totalLinhas} linha(s) no total. Tabelas com conteúdo:
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-slate-400">
            {Object.entries(ultimo.contagem)
              .filter(([, quantidade]) => quantidade > 0)
              .map(([tabela, quantidade]) => (
                <li key={tabela} className="flex justify-between">
                  <span>{tabela}</span>
                  <span className="text-slate-500">{quantidade}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <Recomecar exportouNestaSessao={ultimo !== null} />

      <section className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
        <h2 className="text-sm font-medium text-amber-200">Backup nunca restaurado não é backup</h2>
        <p className="mt-1 text-xs text-amber-200/80">
          O §10.2 pede para testar o restore pelo menos uma vez. Vale fazer isso enquanto o banco
          ainda está quase vazio: crie um projeto Supabase descartável, aplique as migrations e
          suba o JSON. Testar depois de um ano de histórico é tarde para descobrir que faltava algo.
        </p>
      </section>
    </Pagina>
  );
}

/**
 * Recomeçar do zero.
 *
 * Duas travas, e nenhuma delas é decoração:
 *
 *   O export é OBRIGATÓRIO antes. O §13.6 manda exportar antes de qualquer
 *   operação destrutiva, e esta é a mais destrutiva do app. O botão só habilita
 *   depois que um backup foi baixado nesta sessão.
 *
 *   A confirmação é digitada, não clicada. Diálogo de "tem certeza?" a gente
 *   fecha no automático; digitar a frase exige ler o que está escrito.
 */
function Recomecar({ exportouNestaSessao }: { exportouNestaSessao: boolean }) {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const { mostrar } = usarAviso();

  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const FRASE = 'apagar tudo';
  const confirmado = confirmacao.trim().toLowerCase() === FRASE;

  const apagar = useMutation({
    mutationFn: recomecarDoZero,
    onSuccess: async () => {
      await cliente.invalidateQueries();
      mostrar('Tudo apagado. O onboarding recomeça do primeiro passo.');
      navegar('/comecar');
    },
  });

  return (
    <section className="rounded-xl border border-red-900/40 bg-red-950/15 p-4">
      <h2 className="text-sm font-medium text-red-200">Recomeçar do zero</h2>
      <p className="mt-1 text-xs leading-relaxed text-red-200/70">
        Apaga contas, cartões, faturas, lançamentos, recorrências, modelos, orçamentos, metas,
        investimentos e importações. As categorias, a tabela de IR, os feriados e as taxas
        continuam — são referência, e recriar as 25 categorias na mão seria um castigo
        desproporcional.
      </p>

      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="mt-3 rounded-lg border border-red-900/60 px-4 py-2 text-sm text-red-200 transition hover:border-red-700"
        >
          Recomeçar do zero
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
          {!exportouNestaSessao ? (
            <p className="text-xs leading-relaxed text-red-200">
              Baixe o backup em JSON primeiro, aqui em cima. Não é formalidade: depois disto não há
              como voltar, e um arquivo de dois cliques é a diferença entre "recomecei" e "perdi
              tudo".
            </p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-red-200/80">
                Backup baixado nesta sessão. Para confirmar, digite{' '}
                <strong className="text-red-200">{FRASE}</strong> abaixo.
              </p>
              <input
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder={FRASE}
                autoComplete="off"
                className="w-full rounded-lg border border-red-900/60 bg-superficie px-3 py-2 text-slate-100 outline-none placeholder:text-red-200/30 focus:border-red-700"
              />
            </>
          )}

          {apagar.isError && (
            <p className="text-xs text-red-300">{(apagar.error as Error).message}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => apagar.mutate()}
              disabled={!exportouNestaSessao || !confirmado || apagar.isPending}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-40"
            >
              {apagar.isPending ? 'Apagando…' : 'Apagar tudo, sem volta'}
            </button>
            <button
              onClick={() => {
                setAberto(false);
                setConfirmacao('');
              }}
              className="rounded-lg border border-borda-forte px-4 py-2 text-sm text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
