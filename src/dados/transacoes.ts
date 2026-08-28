// Gravação e leitura de transações (§2, §5).
//
// Regras de sinal e data, que valem para tudo daqui para baixo:
//
//   valor negativo = saída, positivo = entrada (§3)
//   data_competencia = quando o fato aconteceu
//   data_caixa       = quando o dinheiro se move de fato (§2.4)
//
// Para compra no cartão as duas datas são DIFERENTES: a despesa acontece no dia
// da compra, mas o dinheiro só sai no vencimento da fatura (§2.1). É por isso
// que uma compra no cartão não derruba o saldo da conta corrente hoje.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje as hojeISO, type DataISO } from '../dominio/datas';
import { faturaEscolhida, type ConfiguracaoDoCartao } from '../dominio/fatura';
import type { Natureza } from '../dominio/natureza';
import { gerarParcelas, gerarParcelasRestantes } from '../dominio/parcelas';
import { idDaFatura, idsDasFaturas } from './faturas';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];
type LinhaTransacao = Database['public']['Tables']['transacoes']['Row'];

export type TipoDeLancamento = 'receita' | 'despesa';
export type MotivoEmpresa = 'investimento' | 'giro' | 'subsidio' | 'devolucao';

export type Transacao = {
  id: string;
  contaId: string;
  categoriaId: string | null;
  descricao: string | null;
  valor: Centavos;
  tipo: 'receita' | 'despesa' | 'transferencia';
  dataCompetencia: DataISO;
  dataCaixa: DataISO;
  grupoParcelamentoId: string | null;
  parcelaNum: number | null;
  parcelaTotal: number | null;
  transferenciaParId: string | null;
  transacaoPaiId: string | null;
  faturaId: string | null;
  motivoEmpresa: MotivoEmpresa | null;
  /** Sobrescreve a natureza da categoria (§2.5). Null = herda da categoria. */
  natureza: Natureza | null;
  revisado: boolean;
};

function daLinha(linha: LinhaTransacao): Transacao {
  return {
    id: linha.id,
    contaId: linha.conta_id,
    categoriaId: linha.categoria_id,
    descricao: linha.descricao,
    valor: paraCentavos(linha.valor),
    tipo: linha.tipo as Transacao['tipo'],
    dataCompetencia: linha.data_competencia,
    dataCaixa: linha.data_caixa,
    grupoParcelamentoId: linha.grupo_parcelamento_id,
    parcelaNum: linha.parcela_num,
    parcelaTotal: linha.parcela_total,
    transferenciaParId: linha.transferencia_par_id,
    transacaoPaiId: linha.transacao_pai_id,
    faturaId: linha.fatura_id,
    motivoEmpresa: linha.motivo_empresa as MotivoEmpresa | null,
    natureza: linha.natureza as Natureza | null,
    revisado: linha.revisado,
  };
}

export type NovoLancamento = {
  tipo: TipoDeLancamento;
  /** Sempre positivo. O sinal é decidido aqui, pelo tipo. */
  valor: Centavos;
  contaId: string;
  categoriaId: string | null;
  data: DataISO;
  descricao?: string | null;
  /** 1 = à vista. Acima disso gera N transações (§2.2). */
  parcelas?: number;
  /** Obrigatório quando a conta é cartão: define a data de caixa (§2.1). */
  cartao?: ConfiguracaoDoCartao | null;
  /**
   * Ajuste manual da fatura, em meses sobre a calculada (§2.1). O app acerta
   * quase sempre; quem tem a fatura na mão corrige o quase.
   */
  deslocamentoDeFatura?: number;
};

/**
 * Grava um lançamento comum. Devolve os ids criados — é o que o botão "desfazer"
 * usa para apagar tudo, inclusive as 12 parcelas de uma vez (§5.4).
 */
