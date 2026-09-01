import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  formatarBR,
  hoje,
  primeiroDiaDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { usarContas } from '../dados/usarContas';
import { usarBuscaDeCategoria, usarTransacoes } from '../dados/usarTransacoes';
import type { Categoria } from '../dados/tipos';
import { entraNoConsolidado } from '../dominio/saldo';
import type { MovimentoDeCaixa } from '../dominio/saldoDiario';
import {
  duplicarTransacao,
  excluirParcelamento,
  excluirTransacao,
  excluirTransacoes,
  marcarRevisado,
  movimentosDeCaixa,
  saldoAte,
  type EscopoDeParcelamento,
  type Transacao,
} from '../dados/transacoes';
import { usarCartoes } from '../dados/usarCartoes';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarAviso } from '../ui/Aviso';
import { listarPendentes } from '../dados/fila';
import { usarFila } from '../dados/usarFila';
import { somarDias } from '../dominio/datas';
import { ALVO_DE_TOQUE, Botao, Cartao, CartaoIndicador, Dinheiro, Etiqueta, Pagina, Secao, Vazio } from '../ui/base';
import {
  previstoNoCaixaDoMes,
  previstoNoCaixaEntre,
  type ItemPrevisto,
} from '../dominio/previsto';
import { extratoDoMes } from '../dominio/extrato';

/** Previsto vira movimento de caixa. Sem valor não vira nada: somar zero por
 *  ele empurraria o saldo para um número que ninguém prometeu. */
