// Montagem dos dados que alimentam a projeção (§8.2).
//
// A matemática mora em `dominio/projecao.ts` e é testada lá. Aqui é só coleta:
// buscar no banco o que cada componente precisa, com o filtro certo.
//
// O filtro é a parte que erra fácil (§13.2):
//   histórico de renda -> passado, só receita fixa e variável (§2.7)
//   já lançado         -> FUTURO, `data_caixa > hoje`
//   variáveis          -> passado, mediana por mês
//   saldo              -> passado, `data_caixa <= hoje`

import { paraCentavos, type Centavos } from '../dominio/dinheiro';
import {
  hoje,
  primeiroDiaDoMes,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from '../dominio/datas';
import { mediana, projetarRenda, type RendaProjetada } from '../dominio/projecao';
import { entraNaProjecaoDeRenda, type Natureza } from '../dominio/natureza';
import { TIPOS_FORA_DO_CONSOLIDADO } from '../dominio/saldo';
import { lerConfig } from './config';
import { previstoNoCaixaDoMes, resumirPrevisto } from '../dominio/previsto';
import { ocorrenciasDoPeriodo } from './geracaoRecorrencias';
import { listarFeriados } from './indicadores';
import { listarDividas } from './dividas';
import type { RegraDoDia } from '../dominio/recorrencias';
import { supabase } from './supabase';

const JANELA_DE_HISTORICO = 12;

export type DadosDaProjecao = {
  saldoAtual: Centavos;
  renda: RendaProjetada;
  fixasMensais: Centavos;
  /** As fixas com prazo, que param de pesar depois da última parcela. */
  fixasComPrazo: { valor: Centavos; ate: DataISO }[];
  provisaoEventualMensal: Centavos;
  medianaDasVariaveis: Centavos;
  jaLancadoPorMes: Record<DataISO, Centavos>;
  mesesDeHistorico: number;
  /**
   * O que ainda falta acontecer no mês corrente, líquido: positivo se sobra a
   * entrar, negativo se sobra a sair.
   *
   * Existe porque a projeção começa no MÊS QUE VEM (§8.2 fala em "cada mês
   * futuro"), e o ponto de partida dela é o saldo no fim deste mês — não o de
   * hoje. Sem isto, o que ainda vai acontecer em agosto não seria contado em
   * lugar nenhum.
   */
  aindaNesteMes: Centavos;
};

type LinhaDeTransacao = {
  valor: number;
  tipo: string;
  data_competencia: string;
  data_caixa: string;
  categoria_id: string | null;
  natureza: string | null;
};

export async function montarDadosDaProjecao(referencia: DataISO = hoje()): Promise<DadosDaProjecao> {
  const inicioDoHistorico = primeiroDiaDoMes(somarMeses(referencia, -JANELA_DE_HISTORICO));

  const [saldos, categorias, transacoes, recorrencias, sementes] = await Promise.all([
    supabase.from('saldos_contas').select('*'),
    supabase.from('categorias').select('id, natureza'),
    supabase
      .from('transacoes')
      .select('valor, tipo, data_competencia, data_caixa, categoria_id, natureza')
      .gte('data_competencia', inicioDoHistorico),
    supabase
      .from('recorrencias')
      .select(
        'id, descricao, dia, regra_do_dia, comeca_em, termina_em, valor_previsto, tipo, natureza, conta_id',
      )
      .eq('ativo', true),
    lerConfig<{ mesTipico: number; mesRuim: number }>('sementes_renda'),
  ]);

  if (saldos.error) throw saldos.error;
  if (transacoes.error) throw transacoes.error;

  // Saldo disponível: mesma regra do consolidado, Empresa e dívida de fora (§2.6).
  const contasElegiveis = new Set(
    ((saldos.data ?? []) as { conta_id: string | null; conta_tipo: string | null; ativo: boolean | null }[])
      .filter(
        (linha) =>
          linha.ativo !== false &&
          !TIPOS_FORA_DO_CONSOLIDADO.includes(linha.conta_tipo as never),
      )
      .map((linha) => linha.conta_id)
      .filter((id): id is string => id !== null),
  );

  const saldoAtual = ((saldos.data ?? []) as { conta_id: string | null; saldo_atual: number | null }[])
    .filter((linha) => linha.conta_id !== null && contasElegiveis.has(linha.conta_id))
    .reduce((total, linha) => total + paraCentavos(linha.saldo_atual ?? 0), 0);

  const naturezaDaCategoria = new Map(
    (categorias.data ?? []).map((c) => [c.id, c.natureza as Natureza | null]),
  );

  const linhas = (transacoes.data ?? []) as LinhaDeTransacao[];
  const naturezaEfetiva = (linha: LinhaDeTransacao): Natureza | null =>
    (linha.natureza as Natureza | null) ??
    (linha.categoria_id ? (naturezaDaCategoria.get(linha.categoria_id) ?? null) : null);

  // --- histórico de renda -----------------------------------------------
  // Só receita fixa e variável. Venda de bem, reembolso e restituição ficam
  // fora: são altas, isoladas, e puxariam a mediana para cima (§2.7).
  const rendaPorMes = new Map<string, Centavos>();
  const variavelPorMes = new Map<string, Centavos>();

  for (const linha of linhas) {
    if (linha.tipo === 'transferencia') continue;
    if (linha.data_competencia > referencia) continue;

    const mes = linha.data_competencia.slice(0, 7);
    const natureza = naturezaEfetiva(linha);
    const valor = paraCentavos(linha.valor);

    if (linha.tipo === 'receita' && entraNaProjecaoDeRenda(natureza)) {
      rendaPorMes.set(mes, (rendaPorMes.get(mes) ?? 0) + valor);
    }

    if (linha.tipo === 'despesa' && natureza === 'variavel') {
      variavelPorMes.set(mes, (variavelPorMes.get(mes) ?? 0) + Math.abs(valor));
    }
  }

  // Mês corrente fica fora das medianas: ele está incompleto, e um mês pela
  // metade puxa a mediana para baixo como se fosse um mês magro de verdade.
  const mesCorrente = referencia.slice(0, 7);
  const historicoDeRenda = [...rendaPorMes.entries()]
    .filter(([mes]) => mes !== mesCorrente)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, valor]) => valor);

  const historicoDeVariaveis = [...variavelPorMes.entries()]
    .filter(([mes]) => mes !== mesCorrente)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, valor]) => valor);

  // --- fixas e provisão --------------------------------------------------
  //
  // Fixa com prazo entra numa lista à parte, não na soma mensal: financiamento
  // de 36x tem que sumir do mês 37, senão a projeção mostra o aperto de hoje
  // até o fim do horizonte e o alívio da última parcela — que é o que se quer
  // enxergar num fluxo de caixa — nunca aparece. Cada recorrência está em UMA
  // das duas, nunca nas duas.
  const despesasFixas = (recorrencias.data ?? []).filter((r) => r.tipo === 'despesa');

  const fixasMensais = despesasFixas
    .filter((r) => r.termina_em === null)
    .reduce((total, r) => total + Math.abs(paraCentavos(r.valor_previsto ?? 0)), 0);

  const fixasComPrazo = despesasFixas
    .filter((r) => r.termina_em !== null)
    .map((r) => ({
      valor: Math.abs(paraCentavos(r.valor_previsto ?? 0)),
      ate: r.termina_em!,
    }));

  // As dívidas entram aqui, e não como recorrência: a parcela de financiamento
  // não é despesa inteira (a amortização repaga gasto já contado), então ela não
  // pode virar lançamento de despesa todo mês. Mas ela É compromisso de caixa
  // com data para acabar, que é exatamente o que `fixasComPrazo` descreve.
  //
  // No SAC a parcela cai ao longo do tempo e aqui entra a PRÓXIMA, constante até
  // o fim: erra para mais nos últimos anos, que é o lado seguro de errar numa
  // projeção (§8.2).
  for (const item of await listarDividas()) {
    if (item.resumo.proxima === null) continue;
    fixasComPrazo.push({
      valor: item.resumo.proxima.valor,
      ate: somarMeses(item.divida.primeiraParcela, item.divida.parcelas - 1),
    });
  }

  // Fonte de renda fixa vira recorrência de receita (§4.5), e o §4.5 promete que
  // ela entra na projeção desde o primeiro dia. Só vale enquanto não há
  // histórico: depois, a própria recorrência já gerou os lançamentos.
  const rendaFixaMensal = (recorrencias.data ?? [])
    .filter((r) => r.tipo === 'receita')
    .reduce((total, r) => total + Math.abs(paraCentavos(r.valor_previsto ?? 0)), 0);

  // Provisão de eventual: o gasto eventual dos últimos 12 meses dividido por 12
  // (§2.5). Sem isso o IPVA de janeiro sempre parece um desastre.
  const eventualNoPeriodo = linhas
    .filter(
      (linha) =>
        linha.tipo === 'despesa' &&
        linha.data_competencia <= referencia &&
        naturezaEfetiva(linha) === 'eventual',
    )
    .reduce((total, linha) => total + Math.abs(paraCentavos(linha.valor)), 0);

  const provisaoEventualMensal = Math.round(eventualNoPeriodo / JANELA_DE_HISTORICO);

  // --- já lançado no futuro ---------------------------------------------
  // Parcelas e recorrências com data futura JÁ EXISTEM no banco (§13.2). São a
  // parte de confiança alta da projeção: fato consumado, não estimativa.
  const { data: futuras, error: erroFuturas } = await supabase
    .from('transacoes')
    .select('valor, data_caixa, tipo')
    .gt('data_caixa', referencia)
    .neq('tipo', 'transferencia');
  if (erroFuturas) throw erroFuturas;

  const jaLancadoPorMes: Record<DataISO, Centavos> = {};
  for (const linha of futuras ?? []) {
    if (linha.tipo !== 'despesa') continue;
    const mes = primeiroDiaDoMes(linha.data_caixa);
    jaLancadoPorMes[mes] = (jaLancadoPorMes[mes] ?? 0) + Math.abs(paraCentavos(linha.valor));
  }

  // --- o que ainda falta acontecer neste mês -----------------------------
  //
  // Duas metades, e elas não se sobrepõem: o que já está gravado com data à
  // frente (parcela, fatura, recorrência já gerada) e o que ainda nem virou
  // lançamento (recorrência cujo dia não chegou). `previstoDoMes` marca a
  // primeira como `lancado` e a tira da conta, então somar as duas não conta
  // nada duas vezes.
  // Cuidado: o `mesCorrente` lá de cima é "AAAA-MM", para comparar meses das
  // medianas. Aqui é preciso a data do dia 1º, que é o que as funções de
  // previsto esperam.
  const primeiroDiaDesteMes = primeiroDiaDoMes(referencia);

  const jaGravadoAindaNesteMes = (futuras ?? [])
    .filter((linha) => primeiroDiaDoMes(linha.data_caixa) === primeiroDiaDesteMes)
    .reduce(
      (total, linha) =>
        total + (linha.tipo === 'despesa' ? -Math.abs(paraCentavos(linha.valor)) : Math.abs(paraCentavos(linha.valor))),
      0,
    );

  const [ocorrencias, feriados, cartoes] = await Promise.all([
    // Dois meses para trás: a competência de uma compra de cartão fica no mês
    // anterior ao do vencimento, e é ela que diz se a ocorrência já foi gerada.
    ocorrenciasDoPeriodo(somarMeses(primeiroDiaDesteMes, -2), ultimoDiaDoMes(referencia)),
    listarFeriados(),
    supabase.from('cartoes').select('conta_id, dia_fechamento, dia_vencimento'),
  ]);

  const cartaoPorConta = new Map(
    (cartoes.data ?? []).map((c) => [
      c.conta_id,
      { diaFechamento: c.dia_fechamento, diaVencimento: c.dia_vencimento },
    ]),
  );

  // Por CAIXA, não por competência: `aindaNesteMes` responde quanto ainda se
  // mexe de dinheiro no mês, e recorrência no cartão só sai no vencimento da
  // fatura (§2.1, §2.4). Contá-la aqui adiantava a saída em semanas.
  const resumoDoPrevisto = resumirPrevisto(
    previstoNoCaixaDoMes(
      (recorrencias.data ?? []).map((r) => ({
        id: r.id,
        descricao: r.descricao,
        tipo: r.tipo as 'receita' | 'despesa',
        valorPrevisto: r.valor_previsto === null ? null : paraCentavos(r.valor_previsto),
        dia: r.dia,
        regra: r.regra_do_dia as RegraDoDia,
        comecaEm: r.comeca_em,
        terminaEm: r.termina_em,
        cartao: cartaoPorConta.get(r.conta_id) ?? null,
      })),
      ocorrencias.geradas,
      primeiroDiaDesteMes,
      referencia,
      feriados,
      ocorrencias.puladas,
    ),
  );

  const aindaNesteMes =
    jaGravadoAindaNesteMes + resumoDoPrevisto.faltaEntrar - resumoDoPrevisto.faltaSair;

  return {
    saldoAtual,
    renda: projetarRenda(
      historicoDeRenda,
      sementes ? { mesTipico: sementes.mesTipico, mesRuim: sementes.mesRuim } : null,
      rendaFixaMensal,
    ),
    fixasMensais,
    fixasComPrazo,
    provisaoEventualMensal,
    medianaDasVariaveis: mediana(historicoDeVariaveis) ?? 0,
    aindaNesteMes,
    jaLancadoPorMes,
    mesesDeHistorico: historicoDeRenda.length,
  };
}