export async function criarLancamento(novo: NovoLancamento): Promise<string[]> {
  const sinal = novo.tipo === 'despesa' ? -1 : 1;
  const quantidade = Math.max(1, Math.trunc(novo.parcelas ?? 1));
  const total = sinal * Math.abs(novo.valor);

  const parcelas = gerarParcelas(total, quantidade, novo.data);
  const grupo = quantidade > 1 ? crypto.randomUUID() : null;

  // Cada parcela pode cair numa fatura diferente (§2.2). As faturas são criadas
  // sob demanda: parcelamento longo passa da janela de 12 meses.
  const faturas = novo.cartao
    ? await idsDasFaturas(
        novo.contaId,
        parcelas.map((p) => p.dataCompetencia),
        novo.cartao,
        novo.deslocamentoDeFatura ?? 0,
      )
    : null;

  const linhas: InsercaoTransacao[] = parcelas.map((parcela) => ({
    conta_id: novo.contaId,
    categoria_id: novo.categoriaId,
    descricao: novo.descricao?.trim() || null,
    valor: paraNumerico(parcela.valor),
    tipo: novo.tipo,
    data_competencia: parcela.dataCompetencia,
    data_caixa: dataDeCaixa(parcela.dataCompetencia, novo.cartao, novo.deslocamentoDeFatura ?? 0),
    fatura_id: faturas?.get(parcela.dataCompetencia) ?? null,
    grupo_parcelamento_id: grupo,
    parcela_num: quantidade > 1 ? parcela.numero : null,
    parcela_total: quantidade > 1 ? parcela.total : null,
    origem: quantidade > 1 ? 'parcelamento' : 'manual',
    revisado: true,
  }));

  const { data, error } = await supabase.from('transacoes').insert(linhas).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((linha) => linha.id);
}

/**
 * No cartão, o dinheiro sai no vencimento da fatura em que a compra caiu (§2.1).
 * Sem isso a compra derrubaria o saldo no dia, que é o erro que o §2.1 combate.
 * A fatura em si (fatura_id) só é preenchida na Fase 2.
 */
function dataDeCaixa(
  competencia: DataISO,
  cartao: ConfiguracaoDoCartao | null | undefined,
  deslocamento = 0,
): DataISO {
  if (!cartao) return competencia;
  return faturaEscolhida(competencia, cartao, deslocamento).dataVencimento;
}

export type NovaTransferencia = {
  valor: Centavos;
  contaOrigemId: string;
  contaDestinoId: string;
  data: DataISO;
  descricao?: string | null;
  /** Só quando uma das pontas é a conta Empresa (§2.6). */
  motivoEmpresa?: MotivoEmpresa | null;
};

/**
 * Transferência entre contas próprias (§2.3): dois lançamentos ligados.
 * Nunca conta como receita nem como despesa — só move saldo.
 *
 * É também como se registra dinheiro indo para a empresa (§2.6): comprar
 * insumo com o cartão pessoal NÃO é despesa pessoal, é transferência.
 */
export async function criarTransferencia(nova: NovaTransferencia): Promise<string[]> {
  const valor = Math.abs(nova.valor);
  const comum = {
    tipo: 'transferencia' as const,
    data_competencia: nova.data,
    data_caixa: nova.data,
    descricao: nova.descricao?.trim() || null,
    motivo_empresa: nova.motivoEmpresa ?? null,
    origem: 'manual' as const,
    revisado: true,
  };

  const { data, error } = await supabase
    .from('transacoes')
    .insert([
      { ...comum, conta_id: nova.contaOrigemId, valor: paraNumerico(-valor) },
      { ...comum, conta_id: nova.contaDestinoId, valor: paraNumerico(valor) },
    ])
    .select('id');

  if (error) throw new Error(error.message);

  const [saida, entrada] = data ?? [];
  if (!saida || !entrada) throw new Error('Transferência gravada pela metade.');

  // Liga uma ponta na outra. Se este passo falhar, os dois lançamentos existem e
  // o saldo está certo; só o vínculo fica faltando — preferível a desfazer tudo.
  await Promise.all([
    supabase.from('transacoes').update({ transferencia_par_id: entrada.id }).eq('id', saida.id),
    supabase.from('transacoes').update({ transferencia_par_id: saida.id }).eq('id', entrada.id),
  ]);

  return [saida.id, entrada.id];
}

