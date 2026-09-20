import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hoje, primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { gastoPorCategoria, type TransacaoDeRelatorio } from '../dominio/relatorios';
import {
  CENARIOS_DE_ORCAMENTO,
  ROTULOS_DAS_FAIXAS,
  comparacaoComOCenario,
  divisaoDaRenda,
  tetosDoCenario,
  mereceAlerta,
  panoramaDaRenda,
  progressoDoOrcamento,
  type CenarioDeOrcamento,
  type FaixaDoOrcamento,
  type ProgressoDoOrcamento,
} from '../dominio/orcamento';
import {
  copiarOrcamentoDoMesAnterior,
  definirTeto,
  definirTetosEmLote,
  listarOrcamentos,
  rendaFixaCadastrada,
  type TetoEscolhido,
} from '../dados/orcamentos';
import { usarCategorias, usarTransacoes } from '../dados/usarTransacoes';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import {
  ALVO_DE_TOQUE,
  Botao,
  ENTRADA,
  Cartao,
  Chip,
  Dinheiro,
  Nota,
  Pagina,
  Secao,
  Vazio,
} from '../ui/base';
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

  /*
    Três meses para repartir a faixa entre as categorias dela.

    O mês corrente sozinho não serve: no dia 3, quase toda categoria está
    zerada, e a sugestão sairia dando a faixa inteira para quem passou no posto
    no dia 2. Três meses já têm a forma do gasto de quem está olhando.
  */
  const historico = usarTransacoes({
    de: primeiroDiaDoMes(somarMeses(mes, -2)),
    ate: ultimoDiaDoMes(mes),
  });

  // A renda fixa do mês: é o denominador de todas as porcentagens daqui.
  const renda = useQuery({
    queryKey: ['renda-fixa', mes],
    queryFn: () => rendaFixaCadastrada(mes),
  });

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

  /*
    Quem tem filha cede o lugar a elas no relatório por categoria (§5.5).

    Era `false` fixo aqui, e isso funcionava por acidente: a divisão de
    transação ainda não existe, então nenhuma linha tem filha. No dia em que
    existir, o pai contaria com o valor cheio na categoria dele E cada filha na
    sua — a compra dividida entraria dobrada no teto e no fechamento. Derivar
    da própria lista, como Relatórios já faz, custa três linhas e tira a mina
    do caminho.
  */
  const paisComFilhas = new Set(
    (transacoes.data ?? []).map((t) => t.transacaoPaiId).filter((id): id is string => id !== null),
  );

  const paraRelatorio: TransacaoDeRelatorio[] = (transacoes.data ?? []).map((t) => ({
    valor: t.valor,
    tipo: t.tipo,
    dataCompetencia: t.dataCompetencia,
    categoriaId: t.categoriaId,
    natureza: null,
    transacaoPaiId: t.transacaoPaiId,
    temFilhas: paisComFilhas.has(t.id),
  }));

  const realizadoPorCategoria = new Map(
    gastoPorCategoria(paraRelatorio).map((fatia) => [fatia.categoriaId, fatia.total]),
  );

  const paisComFilhasNoHistorico = new Set(
    (historico.data ?? []).map((t) => t.transacaoPaiId).filter((id): id is string => id !== null),
  );
  const gastoDoHistorico = new Map(
    gastoPorCategoria(
      (historico.data ?? []).map((t) => ({
        valor: t.valor,
        tipo: t.tipo,
        dataCompetencia: t.dataCompetencia,
        categoriaId: t.categoriaId,
        natureza: null,
        transacaoPaiId: t.transacaoPaiId,
        temFilhas: paisComFilhasNoHistorico.has(t.id),
      })),
    ).map((fatia) => [fatia.categoriaId, fatia.total]),
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
  const totalRealizado = despesas.reduce(
    (total, c) => total + (realizadoPorCategoria.get(c.id) ?? 0),
    0,
  );

  const percentuais = new Map(
    (orcamentos.data ?? []).map((o) => [o.categoriaId, o.percentualDaRenda]),
  );
  const panorama = panoramaDaRenda(renda.data ?? 0, totalPlanejado, totalRealizado);

  /*
    Onde a renda está caindo, nas três faixas dos cenários (§8.6).

    É o que liga o cartaz do 50/30/20 à vida de quem olha: sem esta conta, o
    cenário diz onde se deveria estar e cala sobre onde se está.
  */
  const divisao = divisaoDaRenda(
    despesas.map((c) => ({ id: c.id, faixa: c.faixa })),
    realizadoPorCategoria,
    renda.data ?? 0,
  );

  // Só as categorias que mexeram este mês: listar as trinta viraria parede.
  const comMovimento = despesas.filter(
    (c) => tetos.has(c.id) || (realizadoPorCategoria.get(c.id) ?? 0) > 0,
  );
  const nomesPorFaixa = new Map<FaixaDoOrcamento, string[]>();
  for (const categoria of comMovimento) {
    if (categoria.faixa === null) continue;
    nomesPorFaixa.set(categoria.faixa, [
      ...(nomesPorFaixa.get(categoria.faixa) ?? []),
      categoria.nome,
    ]);
  }
  const gastandoSemFaixa = comMovimento.filter(
    (c) => c.faixa === null && (realizadoPorCategoria.get(c.id) ?? 0) > 0,
  );

  // A colinha de cada categoria: o que cada cenário daria PARA ELA.
  const paraOsCenarios = despesas.map((c) => ({ id: c.id, faixa: c.faixa }));
  const sugestoesPorCategoria = new Map<string, { cenario: string; percentual: number }[]>();
  for (const cenario of CENARIOS_DE_ORCAMENTO) {
    for (const sugestao of tetosDoCenario(cenario, paraOsCenarios, gastoDoHistorico)) {
      sugestoesPorCategoria.set(sugestao.categoriaId, [
        ...(sugestoesPorCategoria.get(sugestao.categoriaId) ?? []),
        { cenario: cenario.nome, percentual: sugestao.percentual },
      ]);
    }
  }

  const aplicar = useMutation({
    mutationFn: (cenario: CenarioDeOrcamento) =>
      definirTetosEmLote(mes, tetosDoCenario(cenario, paraOsCenarios, gastoDoHistorico)),
    onSuccess: async (quantidade) => {
      await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
      mostrar(`${quantidade} teto(s) definido(s) pelo cenário.`);
    },
  });

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

      {/*
        A renda inteira como denominador (§8.6).

        Teto por categoria responde "cabe no que eu decidi para Lazer?". Esta
        barra responde a pergunta de cima — "sobrou quanto do que entra?" — que
        é a que decide se a compra acontece.
      */}
      {!panorama.semRenda && (
        <Cartao className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">
              Renda fixa do mês
            </span>
            <Dinheiro centavos={panorama.rendaFixa} className="text-sm text-slate-200" />
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-superficie-alta">
            <div
              className={`h-full rounded-full transition-all ${
                panorama.proporcaoRealizada > 1 ? 'bg-red-500' : 'bg-emerald-600'
              }`}
              style={{ width: `${Math.min(panorama.proporcaoRealizada * 100, 100)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-slate-400">
            <strong className="text-slate-200">
              {Math.round(panorama.proporcaoLivre * 100)}% livre
            </strong>{' '}
            — já saíram {Math.round(panorama.proporcaoRealizada * 100)}% (
            <Dinheiro centavos={panorama.realizado} className="text-slate-400" />) e os tetos
            reservam {Math.round(panorama.proporcaoPlanejada * 100)}% do que entra.
          </p>
        </Cartao>
      )}

      {panorama.semRenda && totalPlanejado > 0 && (
        <Nota>
          Para orçar por porcentagem, o app precisa saber o que entra todo mês: cadastre o salário
          como recorrência de receita. Sem isso, só dá para definir teto em reais.
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
              percentualDaRenda={percentuais.get(categoria.id) ?? null}
              rendaFixa={renda.data ?? 0}
              sugestoes={sugestoesPorCategoria.get(categoria.id) ?? []}
              aoDefinirTeto={async (teto) => {
                await definirTeto(mes, categoria.id, teto);
                await cliente.invalidateQueries({ queryKey: ['orcamentos'] });
              }}
            />
          ))}
        </div>
      </Secao>

      <Secao titulo="Três cenários, para se guiar">
        <div className="space-y-2">
          {CENARIOS_DE_ORCAMENTO.map((cenario) => (
            <Cartao key={cenario.nome} className="p-4">
              <h3 className="text-sm text-slate-100">{cenario.nome}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{cenario.quandoServe}</p>

              <AplicarCenario
                sugestoes={tetosDoCenario(cenario, paraOsCenarios, gastoDoHistorico)}
                nomeDaCategoria={(id) => despesas.find((c) => c.id === id)?.nome ?? '—'}
                rendaFixa={renda.data ?? 0}
                aplicando={aplicar.isPending}
                aoAplicar={() => aplicar.mutate(cenario)}
              />

              <div className="mt-3 space-y-2">
                {comparacaoComOCenario(cenario, divisao, panorama.rendaFixa).map((faixa) => {
                  /*
                    Passar do alvo é alerta em essenciais e estilo de vida. No
                    futuro é o contrário: o que preocupa é ficar ABAIXO — e foi
                    por trocar esse sinal que a primeira versão desta tela
                    pintava de amarelo justamente quem estava guardando mais.
                  */
                  const fora =
                    faixa.chave === 'futuro' ? faixa.diferenca < 0 : faixa.diferenca > 0;

                  return (
                    <div key={faixa.chave}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 text-slate-300">
                          <span className="tabular-nums text-slate-500">
                            {faixa.percentualAlvo}%
                          </span>{' '}
                          {faixa.nome}
                        </span>
                        {!panorama.semRenda && (
                          <Dinheiro
                            centavos={faixa.valorAlvo}
                            className="shrink-0 text-xs text-slate-400"
                          />
                        )}
                      </div>

                      {!panorama.semRenda && (
                        <p
                          className={`text-[11px] ${fora ? 'text-amber-400/90' : 'text-slate-600'}`}
                        >
                          hoje {Math.round(faixa.percentualHoje)}% ·{' '}
                          {formatar(faixa.valorHoje)}
                          {faixa.diferenca !== 0 &&
                            ` (${formatar(Math.abs(faixa.diferenca))} ${
                              faixa.diferenca > 0 ? 'acima' : 'abaixo'
                            })`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Cartao>
          ))}
        </div>

        {/* De qual categoria sai cada faixa. Sem isto, os três cartazes acima
            são porcentagens sobre nada: é a classificação da categoria que
            transforma "30% em estilo de vida" em "Lazer, Assinaturas e
            Vestuário somam R$ 1.340". */}
        <Cartao className="p-4">
          <h3 className="text-sm text-slate-100">De onde vem cada faixa</h3>

          <div className="mt-2 space-y-2">
            {(['essenciais', 'estilo_de_vida', 'futuro'] as const).map((faixa) => (
              <div key={faixa}>
                <span className="text-xs text-slate-400">{ROTULOS_DAS_FAIXAS[faixa]}</span>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {nomesPorFaixa.get(faixa)?.join(' · ') ??
                    (faixa === 'futuro'
                      ? 'O que sobra da renda: aporte e amortização saem daqui e são transferência, não gasto (§2.3).'
                      : 'Nenhuma categoria com esta faixa mexeu este mês.')}
                </p>
              </div>
            ))}
          </div>

          {gastandoSemFaixa.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/80">
              Sem faixa: {gastandoSemFaixa.map((c) => c.nome).join(' · ')}. Enquanto não tiverem
              faixa, o gasto delas sai do Futuro — a conta fica pessimista de propósito. Dá para
              classificar em Categorias, num toque.
            </p>
          )}
        </Cartao>

        <Nota>
          São pontos de partida publicados, não recomendação para o seu caso: servem para dar
          ordem de grandeza a quem está dividindo a renda pela primeira vez. Nenhum deles sabe da
          sua vida — o seu orçamento é o que você consegue cumprir três meses seguidos.
        </Nota>
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

/**
 * Aplicar um cenário a todas as categorias de uma vez (§8.6).
 *
 * Com prévia antes de gravar, e não num clique só: isto REESCREVE os tetos que
 * já existem, e um botão que mexe em quinze linhas de uma vez precisa dizer
 * quais são as quinze antes de mexer.
 */
function AplicarCenario({
  sugestoes,
  nomeDaCategoria,
  rendaFixa,
  aplicando,
  aoAplicar,
}: {
  sugestoes: readonly { categoriaId: string; percentual: number }[];
  nomeDaCategoria: (id: string) => string;
  rendaFixa: Centavos;
  aplicando: boolean;
  aoAplicar: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  if (sugestoes.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-slate-600">
        Sem gasto nos últimos três meses nas categorias destas faixas, não há como repartir a
        renda entre elas.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`mt-2 text-xs text-emerald-500 hover:text-emerald-400 ${ALVO_DE_TOQUE}`}
      >
        {aberto ? 'Fechar' : 'Definir os tetos por este cenário'}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <p className="text-xs leading-relaxed text-slate-400">
            Os tetos ficam assim — em porcentagem da renda, repartida entre as categorias na
            mesma proporção dos últimos três meses. Isto substitui os tetos que já existem
            nestas categorias.
          </p>

          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {sugestoes.map((sugestao) => (
              <li
                key={sugestao.categoriaId}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="truncate text-slate-300">
                  {nomeDaCategoria(sugestao.categoriaId)}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {sugestao.percentual}%
                  {rendaFixa > 0 &&
                    ` · ${formatar(Math.round((rendaFixa * sugestao.percentual) / 100))}`}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <Botao
              aoClicar={() => {
                aoAplicar();
                setAberto(false);
              }}
              desabilitado={aplicando}
            >
              {aplicando ? 'Aplicando…' : 'Aplicar'}
            </Botao>
            <Botao tipo="secundario" aoClicar={() => setAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </>
  );
}

function LinhaDoOrcamento({
  nome,
  icone,
  corDaCategoria,
  progresso,
  percentualDaRenda,
  rendaFixa,
  sugestoes,
  aoDefinirTeto,
}: {
  nome: string;
  icone: string | null;
  corDaCategoria: string | null;
  progresso: ProgressoDoOrcamento;
  percentualDaRenda: number | null;
  rendaFixa: Centavos;
  /** O que cada cenário daria para ESTA categoria. A colinha de quem está decidindo. */
  sugestoes: readonly { cenario: string; percentual: number }[];
  aoDefinirTeto: (teto: TetoEscolhido) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<Centavos>(progresso.planejado);
  // Abre no modo em que o teto foi decidido: quem definiu 10% da renda volta
  // para mudar a porcentagem, não para redigitar reais.
  const [modo, setModo] = useState<'valor' | 'percentual'>(
    percentualDaRenda === null ? 'valor' : 'percentual',
  );
  const [percentual, setPercentual] = useState(
    percentualDaRenda === null ? '' : String(percentualDaRenda),
  );

  const percentualDigitado = Number(percentual.replace(',', '.')) || 0;
  const previa = Math.round((rendaFixa * percentualDigitado) / 100);

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
          {progresso.planejado > 0 || percentualDaRenda !== null ? 'Mudar teto' : 'Definir teto'}
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
              {percentualDaRenda !== null && (
                <span className="text-slate-600"> · {percentualDaRenda}% da renda</span>
              )}
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
              {/* Em reais E em porcentagem: quem decidiu o teto por
                  porcentagem acompanha por porcentagem. */}
              {progresso.restante < 0
                ? `${formatar(Math.abs(progresso.restante))} acima`
                : `${formatar(progresso.restante)} restam · ${Math.round(
                    progresso.proporcaoRestante * 100,
                  )}% livre`}
            </span>
          </div>
          {progresso.acimaDoRitmo && progresso.situacao !== 'estourado' && (
            <p className="mt-1.5 text-[11px] text-amber-400/80">
              {Math.round(progresso.proporcaoGasta * 100)}% do teto com{' '}
              {Math.round(progresso.proporcaoDoMes * 100)}% do mês passado.
            </p>
          )}
        </>
      ) : percentualDaRenda !== null ? (
        // Porcentagem definida e renda desconhecida: dizer o que falta é melhor
        // que mostrar um teto de R$ 0,00 que ninguém pediu (§13.5).
        <p className="mt-1 text-xs text-amber-400/80">
          {percentualDaRenda}% da renda · cadastre a renda fixa para isto virar um valor
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Sem teto · gasto de <Dinheiro centavos={progresso.realizado} className="text-slate-400" />
        </p>
      )}

      {editando && (
        <div className="mt-3 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <div className="flex gap-2">
            <Chip ativo={modo === 'valor'} aoClicar={() => setModo('valor')}>
              Em reais
            </Chip>
            <Chip ativo={modo === 'percentual'} aoClicar={() => setModo('percentual')}>
              % da renda
            </Chip>
          </div>

          {modo === 'valor' ? (
            <CampoValor valor={valor} aoMudar={setValor} rotulo="Teto mensal" />
          ) : (
            <label className="block">
              <span className="text-xs text-slate-400">Porcentagem da renda fixa</span>
              {/* A entrada padrão do app. Escrita à mão, esta ficava sem a cor
                  de placeholder e com outro respiro — diferente por acidente. */}
              <input
                inputMode="decimal"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value.replace(/[^\d,.]/g, '').slice(0, 5))}
                placeholder="10"
                className={`mt-1 ${ENTRADA}`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                {rendaFixa > 0
                  ? `${percentualDigitado || 0}% de ${formatar(rendaFixa)} = ${formatar(previa)} por mês. Se a renda mudar, o teto acompanha.`
                  : 'Sem renda fixa cadastrada, a porcentagem fica guardada e vira valor assim que houver uma recorrência de receita.'}
              </span>
            </label>
          )}

          {/* A colinha: o que cada cenário daria para ESTA categoria, já
              repartido dentro da faixa dela. Um toque preenche o campo —
              porque a conta certa que dá trabalho de copiar não é usada. */}
          {modo === 'percentual' && sugestoes.length > 0 && (
            <div>
              <span className="text-[11px] text-slate-500">
                Pelos cenários, esta categoria ficaria com:
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sugestoes.map((sugestao) => (
                  <button
                    key={sugestao.cenario}
                    onClick={() => setPercentual(String(sugestao.percentual).replace('.', ','))}
                    className={`rounded-full border border-borda px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-emerald-700 hover:text-emerald-300 ${ALVO_DE_TOQUE}`}
                  >
                    {sugestao.cenario} <span className="tabular-nums">{sugestao.percentual}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Botao
              aoClicar={async () => {
                await aoDefinirTeto(
                  modo === 'valor'
                    ? { tipo: 'valor', valor }
                    : { tipo: 'percentual', percentual: percentualDigitado },
                );
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
