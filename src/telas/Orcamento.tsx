import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hoje, primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { gastoPorCategoria, type TransacaoDeRelatorio } from '../dominio/relatorios';
import {
  mereceAlerta,
  progressoDoOrcamento,
  type ProgressoDoOrcamento,
} from '../dominio/orcamento';
import { copiarOrcamentoDoMesAnterior, definirTeto, listarOrcamentos } from '../dados/orcamentos';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { ALVO_DE_TOQUE, Botao, Cartao, Dinheiro, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Orçamento: teto por categoria, planejado x realizado (§11, §8.6).
 *
 * O número que importa não é quanto foi gasto, é se o gasto corre mais rápido
 * que o calendário. 60% do teto no dia 5 e 60% no dia 25 são situações
 * diferentes, e a tela precisa distinguir as duas.
 */
export function Orcamento() {
  const [mes, setMes] = useState<DataISO>(primeiroDiaDoMes(hoje()));
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const categorias = usarCategorias();
  const orcamentos = useQuery({
    queryKey: ['orcamentos', mes],
    queryFn: () => listarOrcamentos(mes),
  });
  const transacoes = usarTransacoes({ de: mes, ate: ultimoDiaDoMes(mes) });

  const copiar = useMutation({
    mutationFn: () => copiarOrcamentoDoMesAnterior(mes, somarMeses(mes, -1)),
    onSuccess: async (quantidade) => {
      await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
      mostrar(
        quantidade > 0
          ? `${quantidade} teto(s) copiado(s) do mês anterior.`
          : 'O mês anterior não tinha nenhum teto definido.',
      );
    },
  });

  const paraRelatorio: TransacaoDeRelatorio[] = (transacoes.data ?? []).map((t) => ({
    valor: t.valor,
    tipo: t.tipo,
    dataCompetencia: t.dataCompetencia,
    categoriaId: t.categoriaId,
    natureza: null,
    transacaoPaiId: t.transacaoPaiId,
    temFilhas: false,
  }));

  const realizadoPorCategoria = new Map(
    gastoPorCategoria(paraRelatorio).map((fatia) => [fatia.categoriaId, fatia.total]),
  );

  const tetos = new Map((orcamentos.data ?? []).map((o) => [o.categoriaId, o.valorPlanejado]));
  const despesas = (categorias.data ?? []).filter((c) => c.tipo === 'despesa');

  // Categoria com teto ou com gasto aparece; o resto fica atrás de "ver todas",
  // senão a tela vira uma lista de trinta linhas zeradas.
  const [verTodas, setVerTodas] = useState(false);
  const relevantes = despesas.filter(
    (c) => verTodas || tetos.has(c.id) || (realizadoPorCategoria.get(c.id) ?? 0) > 0,
  );

  const referencia = mes === primeiroDiaDoMes(hoje()) ? hoje() : ultimoDiaDoMes(mes);

  const comAlerta = relevantes.filter((categoria) => {
    const progresso = progressoDoOrcamento(
      tetos.get(categoria.id) ?? 0,
      realizadoPorCategoria.get(categoria.id) ?? 0,
      referencia,
    );
    return mereceAlerta(progresso, referencia);
  });

  const totalPlanejado = [...tetos.values()].reduce((s, v) => s + v, 0);

  return (
    <Pagina
      titulo="Orçamento"
      subtitulo={`${MESES[Number(mes.split('-')[1]) - 1]} de ${mes.slice(0, 4)}`}
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
      {comAlerta.length > 0 && (
        <Nota tom="atencao">
          {comAlerta.map((c) => c.nome).join(', ')}{' '}
          {comAlerta.length === 1 ? 'passou' : 'passaram'} do ritmo esperado para esta altura do
          mês. Ainda dá para reagir.
        </Nota>
      )}

      {totalPlanejado === 0 && (
        <Vazio
          titulo="Nenhum teto definido para este mês"
          descricao="Teto por categoria serve para as variáveis — é onde dá para cortar. Definir teto para despesa fixa não muda nada: ela vence do mesmo jeito."
          acao={
            <Botao tipo="secundario" aoClicar={() => copiar.mutate()} desabilitado={copiar.isPending}>
              Copiar do mês anterior
            </Botao>
          }
        />
      )}

      <Secao
        titulo="Por categoria"
        acao={
          <button
            onClick={() => setVerTodas((v) => !v)}
            className={`text-xs text-emerald-400 hover:text-emerald-300 ${ALVO_DE_TOQUE}`}
          >
            {verTodas ? 'Ver menos' : 'Ver todas'}
          </button>
        }
      >
        <div className="space-y-2">
          {relevantes.map((categoria) => (
            <LinhaDoOrcamento
              key={categoria.id}
              nome={categoria.nome}
              icone={categoria.icone}
              corDaCategoria={categoria.cor}
              progresso={progressoDoOrcamento(
                tetos.get(categoria.id) ?? 0,
                realizadoPorCategoria.get(categoria.id) ?? 0,
                referencia,
              )}
              aoDefinirTeto={async (valor) => {
                await definirTeto(mes, categoria.id, valor);
                await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
              }}
            />
          ))}
        </div>
      </Secao>

      {totalPlanejado > 0 && (
        <Nota>
          Teto faz sentido nas despesas variáveis, que são onde dá para cortar. Fixas vencem de
          qualquer jeito, e eventuais precisam de provisão, não de limite mensal.
        </Nota>
      )}
    </Pagina>
  );
}

function LinhaDoOrcamento({
  nome,
  icone,
  corDaCategoria,
  progresso,
  aoDefinirTeto,
}: {
  nome: string;
  icone: string | null;
  corDaCategoria: string | null;
  progresso: ProgressoDoOrcamento;
  aoDefinirTeto: (valor: Centavos) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<Centavos>(progresso.planejado);

  const cor =
    progresso.situacao === 'estourado'
      ? 'bg-red-500'
      : progresso.acimaDoRitmo
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  return (
    <Cartao className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-100">
          <IconeDeCategoria chave={icone} cor={corDaCategoria} className="h-4 w-4" />
          <span className="truncate">{nome}</span>
        </span>
        <button
          onClick={() => setEditando((v) => !v)}
          className={`shrink-0 text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {progresso.planejado > 0 ? 'Mudar teto' : 'Definir teto'}
        </button>
      </div>

      {progresso.planejado > 0 ? (
        <>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-alta">
            <div
              className={`h-full rounded-full transition-all ${cor}`}
              style={{ width: `${Math.min(progresso.proporcaoGasta * 100, 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-slate-500">
              <Dinheiro centavos={progresso.realizado} className="text-slate-300" /> de{' '}
              <Dinheiro centavos={progresso.planejado} className="text-slate-400" />
            </span>
            <span
              className={
                progresso.restante < 0
                  ? 'text-red-400'
                  : progresso.acimaDoRitmo
                    ? 'text-amber-400'
                    : 'text-slate-500'
              }
            >
              {progresso.restante < 0
                ? `${formatar(Math.abs(progresso.restante))} acima`
                : `${formatar(progresso.restante)} restam`}
            </span>
          </div>
          {progresso.acimaDoRitmo && progresso.situacao !== 'estourado' && (
            <p className="mt-1.5 text-[11px] text-amber-400/80">
              {Math.round(progresso.proporcaoGasta * 100)}% do teto com{' '}
              {Math.round(progresso.proporcaoDoMes * 100)}% do mês passado.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Sem teto · gasto de <Dinheiro centavos={progresso.realizado} className="text-slate-400" />
        </p>
      )}

      {editando && (
        <div className="mt-3 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <CampoValor valor={valor} aoMudar={setValor} rotulo="Teto mensal" />
          <div className="flex gap-2">
            <Botao
              aoClicar={async () => {
                await aoDefinirTeto(valor);
                setEditando(false);
              }}
            >
              Salvar
            </Botao>
            <Botao tipo="secundario" aoClicar={() => setEditando(false)}>
              Cancelar
            </Botao>
          </div>
          <p className="text-[11px] text-slate-500">Zero remove o teto desta categoria.</p>
        </div>
      )}
    </Cartao>
  );
}