function paraMovimentos(itens: readonly ItemPrevisto[]): MovimentoDeCaixa[] {
  return itens
    .filter((item) => item.valor !== null)
    .map((item) => ({
      valor: item.tipo === 'receita' ? item.valor! : -item.valor!,
      dataCaixa: item.dataCaixa,
      transacaoPaiId: null,
    }));
}
import {
  agruparPorCaixa,
  faturasQueAindaVaoSair,
  type BlocoDeFatura,
} from '../dominio/agrupamento';
import { gerarUmaOcorrencia, ocorrenciasDoPeriodo } from '../dados/geracaoRecorrencias';
import { faturasAVencerEntre, situacaoDasFaturas } from '../dados/faturas';
import { usarRecorrencias } from '../dados/usarModelos';
import { usarFeriados } from '../dados/usarFeriados';
import { IconeConfere, IconeFaturas, IconeRelogio } from '../ui/icones';
import { RevisarELancar } from '../ui/RevisarELancar';
import { IconeDeCategoria } from '../ui/iconesDeCategoria';
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
  const cartoes = usarCartoes();
  const transacoes = usarTransacoes({
    de: mes,
    ate: ultimoDiaDoMes(mes),
    contaId,
    // Sempre por caixa. A lista existe para responder o que entrou e saiu da
    // conta, e uma compra no cartao nao saiu de lugar nenhum no dia da compra.
    porData: 'caixa',
  });
  const fila = usarFila();

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const buscarCategoria = usarBuscaDeCategoria();
  const lista = transacoes.data ?? [];

  // Receita e despesa nunca viram um total único (§14). Transferência fica fora
  // das duas: ela só move saldo.
  const receitas = lista.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const despesas = lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

  // Recorrência que ainda não venceu não existe no banco: a geração só cria até
  // hoje. Sem isto, um mês futuro aparece vazio mesmo com salário e aluguel
  // cadastrados — que é o oposto do que a tela deveria responder.
  const recorrencias = usarRecorrencias();
  const feriados = usarFeriados();

  // O filtro de conta é aplicado na fonte: ele vale tanto para as linhas
  // previstas do mês quanto para a ponte que abre o saldo dos meses distantes.
  const recorrenciasPrevistas = (recorrencias.data ?? [])
    .filter((r) => contaId === null || r.contaId === contaId)
    .map((r) => {
      // Recorrência no cartão não sai do caixa no dia da cobrança: ela entra
      // numa fatura, e o dinheiro só sai no vencimento dela (§2.1). Sem a
      // configuração do cartão aqui, o previsto baixava o saldo semanas antes
      // e a linha aparecia solta, ao lado da fatura em que deveria estar.
      const cartao = cartoes.data?.find((c) => c.contaId === r.contaId);

      return {
        id: r.id,
        descricao: r.descricao,
        tipo: r.tipo,
        valorPrevisto: r.valorPrevisto,
        dia: r.dia,
        regra: r.regra,
        comecaEm: r.comecaEm,
        terminaEm: r.terminaEm,
        cartao: cartao
          ? { diaFechamento: cartao.diaFechamento, diaVencimento: cartao.diaVencimento }
          : null,
      };
    });

  const geradas = useQuery({
    queryKey: ['ocorrencias-geradas', mes],
    // Dois meses para trás: a compra de setembro no cartão cai na fatura de
    // outubro, e é a competência dela que diz se já foi gerada.
    queryFn: () => ocorrenciasDoPeriodo(somarMeses(mes, -2), ultimoDiaDoMes(mes)),
  });

  const previstos =
    recorrencias.data && geradas.data && cartoes.data
      ? previstoNoCaixaDoMes(
          recorrenciasPrevistas,
          geradas.data.geradas,
          mes,
          hoje(),
          feriados,
          geradas.data.puladas,
        ).filter(
          (p) => p.situacao !== 'lancado',
        )
      : [];

  const porDia = agruparPorDiaDeCaixa(lista, previstos);

  // Saldo diário. Vem por CAIXA, não por competência: é o único que bate com o
  // extrato do banco (§13.2). Sem filtro de conta, usa as mesmas contas que
  // entram no consolidado (§2.6).
  const elegiveis = (contas.data ?? []).filter(entraNoConsolidado).map((c) => c.id);
  const inicio = mes;
  const fim = ultimoDiaDoMes(mes);

  const abertura = useQuery({
    queryKey: ['saldo-abertura', inicio, contaId],
    queryFn: () => saldoAte(somarDias(inicio, -1), contaId),
  });

  // A ponte entre hoje e um mês distante.
  //
  // O acumulado vem do banco, e no banco não existe nenhuma recorrência de mês
  // futuro: a geração só cria até hoje. Então o saldo até 30/09 é idêntico ao
  // de hoje, e outubro abria com o saldo de setembro — como se setembro
  // inteiro não tivesse acontecido. O mês seguinte parecia certo só porque a
  // ponte até ele tem zero mês de comprimento.
  const mesCorrente = primeiroDiaDoMes(hoje());
  const precisaDePonte = mes > mesCorrente;

  // A ponte precisa descontar as faturas do caminho: o consolidado não inclui
  // conta de cartão, então elas não aparecem no saldo de abertura sozinhas.
  const faturasDaPonte = useQuery({
    queryKey: ['faturas-ponte', mesCorrente, mes, contaId],
    queryFn: () => faturasAVencerEntre(mesCorrente, mes, contaId),
    enabled: precisaDePonte,
  });

  const pagamentosDaPonte = useQuery({
    queryKey: ['pagamentos-ponte', (faturasDaPonte.data ?? []).map((f) => f.faturaId).join(',')],
    queryFn: () => situacaoDasFaturas((faturasDaPonte.data ?? []).map((f) => f.faturaId)),
    enabled: (faturasDaPonte.data ?? []).length > 0,
  });

  const geradasDaPonte = useQuery({
    queryKey: ['ocorrencias-geradas', 'ponte', mesCorrente, mes, contaId],
    queryFn: () => ocorrenciasDoPeriodo(mesCorrente, somarDias(mes, -1)),
    enabled: precisaDePonte,
  });

  // `null` enquanto carrega: melhor a linha aparecer um instante depois do que
  // aparecer com um número que muda sozinho na frente do usuário.
  //
  // A ponte deixou de ser um total e virou a MESMA lista de movimentos que o
  // mês exibido monta. Enquanto eram duas contas separadas, elas divergiam — e
  // a divergência aparecia como o saldo do último dia de um mês não batendo
  // com a abertura do seguinte.
  const pontePronta =
    !precisaDePonte ||
    (recorrencias.data !== undefined &&
      geradasDaPonte.data !== undefined &&
      faturasDaPonte.data !== undefined &&
      ((faturasDaPonte.data ?? []).length === 0 || pagamentosDaPonte.data !== undefined));

  const movimentosDaPonte: MovimentoDeCaixa[] =
    !precisaDePonte || !pontePronta
      ? []
      : [
          ...paraMovimentos(
            previstoNoCaixaEntre(
              recorrenciasPrevistas,
              geradasDaPonte.data!.geradas,
              mesCorrente,
              mes,
              hoje(),
              feriados,
              geradasDaPonte.data!.puladas,
            ),
          ),
          ...faturasQueAindaVaoSair(
            faturasDaPonte.data ?? [],
            new Map(
              [...(pagamentosDaPonte.data ?? new Map()).entries()].map(([id, s]) => [id, s.pago]),
            ),
          ),
        ];

  // Quais faturas do mês ainda não foram pagas. Sem isto o saldo previsto do
  // dia do vencimento ignora a fatura inteira — a lista mostra -R$ 1.000 e o
  // saldo ao lado não se mexe, que é a contradição que esta tela existe para
  // não ter.
  const faturasDoMes = porDia.flatMap(([, linhas]) =>
    linhas.flatMap((linha) => (linha.tipo === 'fatura' ? [linha.bloco] : [])),
  );

  const statusDeFatura = useQuery({
    queryKey: ['status-faturas', faturasDoMes.map((f) => f.faturaId).sort().join(',')],
    queryFn: () => situacaoDasFaturas(faturasDoMes.map((f) => f.faturaId)),
    enabled: faturasDoMes.length > 0,
  });

  const movimentos = useQuery({
    queryKey: ['movimentos-caixa', inicio, fim, contaId, elegiveis.length],
    queryFn: () => movimentosDeCaixa({ de: inicio, ate: fim, contaId, contasElegiveis: elegiveis }),
    enabled: contaId !== null || elegiveis.length > 0,
  });

  // O previsto entra no saldo dos dias futuros: um dia mostrando "salário
  // previsto" ao lado de um saldo que o ignora seria contraditório. Assim que a
  // ocorrência é gerada ela sai daqui e entra pelos movimentos reais, então não
  // há risco de contar duas vezes.
  const movimentosPrevistos = paraMovimentos(previstos);

  /**
   * A fatura em aberto é saída de caixa que ainda vai acontecer — mesma
   * natureza da recorrência prevista, e entra no saldo do mesmo jeito. O que
   * pesa é o que FALTA pagar: o já pago saiu pela transferência da quitação,
   * que está nos movimentos reais.
   */
  const movimentosDeFatura = faturasQueAindaVaoSair(
    // Filtrando por uma conta, a fatura só pesa nela se for quem paga.
    faturasDoMes.filter(
      (bloco) =>
        contaId === null ||
        cartoes.data?.find((c) => c.contaId === bloco.contaId)?.contaPagamentoId === contaId,
    ),
    new Map(
      [...(statusDeFatura.data ?? new Map()).entries()].map(([id, s]) => [id, s.pago]),
    ),
  );

  const extrato =
    abertura.data !== undefined && movimentos.data && pontePronta
      ? extratoDoMes({
          ancora: abertura.data,
          movimentosAteOMes: movimentosDaPonte,
          movimentosDoMes: [...movimentos.data, ...movimentosPrevistos, ...movimentosDeFatura],
          dias: porDia.map(([dia]) => dia),
        })
      : null;

  const saldosDoDia = extrato?.saldos ?? null;

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

      <p className="text-xs leading-relaxed text-slate-500">
        Cada dia mostra o que entrou e saiu da conta nele. Compra no cartão aparece dentro da
        fatura, no dia do vencimento — que é quando o dinheiro sai de fato. Para ver o gasto pela
        data em que aconteceu, o lugar é Relatórios.
      </p>

      {/* Em duas filas rotuladas, e não numa só.
          Com um cartão por banco, a fila única virava onze chips embaralhados,
          metade deles com o mesmo nome do outro — e o rótulo "· cartão" em cada
          um era a gambiarra que segurava isso de pé. O título do grupo diz a
          mesma coisa uma vez, para todos. */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <FiltroChip ativo={contaId === null} aoClicar={() => setContaId(null)}>
            Todas
          </FiltroChip>
          {(contas.data ?? [])
            .filter((c) => c.tipo !== 'cartao_credito')
            .map((conta) => (
              <ChipDeFiltroDeConta
                key={conta.id}
                conta={conta}
                ativo={contaId === conta.id}
                aoClicar={() => setContaId(conta.id)}
              />
            ))}
        </div>

        {(contas.data ?? []).some((c) => c.tipo === 'cartao_credito') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">cartão</span>
            {(contas.data ?? [])
              .filter((c) => c.tipo === 'cartao_credito')
              .map((conta) => (
                <ChipDeFiltroDeConta
                  key={conta.id}
                  conta={conta}
                  ativo={contaId === conta.id}
                  aoClicar={() => setContaId(conta.id)}
                />
              ))}
          </div>
        )}
      </div>

      {fila.pendentes > 0 && (
        <Secao titulo="Esperando conexão">
          <Cartao>
            <ul className="divide-y divide-borda">
              {listarPendentes().map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-300">{item.descricao}</p>
                    <p className="text-xs text-slate-500">
                      {item.linhas.length} linha(s) · ainda não subiu
                    </p>
                  </div>
                  <Dinheiro
                    centavos={Math.round(Number(item.linhas[0]?.valor ?? 0) * 100)}
                    className="shrink-0 text-sm text-slate-400"
                  />
                </li>
              ))}
            </ul>
          </Cartao>
          <p className="text-xs leading-relaxed text-slate-600">
            Estes lançamentos foram feitos sem conexão e ainda não estão no banco. Eles aparecem
            aqui para você não lançar de novo — e sobem sozinhos quando a rede voltar.
          </p>
        </Secao>
      )}

      {transacoes.isPending && <p className="text-slate-400">Carregando…</p>}
      {transacoes.isError && (
        <p className="text-red-400">Erro: {(transacoes.error as Error).message}</p>
      )}

      {transacoes.isSuccess && lista.length === 0 && previstos.length === 0 && (
        <Vazio
          titulo={`Nenhum lançamento em ${nomeDoMes(mes)}`}
          descricao="Use o botão + para lançar. Ele fica visível em todas as telas."
        />
      )}

      {porDia.map(([dia, doDia]) => (
        <Secao
          key={dia}
          titulo={formatarBR(dia)}
          acao={
            saldosDoDia?.has(dia) ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                {/* Num dia que ainda não chegou, o acumulado é projeção do que
                    já está lançado — chamar de "saldo" seria afirmar demais. */}
                {dia > hoje() ? 'Saldo previsto' : 'Saldo'}
                <Dinheiro
                  centavos={saldosDoDia.get(dia)!}
                  className={saldosDoDia.get(dia)! < 0 ? 'text-red-400' : 'text-slate-300'}
                />
              </span>
            ) : undefined
          }
        >
          <Cartao>
            <ul className="divide-y divide-borda">
              {doDia.map((linha) =>
                linha.tipo === 'fatura' ? (
                  <BlocoDaFatura
                    key={linha.bloco.faturaId}
                    bloco={linha.bloco}
                    paga={statusDeFatura.data?.get(linha.bloco.faturaId)?.status === 'paga'}
                    nomeCartao={nomeConta.get(linha.bloco.contaId) ?? 'Cartão'}
                    buscarCategoria={buscarCategoria}
                    aoEditar={setEditando}
                  />
                ) : linha.tipo === 'lancamento' ? (
                  <ItemDeTransacao
                    key={linha.transacao.id}
                    transacao={linha.transacao}
                    nomeConta={nomeConta.get(linha.transacao.contaId) ?? '—'}
                    categoria={buscarCategoria(linha.transacao.categoriaId)}
                    aoEditar={() => setEditando(linha.transacao)}
                  />
                ) : linha.tipo === 'transferencia' ? (
                  <ItemDeTransferencia
                    key={linha.saida.id}
                    saida={linha.saida}
                    entrada={linha.entrada}
                    nomeDaConta={(id) => nomeConta.get(id) ?? '—'}
                    aoEditar={() => setEditando(linha.saida)}
                  />
                ) : (
                  <ItemPrevistoNaLista
                    key={`${linha.previsto.recorrenciaId}-${linha.previsto.dataPrevista}`}
                    previsto={linha.previsto}
                  />
                ),
              )}
            </ul>
          </Cartao>
        </Secao>
      ))}

      <EditarTransacao transacao={editando} aoFechar={() => setEditando(null)} />
    </Pagina>
  );
}