/**
 * Faturas a vencer, para o dashboard (§11).
 *
 * A janela termina no fim do MÊS CORRENTE: a pergunta da tela inicial é o que
 * ainda sai neste mês, e faturas de outubro no meio de agosto viram cinco
 * linhas para ler antes de achar a que interessa.
 *
 * Para trás ela pega um mês de propósito, e isso continua: fatura vencida e não
 * paga é a informação mais urgente da tela, e escondê-la porque a data passou
 * seria o oposto do que serve.
 *
 * O total vem SOMADO das transações, nunca de `valor_total`: enquanto a fatura
 * está aberta a coluna vale zero, e a tela mostrava R$ 0,00 para fatura com
 * compra dentro (§13.2). Fatura sem nada dentro não volta daqui — nada a pagar
 * não é vencimento, é ruído.
 */
export async function proximosVencimentos(referencia: DataISO = hoje()) {
  const { data, error } = await supabase
    .from('faturas')
    .select('id, cartao_id, data_vencimento, status')
    .neq('status', 'paga')
    .gte('data_vencimento', somarDias(referencia, -30))
    .lte('data_vencimento', ultimoDiaDoMes(referencia))
    .order('data_vencimento');

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: linhas, error: erroLinhas } = await supabase
    .from('transacoes')
    .select('valor, fatura_id')
    .in(
      'fatura_id',
      data.map((f) => f.id),
    )
    // Filha de divisão não soma: o pai já está na fatura (§5.5).
    .is('transacao_pai_id', null);
  if (erroLinhas) throw erroLinhas;

  const total = new Map<string, number>();
  for (const linha of linhas ?? []) {
    if (linha.fatura_id === null) continue;
    total.set(linha.fatura_id, (total.get(linha.fatura_id) ?? 0) + paraCentavos(linha.valor));
  }

  return data
    .map((fatura) => ({
      id: fatura.id,
      cartaoId: fatura.cartao_id,
      vencimento: fatura.data_vencimento,
      total: total.get(fatura.id) ?? 0,
      status: fatura.status as 'aberta' | 'fechada',
      vencida: fatura.data_vencimento < referencia,
    }))
    .filter((fatura) => fatura.total !== 0);
}
