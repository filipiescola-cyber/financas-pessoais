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
import { hoje, primeiroDiaDoMes, somarDias, somarMeses, type DataISO } from '../dominio/datas';
import { mediana, projetarRenda, type RendaProjetada } from '../dominio/projecao';
import { entraNaProjecaoDeRenda, type Natureza } from '../dominio/natureza';
import { TIPOS_FORA_DO_CONSOLIDADO } from '../dominio/saldo';
import { lerConfig } from './config';
import { supabase } from './supabase';

const JANELA_DE_HISTORICO = 12;

export type DadosDaProjecao = {
  saldoAtual: Centavos;
  renda: RendaProjetada;
  fixasMensais: Centavos;
  provisaoEventualMensal: Centavos;
  medianaDasVariaveis: Centavos;
  jaLancadoPorMes: Record<DataISO, Centavos>;
  mesesDeHistorico: number;
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
    supabase.from('recorrencias').select('valor_previsto, tipo, natureza').eq('ativo', true),
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
  const fixasMensais = (recorrencias.data ?? [])
    .filter((r) => r.tipo === 'despesa')
    .reduce((total, r) => total + Math.abs(paraCentavos(r.valor_previsto ?? 0)), 0);

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

  return {
    saldoAtual,
    renda: projetarRenda(
      historicoDeRenda,
      sementes ? { mesTipico: sementes.mesTipico, mesRuim: sementes.mesRuim } : null,
      rendaFixaMensal,
    ),
    fixasMensais,
    provisaoEventualMensal,
    medianaDasVariaveis: mediana(historicoDeVariaveis) ?? 0,
    jaLancadoPorMes,
    mesesDeHistorico: historicoDeRenda.length,
  };
}

/**
 * Faturas a vencer, para o dashboard (§11).
 *
 * A janela pega um mês para trás de propósito: fatura vencida e não paga é a
 * informação mais urgente da tela, e escondê-la porque a data passou seria o
 * oposto do que serve.
 */
export async function proximosVencimentos(referencia: DataISO = hoje(), diasAFrente = 45) {
  const { data, error } = await supabase
    .from('faturas')
    .select('id, cartao_id, data_vencimento, valor_total, status')
    .neq('status', 'paga')
    .gte('data_vencimento', somarDias(referencia, -30))
    .lte('data_vencimento', somarDias(referencia, diasAFrente))
    .order('data_vencimento');

  if (error) throw error;

  return (data ?? []).map((fatura) => ({
    id: fatura.id,
    cartaoId: fatura.cartao_id,
    vencimento: fatura.data_vencimento,
    valorGravado: paraCentavos(fatura.valor_total),
    status: fatura.status as 'aberta' | 'fechada',
    vencida: fatura.data_vencimento < referencia,
  }));
}