/** Desfazer (§5.4): apaga o que acabou de ser criado, inclusive as N parcelas. */
export async function excluirTransacoes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('transacoes').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function listarTransacoes(filtros: {
  de: DataISO;
  ate: DataISO;
  contaId?: string | null;
  categoriaId?: string | null;
  /**
   * Qual das duas datas filtra o mês (§2.4). `competencia` responde "o que
   * aconteceu em agosto"; `caixa`, "o que saiu da conta em agosto" — e as duas
   * trazem listas diferentes, porque compra de cartão tem as datas separadas
   * por semanas.
   */
  porData?: 'competencia' | 'caixa';
}): Promise<Transacao[]> {
  const coluna = filtros.porData === 'caixa' ? 'data_caixa' : 'data_competencia';

  let consulta = supabase
    .from('transacoes')
    .select('*')
    .gte(coluna, filtros.de)
    .lte(coluna, filtros.ate)
    .order(coluna, { ascending: false })
    .order('created_at', { ascending: false });

  if (filtros.contaId) consulta = consulta.eq('conta_id', filtros.contaId);
  if (filtros.categoriaId) consulta = consulta.eq('categoria_id', filtros.categoriaId);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map(daLinha);
}

/**
 * Categorias mais usadas nos últimos 30 dias, por frequência real (§5.1).
 * A contagem é feita no cliente: são poucos lançamentos por mês e isso evita
 * uma função no banco só para ordenar oito chips.
 */
export async function categoriasMaisUsadas(desde: DataISO, tipo: TipoDeLancamento) {
  const { data, error } = await supabase
    .from('transacoes')
    .select('categoria_id')
    .gte('data_competencia', desde)
    .eq('tipo', tipo)
    .not('categoria_id', 'is', null);

  if (error) throw error;

  const contagem = new Map<string, number>();
  for (const linha of data ?? []) {
    if (!linha.categoria_id) continue;
    contagem.set(linha.categoria_id, (contagem.get(linha.categoria_id) ?? 0) + 1);
  }

  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([categoriaId, vezes]) => ({ categoriaId, vezes }));
}

/**
 * Memória de autocomplete (§5.2). A LEITURA é da Fase 3, mas a escrita começa
 * agora: se a memória não encher desde o primeiro lançamento, o recurso nasce
 * inútil no mês 3, que é justamente quando ele deveria estar sustentando o hábito.
 */
export async function registrarDescricao(
  descricao: string | null | undefined,
  categoriaId: string | null,
  contaId: string,
): Promise<void> {
  const texto = descricao?.trim();
  if (!texto) return;

  const { data } = await supabase
    .from('memoria_descricao')
    .select('id, vezes_usada')
    .eq('descricao', texto)
    .maybeSingle();

  if (data) {
    await supabase
      .from('memoria_descricao')
      .update({
        vezes_usada: data.vezes_usada + 1,
        ultimo_uso: new Date().toISOString(),
        categoria_id: categoriaId,
        conta_id: contaId,
      })
      .eq('id', data.id);
    return;
  }

  await supabase.from('memoria_descricao').insert({
    descricao: texto,
    categoria_id: categoriaId,
    conta_id: contaId,
  });
}

export type EscopoDeParcelamento = 'esta' | 'esta-e-futuras' | 'todas';

/**
 * Excluir parcelamento oferece três escopos (§2.2). Nunca decidir sozinho:
 * apagar as 12 parcelas quando o usuário queria corrigir uma é destrutivo e
 * silencioso.
 */
export async function excluirParcelamento(
  grupoId: string,
  escopo: EscopoDeParcelamento,
  competenciaDaParcela: DataISO,
): Promise<void> {
  let consulta = supabase.from('transacoes').delete().eq('grupo_parcelamento_id', grupoId);

  if (escopo === 'esta') {
    consulta = consulta.eq('data_competencia', competenciaDaParcela);
  } else if (escopo === 'esta-e-futuras') {
    consulta = consulta.gte('data_competencia', competenciaDaParcela);
  }

  const { error } = await consulta;
  if (error) throw new Error(error.message);
}

