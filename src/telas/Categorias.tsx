import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ROTULOS, type Natureza } from '../dominio/natureza';
import { arquivarCategoria, atualizarCategoria, criarCategoria } from '../dados/categorias';
import { chaves } from '../dados/chaves';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarAviso } from '../ui/Aviso';
import type { TipoDeCategoria } from '../dados/tipos';

const NATUREZAS: (Natureza | null)[] = ['fixa', 'variavel', 'eventual', null];

/**
 * Categorias (§4.3). O conjunto padrão já veio no seed; aqui é ajuste fino.
 *
 * A natureza é o campo que importa: é ela que decide o custo de vida mínimo e o
 * que entra na projeção de renda (§2.5, §8.3). Categoria sem natureza some do
 * relatório certo, então ela aparece em destaque, não escondida numa edição.
 */
export function Categorias() {
  const [tipo, setTipo] = useState<TipoDeCategoria>('despesa');
  const [criando, setCriando] = useState(false);
  const categorias = usarCategorias();

  const lista = (categorias.data ?? []).filter((c) => c.tipo === tipo);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Categorias</h1>
        <button
          onClick={() => setCriando((v) => !v)}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {criando ? 'Cancelar' : 'Nova'}
        </button>
      </header>

      <div className="flex gap-1 rounded-lg bg-superficie-alta p-1">
        {(['despesa', 'receita'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm ${
              tipo === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400'
            }`}
          >
            {t === 'despesa' ? 'Despesa' : 'Receita'}
          </button>
        ))}
      </div>

      {criando && <FormularioCategoria tipo={tipo} aoTerminar={() => setCriando(false)} />}

      {tipo === 'receita' && (
        <p className="rounded-lg border border-borda px-4 py-3 text-xs text-slate-500">
          Só receita <strong>fixa</strong> e <strong>variável</strong> entram na projeção de renda.
          Eventual — venda de bem, reembolso, restituição — entra no caixa e fica de fora, para não
          distorcer a mediana (§2.7).
        </p>
      )}

      {categorias.isPending && <p className="text-slate-400">Carregando…</p>}

      <ul className="space-y-2">
        {lista.map((categoria) => (
          <LinhaCategoria key={categoria.id} categoria={categoria} />
        ))}
      </ul>
    </div>
  );
}

type CategoriaDaLista = {
  id: string;
  nome: string;
  natureza: Natureza | null;
  sistema: boolean;
  cor: string | null;
};

function LinhaCategoria({ categoria }: { categoria: CategoriaDaLista }) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const invalidar = () => cliente.invalidateQueries({ queryKey: chaves.categorias.todas });

  const atualizar = useMutation({
    mutationFn: (natureza: Natureza | null) => atualizarCategoria(categoria.id, { natureza }),
    onSuccess: invalidar,
  });

  const arquivar = useMutation({
    mutationFn: () => arquivarCategoria(categoria.id),
    onSuccess: invalidar,
    onError: (erro) => mostrar((erro as Error).message),
  });

  return (
    <li className="rounded-lg border border-borda bg-superficie px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {categoria.cor && (
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: categoria.cor }}
            />
          )}
          <span className="text-slate-100">{categoria.nome}</span>
          {categoria.sistema && (
            <span
              title="Categoria de sistema: usada pela conferência de saldo (§5.3)"
              className="rounded border border-borda-forte px-1.5 py-0.5 text-[10px] uppercase text-slate-500"
            >
              sistema
            </span>
          )}
        </div>
        {!categoria.sistema && (
          <button
            onClick={() => arquivar.mutate()}
            className="shrink-0 text-xs text-slate-500 hover:text-slate-300"
          >
            arquivar
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {NATUREZAS.map((natureza) => (
          <button
            key={natureza ?? 'indefinida'}
            onClick={() => atualizar.mutate(natureza)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              categoria.natureza === natureza
                ? 'bg-slate-700 text-slate-100'
                : 'border border-borda text-slate-500 hover:border-borda-forte'
            }`}
          >
            {natureza ? ROTULOS[natureza] : 'sem natureza'}
          </button>
        ))}
      </div>
    </li>
  );
}

function FormularioCategoria({
  tipo,
  aoTerminar,
}: {
  tipo: TipoDeCategoria;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const [nome, setNome] = useState('');
  const [natureza, setNatureza] = useState<Natureza | null>(
    tipo === 'despesa' ? 'variavel' : 'variavel',
  );

  const criar = useMutation({
    mutationFn: () => criarCategoria({ nome, tipo, natureza }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: chaves.categorias.todas });
      aoTerminar();
    },
  });

  return (
    <div className="space-y-3 rounded-xl border border-borda bg-superficie p-4">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da categoria"
        autoFocus
        className="w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {NATUREZAS.map((n) => (
          <button
            key={n ?? 'indefinida'}
            onClick={() => setNatureza(n)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              natureza === n
                ? 'bg-slate-700 text-slate-100'
                : 'border border-borda text-slate-500'
            }`}
          >
            {n ? ROTULOS[n] : 'sem natureza'}
          </button>
        ))}
      </div>
      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}
      <button
        onClick={() => criar.mutate()}
        disabled={nome.trim() === '' || criar.isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Salvar
      </button>
    </div>
  );
}
