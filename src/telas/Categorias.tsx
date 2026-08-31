import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULOS, type Natureza } from '../dominio/natureza';
import {
  arquivarCategoria,
  excluirCategoria,
  previaDaExclusao,
  atualizarCategoria,
  criarCategoria,
  desarquivarCategoria,
} from '../dados/categorias';
import { chaves } from '../dados/chaves';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarAviso } from '../ui/Aviso';
import { ALVO_DE_TOQUE, Botao, Cartao, Pagina, Secao } from '../ui/base';
import { EscolherIcone } from '../ui/EscolherIcone';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';
import { ConfirmacaoDeExclusao } from '../ui/ConfirmacaoDeExclusao';
import { usarAcaoDaPagina } from '../ui/AcaoDaPagina';
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

  // O "+" da tela abre esta ficha, não a folha de lançamento (§5.1).
  usarAcaoDaPagina('Nova categoria', () => setCriando(true));
  const categorias = usarCategorias(true);

  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const lista = doTipo.filter((c) => c.ativo);
  const arquivadas = doTipo.filter((c) => !c.ativo);

  return (
    <Pagina
      titulo="Categorias"
      subtitulo="A natureza decide em que bloco cada gasto aparece"
      acao={
        <Botao aoClicar={() => setCriando((v) => !v)} tipo={criando ? 'secundario' : 'primario'}>
          {criando ? 'Cancelar' : 'Nova'}
        </Botao>
      }
    >

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

      {/* Arquivar era mão única: a categoria sumia da tela e não havia por onde
          trazer de volta, mesmo com o histórico dela inteiro no banco. */}
      {arquivadas.length > 0 && (
        <Secao titulo="Arquivadas">
          <Cartao>
            <ul className="divide-y divide-borda">
              {arquivadas.map((categoria) => (
                <LinhaArquivada key={categoria.id} categoria={categoria} />
              ))}
            </ul>
          </Cartao>
          <p className="text-xs leading-relaxed text-slate-600">
            Categoria arquivada some dos seletores de lançamento, mas continua nos relatórios dos
            meses fechados — nada foi apagado.
          </p>
        </Secao>
      )}
    </Pagina>
  );
}

type CategoriaDaLista = {
  id: string;
  nome: string;
  natureza: Natureza | null;
  sistema: boolean;
  cor: string | null;
  icone: string | null;
};

function LinhaCategoria({ categoria }: { categoria: CategoriaDaLista }) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const invalidar = () => cliente.invalidateQueries({ queryKey: chaves.categorias.todas });

  const [escolhendoIcone, setEscolhendoIcone] = useState(false);

  const atualizar = useMutation({
    mutationFn: (natureza: Natureza | null) => atualizarCategoria(categoria.id, { natureza }),
    onSuccess: invalidar,
  });

  const trocarIcone = useMutation({
    mutationFn: (icone: string | null) => atualizarCategoria(categoria.id, { icone }),
    onSuccess: async () => {
      await invalidar();
      setEscolhendoIcone(false);
    },
  });

  const [excluindo, setExcluindo] = useState(false);

  const arquivar = useMutation({
    mutationFn: () => arquivarCategoria(categoria.id),
    onSuccess: invalidar,
    onError: (erro) => mostrar((erro as Error).message),
  });

  return (
    <li className="rounded-lg border border-borda bg-superficie px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* O ícone é o próprio botão de trocá-lo: um "editar ícone" separado
              seria um controle a mais para a mesma ação. Sem ícone, cai no
              ponto colorido, que nunca deixa de funcionar. */}
          <button
            onClick={() => setEscolhendoIcone((v) => !v)}
            title={escolhendoIcone ? 'Fechar' : 'Trocar o ícone'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borda text-slate-400 transition hover:border-borda-forte hover:text-slate-200"
          >
            {categoria.icone ? (
              <IconeDeCategoria chave={categoria.icone} cor={categoria.cor} />
            ) : (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: categoria.cor ?? '#475569' }}
              />
            )}
          </button>
          <span className="truncate text-slate-100">{categoria.nome}</span>
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
          <div className="flex shrink-0 gap-3">
            <button
              onClick={() => arquivar.mutate()}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              Arquivar
            </button>
            <button
              onClick={() => setExcluindo((v) => !v)}
              title="Para a categoria criada por engano, que nunca classificou nada."
              className={`text-xs text-slate-600 hover:text-red-400 ${ALVO_DE_TOQUE}`}
            >
              {excluindo ? 'Cancelar' : 'Excluir'}
            </button>
          </div>
        )}
      </div>

      {excluindo && <ExclusaoDeCategoria categoria={categoria} aoTerminar={() => setExcluindo(false)} />}

      {escolhendoIcone && (
        <div className="mt-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <EscolherIcone
            escolhido={categoria.icone}
            cor={categoria.cor}
            aoEscolher={(chave) => trocarIcone.mutate(chave)}
          />
        </div>
      )}

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
            {natureza ? ROTULOS[natureza] : 'Sem natureza'}
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
  const [icone, setIcone] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => criarCategoria({ nome, tipo, natureza, icone }),
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
            {n ? ROTULOS[n] : 'Sem natureza'}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-borda bg-superficie-alta p-3">
        <EscolherIcone escolhido={icone} aoEscolher={setIcone} />
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