/**
 * Exclui uma transação avulsa. Transferência apaga as duas pontas: deixar uma
 * sozinha desequilibra dois saldos de uma vez (§2.3).
 */
export async function excluirTransacao(transacao: Transacao): Promise<void> {
  const ids = [transacao.id];
  if (transacao.transferenciaParId) ids.push(transacao.transferenciaParId);
  await excluirTransacoes(ids);
}

export async function marcarRevisado(id: string, revisado: boolean): Promise<void> {
  const { error } = await supabase.from('transacoes').update({ revisado }).eq('id', id);
  if (error) throw new Error(error.message);
}

export type ParcelamentoEmAndamento = {
  contaId: string;
  categoriaId: string | null;
  descricao: string;
  /** Valor de UMA parcela, informado pelo usuário. Aqui não se divide nada. */
  valorDaParcela: Centavos;
  jaPagas: number;
  totalDeParcelas: number;
  competenciaDaProxima: DataISO;
  cartao?: ConfiguracaoDoCartao | null;
};

/**
 * Parcelamento que já estava rolando quando o app começou (§4.1, passo 5).
 *
 * É o passo mais importante do onboarding: sem ele os próximos meses aparecem
 * artificialmente baratos e a projeção do §8 não serve para nada. Só as parcelas
 * RESTANTES são geradas — as já pagas aconteceram antes da data de corte.
 */
export async function criarParcelamentoEmAndamento(
  dados: ParcelamentoEmAndamento,
): Promise<string[]> {
  const parcelas = gerarParcelasRestantes(
    -Math.abs(dados.valorDaParcela),
    dados.jaPagas,
    dados.totalDeParcelas,
    dados.competenciaDaProxima,
  );

  const grupo = crypto.randomUUID();
  const faturas = dados.cartao
    ? await idsDasFaturas(
        dados.contaId,
        parcelas.map((p) => p.dataCompetencia),
        dados.cartao,
      )
    : null;

  const linhas: InsercaoTransacao[] = parcelas.map((parcela) => ({
    conta_id: dados.contaId,
    categoria_id: dados.categoriaId,
    descricao: dados.descricao.trim() || null,
    valor: paraNumerico(parcela.valor),
    tipo: 'despesa',
    data_competencia: parcela.dataCompetencia,
    data_caixa: dataDeCaixa(parcela.dataCompetencia, dados.cartao),
    fatura_id: faturas?.get(parcela.dataCompetencia) ?? null,
    grupo_parcelamento_id: grupo,
    parcela_num: parcela.numero,
    parcela_total: parcela.total,
    origem: 'parcelamento',
    revisado: true,
  }));

  const { data, error } = await supabase.from('transacoes').insert(linhas).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((linha) => linha.id);
}

export type CamposEditaveis = {
  valor?: Centavos;
  categoriaId?: string | null;
  descricao?: string | null;
  data?: DataISO;
  contaId?: string;
};

type AtualizacaoTransacao = Database['public']['Tables']['transacoes']['Update'];

function montarAtualizacao(
  campos: CamposEditaveis,
  tipo: 'receita' | 'despesa' | 'transferencia',
  cartao?: ConfiguracaoDoCartao | null,
): AtualizacaoTransacao {
  const atualizacao: AtualizacaoTransacao = {};

  if (campos.valor !== undefined) {
    // O sinal continua vindo do tipo: editar valor nunca transforma despesa em
    // receita por acidente.
    const sinal = tipo === 'receita' ? 1 : -1;
    atualizacao.valor = paraNumerico(sinal * Math.abs(campos.valor));
  }
  if (campos.categoriaId !== undefined) atualizacao.categoria_id = campos.categoriaId;
  if (campos.descricao !== undefined) atualizacao.descricao = campos.descricao?.trim() || null;
  if (campos.contaId !== undefined) atualizacao.conta_id = campos.contaId;
  if (campos.data !== undefined) {
    atualizacao.data_competencia = campos.data;
    atualizacao.data_caixa = dataDeCaixa(campos.data, cartao);
  }

  return atualizacao;
}