/** Uma linha da lista: um lançamento, uma fatura inteira, ou uma recorrência por vir. */
type LinhaDoDia =
  | { tipo: 'lancamento'; transacao: Transacao }
  | { tipo: 'transferencia'; saida: Transacao; entrada: Transacao }
  | { tipo: 'fatura'; bloco: BlocoDeFatura<Transacao> }
  | { tipo: 'previsto'; previsto: ItemPrevisto };

/**
 * O agrupamento da lista (§2.4).
 *
 * O previsto continua no dia previsto, e não numa fatura: recorrência que ainda
 * não foi gerada não tem fatura para entrar. É também onde a linha de saldo já
 * conta com ela, então as duas continuam falando a mesma coisa.
 */
function agruparPorDiaDeCaixa(
  lista: Transacao[],
  previstos: ItemPrevisto[],
): [DataISO, LinhaDoDia[]][] {
  const mapa = new Map<DataISO, LinhaDoDia[]>();

  for (const { dia, linhas } of agruparPorCaixa(lista)) {
    mapa.set(
      dia,
      linhas.map((linha): LinhaDoDia =>
        linha.tipo === 'fatura'
          ? { tipo: 'fatura', bloco: linha }
          : linha.tipo === 'transferencia'
            ? { tipo: 'transferencia', saida: linha.saida, entrada: linha.entrada }
            : { tipo: 'lancamento', transacao: linha.transacao },
      ),
    );
  }

  for (const previsto of previstos) {
    // Pelo dia em que o dinheiro sai, não pelo da cobrança: no cartão as duas
    // datas são separadas por semanas, e a lista corre por caixa (§2.4).
    mapa.set(previsto.dataCaixa, [
      ...(mapa.get(previsto.dataCaixa) ?? []),
      { tipo: 'previsto', previsto },
    ]);
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
  categoria,
  aoEditar,
}: {
  transacao: Transacao;
  nomeConta: string;
  categoria: Categoria | null;
  aoEditar: () => void;
}) {
  const [confirmandoParcelamento, setConfirmandoParcelamento] = useState(false);
  const cartoes = usarCartoes();
  const { mostrar } = usarAviso();

  const invalidar = usarInvalidarTransacoes();

  const excluir = useMutation({
    mutationFn: () => excluirTransacao(transacao),
    onSuccess: async () => {
      await invalidar();
      // Vindo de recorrência, a exclusão vale só para aquele mês — e é preciso
      // dizer, porque "some e não volta" é o oposto do que acontecia antes.
      mostrar(
        transacao.recorrenciaId
          ? 'Excluído. Este mês não volta na próxima abertura; a recorrência segue nos outros.'
          : 'Lançamento excluído.',
      );
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
  const revisar = useMutation({
    mutationFn: () => marcarRevisado(transacao.id, true),
    onSuccess: () => invalidar(),
  });

  const futura = transacao.dataCompetencia > hoje();

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          <Marcador
            futura={futura}
            revisado={transacao.revisado}
            aoRevisar={() => revisar.mutate()}
          />

          <div className="min-w-0">
            <p className="truncate text-slate-100">
              {transacao.descricao ||
                categoria?.nome ||
                (ehTransferencia ? 'Transferência' : 'Sem descrição')}
            </p>
            <p className="truncate text-xs text-slate-500">
              {nomeConta}
              {categoria && (
                <>
                  {' · '}
                  <span className="inline-flex items-center gap-1 align-middle">
                    <IconeDeCategoria
                      chave={categoria.icone}
                      cor={categoria.cor}
                      className="h-3.5 w-3.5"
                    />
                    {categoria.nome}
                  </span>
                </>
              )}
              {ehParcelado && ` · parcela ${transacao.parcelaNum}/${transacao.parcelaTotal}`}
            </p>
            {(ehTransferencia || transacao.motivoEmpresa) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ehTransferencia && (
                  <Etiqueta titulo="Não conta como receita nem como despesa">transferência</Etiqueta>
                )}
                {transacao.motivoEmpresa && <Etiqueta>{transacao.motivoEmpresa}</Etiqueta>}
              </div>
            )}
          </div>
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
            <button onClick={aoEditar} className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}>
              Editar
            </button>
            {!ehTransferencia && (
              <button
                onClick={() => duplicar.mutate()}
                disabled={duplicar.isPending}
                title="Repete este lançamento com a data de hoje"
                className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
              >
                Duplicar
              </button>
            )}
            <button
              onClick={() => (ehParcelado ? setConfirmandoParcelamento(true) : excluir.mutate())}
              disabled={excluir.isPending}
              className={`text-xs text-slate-600 transition hover:text-red-400 ${ALVO_DE_TOQUE}`}
            >
              Excluir
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
              Cancelar
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

/**
 * Marcador de estado do lançamento.
 *
 *   relógio — data futura. Já está gravado, mas ainda não aconteceu: é parcela
 *             ou recorrência à frente, e por isso não entra no saldo de hoje
 *             (§13.2).
 *   confere — aconteceu e está confirmado.
 *   ponto   — aconteceu mas não foi revisado: veio de importação ou de
 *             recorrência de valor que oscila, e o número ainda pode estar
 *             errado. É o único dos três que pede alguma coisa de você.
 */
function Marcador({
  futura,
  revisado,
  aoRevisar,
}: {
  futura: boolean;
  revisado: boolean;
  aoRevisar: () => void;
}) {
  if (futura) {
    return (
      <span title="Previsto: já está lançado, mas ainda não aconteceu" className="mt-0.5 text-sky-400/80">
        <IconeRelogio className="h-4 w-4" />
      </span>
    );
  }

  if (revisado) {
    return (
      <span title="Confirmado" className="mt-0.5 text-emerald-500/70">
        <IconeConfere className="h-4 w-4" />
      </span>
    );
  }

  // O marcador É o botão de revisar. Ele era a única coisa na tela que pedia
  // algo do usuário sem oferecer como fazer: o ponto ficava aceso para sempre,
  // porque nada em lugar nenhum gravava `revisado`.
  return (
    <button
      onClick={aoRevisar}
      title="Ainda não revisado: veio de importação ou de recorrência de valor variável. Toque para confirmar."
      aria-label="Marcar como revisado"
      className="-my-2 -mx-2 flex h-8 w-8 shrink-0 items-center justify-center"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
    </button>
  );
}

/**
 * Recorrência que ainda não virou lançamento.
 *
 * Ela não existe no banco: a geração só cria até a data de hoje. Aparece aqui
 * para o mês futuro responder "o que vem", e o traço pontilhado marca que é
 * previsão, não fato — a linha não tem editar nem excluir porque não há o que
 * editar ainda.
 *
 * Quando já venceu e não foi lançada, ganha o botão: é o caso da recorrência
 * cadastrada depois do vencimento, que a geração automática nunca cria sozinha.
 */
function ItemPrevistoNaLista({ previsto }: { previsto: ItemPrevisto }) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();

  const lancar = useMutation({
    mutationFn: (valor: Centavos) =>
      gerarUmaOcorrencia(previsto.recorrenciaId, previsto.dataPrevista, valor),
    onSuccess: async (resultado) => {
      await invalidar();
      mostrar(resultado === 'criada' ? 'Lançado.' : 'Esse já estava lançado.');
    },
  });

  const [revisando, setRevisando] = useState(false);
  const atrasado = previsto.situacao === 'atrasado';

  return (
    <li className="px-4 py-3">
      {/* Aberto, o painel é `w-full` e cai sozinho para a linha de baixo. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <span
            title="Previsto: recorrência cadastrada que ainda não virou lançamento"
            className={`mt-0.5 ${atrasado ? 'text-amber-400' : 'text-sky-400/60'}`}
          >
            <IconeRelogio className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-slate-400">{previsto.descricao}</p>
            <p className="truncate text-xs text-slate-600">
              {atrasado ? 'Era para ter acontecido' : 'Previsto'}
              {previsto.valor === null && ' · valor varia'}
            </p>
            {/*
              No cartão a cobrança e a saída de dinheiro caem em datas
              diferentes. A linha está no dia do vencimento, então precisa dizer
              de qual compra ela veio — senão parece um lançamento avulso.
            */}
            {previsto.vencimentoDaFatura && (
              <p className="truncate text-xs text-slate-600">
                Cobrança de {formatarBR(previsto.dataPrevista)} · entra na fatura
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {previsto.valor !== null && (
            <Dinheiro
              centavos={previsto.tipo === 'receita' ? previsto.valor : -previsto.valor}
              className="text-slate-500"
            />
          )}
          {atrasado && !revisando && (
            <button
              onClick={() => setRevisando(true)}
              className={`text-xs text-emerald-400 transition hover:text-emerald-300 ${ALVO_DE_TOQUE}`}
            >
              Revisar e lançar
            </button>
          )}
        </div>

        {revisando && (
          <RevisarELancar
            valorPrevisto={previsto.valor}
            tipo={previsto.tipo}
            lancando={lancar.isPending}
            aoConfirmar={(valor) => lancar.mutate(valor)}
            aoCancelar={() => setRevisando(false)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * A fatura como um bloco só, no dia do vencimento (§2.1).
 *
 * O total é o que sai da conta; dentro dele estão as compras que o formaram,
 * cada uma com a data em que aconteceu e se foi à vista ou parcelada. É a
 * mesma leitura da fatura do banco — e responde, sem sair da tela, a pergunta
 * que o número sozinho não responde: de onde veio esse valor.
 *
 * Já vem aberto. Fechado por padrão, o bloco esconderia justamente a
 * informação que ele existe para mostrar.
 */
function BlocoDaFatura({
  bloco,
  paga,
  nomeCartao,
  buscarCategoria,
  aoEditar,
}: {
  bloco: BlocoDeFatura<Transacao>;
  paga: boolean;
  nomeCartao: string;
  buscarCategoria: (id: string | null) => Categoria | null;
  aoEditar: (transacao: Transacao) => void;
}) {
  const [aberto, setAberto] = useState(true);

  return (
    <li className="px-4 py-3">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 gap-2.5">
          <IconeFaturas
            className={`mt-0.5 shrink-0 ${paga ? 'text-emerald-500/70' : 'text-amber-400/80'}`}
          />
          <span className="min-w-0">
            <span className="block truncate text-slate-100">Fatura · {nomeCartao}</span>
            <span className="block truncate text-xs text-slate-500">
              {bloco.compras.length} lançamento(s) ·{' '}
              {paga ? `paga · venceu ${formatarBR(bloco.vencimento)}` : `vence ${formatarBR(bloco.vencimento)}`}
            </span>
          </span>
        </span>
        <Dinheiro centavos={bloco.total} className="shrink-0 text-slate-200" />
      </button>

      {aberto && (
        <ul className="mt-2.5 space-y-1.5 border-l border-borda pl-3">
          {bloco.compras.map((compra) => {
            const categoria = buscarCategoria(compra.categoriaId);

            return (
            <li key={compra.id} className="flex items-baseline justify-between gap-3">
              <button
                onClick={() => aoEditar(compra)}
                className={`flex min-w-0 items-center gap-1.5 text-left text-xs text-slate-300 hover:text-slate-100 ${ALVO_DE_TOQUE}`}
              >
                <IconeDeCategoria
                  chave={categoria?.icone ?? null}
                  cor={categoria?.cor ?? null}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">
                  {compra.descricao || categoria?.nome || 'Sem descrição'}
                </span>
              </button>
              <span className="shrink-0 text-[11px] text-slate-500">
                {formatarBR(compra.dataCompetencia).slice(0, 5)} ·{' '}
                {compra.parcelaNum !== null
                  ? `parcela ${compra.parcelaNum}/${compra.parcelaTotal}`
                  : 'à vista'}
              </span>
              <Dinheiro centavos={compra.valor} className="shrink-0 text-xs text-slate-400" />
            </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function ChipDeFiltroDeConta({
  conta,
  ativo,
  aoClicar,
}: {
  conta: { nome: string; cor: string | null };
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <FiltroChip ativo={ativo} aoClicar={aoClicar}>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
        />
        {conta.nome}
      </span>
    </FiltroChip>
  );
}

/**
 * Transferência numa linha só (§2.3).
 *
 * O banco guarda duas pernas porque é assim que o saldo de CADA conta se mexe,
 * e isso não muda. Mas na lista as duas linhas seguidas — mesmo nome, mesmo
 * valor com o sinal trocado — leem-se como lançamento duplicado, e o usuário
 * fica se perguntando se lançou duas vezes.
 *
 * É um evento só: o dinheiro saiu de um lugar e entrou em outro. A seta diz o
 * que os dois sinais diziam, e o valor aparece SEM sinal e sem cor de
 * receita/despesa — transferência não é ganho nem gasto, o patrimônio não se
 * mexeu (§2.3, §14).
 */
function ItemDeTransferencia({
  saida,
  entrada,
  nomeDaConta,
  aoEditar,
}: {
  saida: Transacao;
  entrada: Transacao;
  nomeDaConta: (id: string) => string;
  aoEditar: () => void;
}) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();

  const excluir = useMutation({
    mutationFn: () => excluirTransacao(saida),
    onSuccess: async () => {
      await invalidar();
      mostrar('Transferência excluída — as duas pontas.');
    },
  });

  // Revisar marca as DUAS pernas: metade revisada não é estado nenhum, e
  // deixaria a linha voltando a pedir conferência a cada recarga.
  const revisar = useMutation({
    mutationFn: async () => {
      await marcarRevisado(saida.id, true);
      await marcarRevisado(entrada.id, true);
    },
    onSuccess: () => invalidar(),
  });

  const futura = saida.dataCompetencia > hoje();

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          <Marcador
            futura={futura}
            revisado={saida.revisado && entrada.revisado}
            aoRevisar={() => revisar.mutate()}
          />

          <div className="min-w-0">
            <p className="truncate text-slate-100">{saida.descricao || 'Transferência'}</p>
            <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-500">
              <span className="truncate">{nomeDaConta(saida.contaId)}</span>
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0 text-slate-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="para"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="truncate">{nomeDaConta(entrada.contaId)}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Etiqueta titulo="Não conta como receita nem como despesa">transferência</Etiqueta>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {/* Sem sinal e sem cor: o dinheiro mudou de lugar, não de dono. */}
          <Dinheiro centavos={Math.abs(saida.valor)} className="text-slate-300" />
          <div className="mt-1 flex justify-end gap-3">
            <button
              onClick={aoEditar}
              className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
            >
              Editar
            </button>
            <button
              onClick={() => excluir.mutate()}
              disabled={excluir.isPending}
              className={`text-xs text-slate-500 hover:text-red-400 ${ALVO_DE_TOQUE}`}
            >
              Excluir
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