function LinhaArquivada({
  categoria,
}: {
  categoria: { id: string; nome: string; cor: string | null; icone: string | null };
}) {
  const cliente = useQueryClient();

  const desarquivar = useMutation({
    mutationFn: () => desarquivarCategoria(categoria.id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chaves.categorias.todas }),
  });

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-500">
        <IconeDeCategoria chave={categoria.icone} cor={categoria.cor} />
        <span className="truncate">{categoria.nome}</span>
      </span>
      <button
        onClick={() => desarquivar.mutate()}
        disabled={desarquivar.isPending}
        className={`shrink-0 text-xs text-slate-500 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
      >
        Reativar
      </button>
    </li>
  );
}

/**
 * Excluir uma categoria que nunca foi usada (§4.3).
 *
 * A regra aqui é mais dura que a do investimento, e por um motivo: lá, os
 * lançamentos do aporte foram INVENTADOS pelo app, e desfazê-los conserta o
 * saldo. Aqui os lançamentos são do usuário e a categoria só os classifica —
 * apagá-la com uso tiraria a classificação de meses já fechados.
 *
 * Então a exclusão vale só para a categoria virgem: a duplicada, a com nome
 * errado, a criada e abandonada no mesmo minuto. Com qualquer uso, a tela diz
 * ONDE ela está sendo usada em vez de só recusar — saber que são 47 lançamentos
 * responde a próxima pergunta antes que ela seja feita.
 */
function ExclusaoDeCategoria({
  categoria,
  aoTerminar,
}: {
  categoria: { id: string; nome: string };
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const previa = useQuery({
    queryKey: ['categoria-previa-exclusao', categoria.id],
    queryFn: () => previaDaExclusao(categoria.id),
  });

  const excluir = useMutation({
    mutationFn: () => excluirCategoria(categoria.id),
    onSuccess: async () => {
      await cliente.invalidateQueries();
      mostrar(`Categoria "${categoria.nome}" excluída.`);
    },
  });

  if (previa.isPending) {
    return (
      <p className="mt-3 rounded-lg border border-borda-forte p-3 text-sm text-slate-400">
        Vendo onde esta categoria é usada…
      </p>
    );
  }

  const usos = previa.data
    ? [
        [previa.data.transacoes, 'lançamento'],
        [previa.data.recorrencias, 'recorrência'],
        [previa.data.orcamentos, 'orçamento'],
        [previa.data.modelos, 'modelo'],
        [previa.data.subcategorias, 'subcategoria'],
      ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, nome]) => `${n} ${nome}${(n as number) > 1 ? 's' : ''}`)
    : [];

  return (
    <ConfirmacaoDeExclusao
      consequencia="Esta categoria nunca foi usada: excluir não mexe em lançamento nenhum."
      impedimento={
        previa.data?.podeExcluir
          ? null
          : `Esta categoria está em uso: ${usos.join(', ')}. Arquive em vez de excluir — apagar tiraria a classificação de meses que já fecharam.`
      }
      ajuda={
        previa.data?.podeExcluir
          ? 'Se ela já classificou alguma coisa, o certo é Arquivar: ela some dos seletores e o histórico continua íntegro.'
          : undefined
      }
      emAndamento={excluir.isPending}
      erro={excluir.isError ? (excluir.error as Error).message : null}
      aoConfirmar={() => excluir.mutate()}
      aoCancelar={aoTerminar}
    />
  );
}