export async function atualizarTransacao(
  transacao: Transacao,
  campos: CamposEditaveis,
  cartao?: ConfiguracaoDoCartao | null,
): Promise<void> {
  const atualizacao = montarAtualizacao(campos, transacao.tipo, cartao);
  if (Object.keys(atualizacao).length === 0) return;

  const { error } = await supabase.from('transacoes').update(atualizacao).eq('id', transacao.id);
  if (error) throw new Error(error.message);

  // Transferência tem duas pontas ligadas (§2.3): valor, data e descrição
  // precisam andar juntos, senão os dois saldos ficam errados de uma vez.
  if (transacao.transferenciaParId) {
    const espelho: AtualizacaoTransacao = { ...atualizacao };
    delete espelho.conta_id;
    if (atualizacao.valor !== undefined) espelho.valor = -Number(atualizacao.valor);
    const { error: erroEspelho } = await supabase
      .from('transacoes')
      .update(espelho)
      .eq('id', transacao.transferenciaParId);
    if (erroEspelho) throw new Error(erroEspelho.message);
  }
}

/**
 * Editar parcelamento oferece os mesmos três escopos da exclusão (§2.2).
 * A data fica de fora do escopo múltiplo: cada parcela tem a sua, e mudar todas
 * para a mesma data destruiria o parcelamento.
 */
export async function atualizarParcelamento(
  grupoId: string,
  escopo: EscopoDeParcelamento,
  competenciaDaParcela: DataISO,
  campos: Omit<CamposEditaveis, 'data'>,
  tipo: 'receita' | 'despesa' | 'transferencia',
): Promise<void> {
  const atualizacao = montarAtualizacao(campos, tipo);
  if (Object.keys(atualizacao).length === 0) return;

  let consulta = supabase.from('transacoes').update(atualizacao).eq('grupo_parcelamento_id', grupoId);

  if (escopo === 'esta') {
    consulta = consulta.eq('data_competencia', competenciaDaParcela);
  } else if (escopo === 'esta-e-futuras') {
    consulta = consulta.gte('data_competencia', competenciaDaParcela);
  }

  const { error } = await consulta;
  if (error) throw new Error(error.message);
}

/** Transações de uma fatura, inclusive as futuras (§13.2). */
export async function listarTransacoesDaFatura(faturaId: string): Promise<Transacao[]> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('*')
    .eq('fatura_id', faturaId)
    .order('data_competencia', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(daLinha);
}

/**
 * Duplicar (§5.2): repete um lançamento com a data de hoje. Dois toques.
 *
 * Não copia o que é identidade do lançamento original: parcelamento,
 * recorrência, fatura e vínculo de transferência ficam de fora. Duplicar a
 * parcela 3/12 cria um gasto avulso, não uma décima terceira parcela.
 */
export async function duplicarTransacao(
  transacao: Transacao,
  cartao?: ConfiguracaoDoCartao | null,
): Promise<string[]> {
  const data = hojeISO();

  const linha: InsercaoTransacao = {
    conta_id: transacao.contaId,
    categoria_id: transacao.categoriaId,
    descricao: transacao.descricao,
    valor: paraNumerico(transacao.valor),
    tipo: transacao.tipo,
    data_competencia: data,
    data_caixa: dataDeCaixa(data, cartao),
    fatura_id: cartao ? await idDaFatura(transacao.contaId, data, cartao) : null,
    natureza: null,
    origem: 'manual',
    revisado: true,
  };

  const { data: criadas, error } = await supabase.from('transacoes').insert(linha).select('id');
  if (error) throw new Error(error.message);
  return (criadas ?? []).map((l) => l.id);
}

// ---------------------------------------------------------------- offline --
//
// Montagem das linhas SEM rede, para a fila de sincronização (Fase 8).
//
// Diferenças propositais em relação ao caminho online:
//   os ids saem daqui, o que torna o reenvio idempotente;
//   `fatura_id` fica nulo, porque descobrir a fatura exige consultar o banco —
//   o backfill da abertura resolve depois, de forma determinística (§13.3).

export function montarLinhasOffline(novo: NovoLancamento): InsercaoTransacao[] {
  const sinal = novo.tipo === 'despesa' ? -1 : 1;
  const quantidade = Math.max(1, Math.trunc(novo.parcelas ?? 1));
  const parcelas = gerarParcelas(sinal * Math.abs(novo.valor), quantidade, novo.data);
  const grupo = quantidade > 1 ? crypto.randomUUID() : null;

  return parcelas.map((parcela) => ({
    id: crypto.randomUUID(),
    conta_id: novo.contaId,
    categoria_id: novo.categoriaId,
    descricao: novo.descricao?.trim() || null,
    valor: paraNumerico(parcela.valor),
    tipo: novo.tipo,
    data_competencia: parcela.dataCompetencia,
    data_caixa: dataDeCaixa(parcela.dataCompetencia, novo.cartao),
    fatura_id: null,
    grupo_parcelamento_id: grupo,
    parcela_num: quantidade > 1 ? parcela.numero : null,
    parcela_total: quantidade > 1 ? parcela.total : null,
    origem: quantidade > 1 ? 'parcelamento' : 'manual',
    revisado: true,
  }));
}

export function montarLinhasDeTransferenciaOffline(nova: NovaTransferencia): InsercaoTransacao[] {
  const valor = Math.abs(nova.valor);
  // As duas pontas já nascem ligadas: offline não há um segundo passo para
  // amarrar o par, e transferência com uma ponta solta desequilibra dois saldos.
  const idSaida = crypto.randomUUID();
  const idEntrada = crypto.randomUUID();

  const comum = {
    tipo: 'transferencia' as const,
    data_competencia: nova.data,
    data_caixa: nova.data,
    descricao: nova.descricao?.trim() || null,
    motivo_empresa: nova.motivoEmpresa ?? null,
    origem: 'manual' as const,
    revisado: true,
  };

  return [
    {
      ...comum,
      id: idSaida,
      conta_id: nova.contaOrigemId,
      valor: paraNumerico(-valor),
      transferencia_par_id: idEntrada,
    },
    {
      ...comum,
      id: idEntrada,
      conta_id: nova.contaDestinoId,
      valor: paraNumerico(valor),
      transferencia_par_id: idSaida,
    },
  ];
}

/**
 * Movimentos de CAIXA do período, para a linha de saldo diário.
 *
 * É uma consulta separada da lista de lançamentos de propósito: a lista filtra
 * por competência e esta filtra por caixa. Uma compra no cartão feita em agosto
 * com fatura em setembro aparece na lista de agosto e no saldo de setembro —
 * unir as duas consultas produziria um saldo que não bate com o banco.
 */
export async function movimentosDeCaixa(filtros: {
  de: DataISO;
  ate: DataISO;
  contaId?: string | null;
  /** Sem conta escolhida, as mesmas contas que a função `saldo_ate` soma. */
  contasElegiveis?: readonly string[];
}) {
  let consulta = supabase
    .from('transacoes')
    .select('valor, data_caixa, transacao_pai_id')
    .gte('data_caixa', filtros.de)
    .lte('data_caixa', filtros.ate);

  if (filtros.contaId) {
    consulta = consulta.eq('conta_id', filtros.contaId);
  } else if (filtros.contasElegiveis) {
    // Sem esse recorte o saldo de abertura viria do consolidado e os movimentos
    // de todas as contas, incluindo Empresa e cartão — e a linha andaria
    // diferente do número que a abre.
    consulta = consulta.in('conta_id', [...filtros.contasElegiveis]);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    valor: paraCentavos(linha.valor),
    dataCaixa: linha.data_caixa,
    transacaoPaiId: linha.transacao_pai_id,
  }));
}

/** Acumulado até a data, pela função do banco. Ver a migration `saldo_ate`. */
export async function saldoAte(data: DataISO, contaId?: string | null): Promise<Centavos> {
  const { data: resultado, error } = await supabase.rpc('saldo_ate', {
    p_data: data,
    p_conta: contaId ?? undefined,
  });
  if (error) throw new Error(error.message);
  return paraCentavos(Number(resultado ?? 0));
}
