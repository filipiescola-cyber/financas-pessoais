// Dívidas: financiamentos e empréstimos (§4.7).
//
// A tabela guarda o CONTRATO; o saldo devedor é calculado a cada leitura, a
// partir da tabela de amortização e de quantas parcelas já foram pagas (§13.2).
//
// A parcela mensal é uma recorrência comum — a mesma que aluguel e assinatura
// usam, com prazo. É ela que faz a dívida pesar no fluxo de caixa do §8 e
// sumir sozinha no mês da quitação. Aqui só se guarda o vínculo, para o
// cadastro criar as duas pontas de uma vez.

import { hoje, primeiroDiaDoMes, somarMeses, type DataISO } from '../dominio/datas';
import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import {
  resumoDaDivida,
  tabelaComAmortizacoes,
  tabelaDeAmortizacao,
  type AmortizacaoExtra,
  type ParcelaDaDivida,
  type ResumoDaDivida,
  type SistemaDeAmortizacao,
} from '../dominio/divida';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type InsercaoTransacao = Database['public']['Tables']['transacoes']['Insert'];

export type Divida = {
  id: string;
  nome: string;
  instituicao: string | null;
  cor: string | null;
  valorFinanciado: Centavos;
  taxaMensal: number;
  parcelas: number;
  sistema: SistemaDeAmortizacao;
  primeiraParcela: DataISO;
  parcelasPagas: number;
  contaId: string | null;
  categoriaJurosId: string | null;
  ativo: boolean;
};

export type DividaCalculada = {
  divida: Divida;
  tabela: ParcelaDaDivida[];
  resumo: ResumoDaDivida;
  /** Mês da última parcela. É a informação que ninguém sabe de cabeça (§4.7). */
  quitacao: DataISO;
};

function daLinha(linha: {
  id: string;
  nome: string;
  instituicao: string | null;
  cor: string | null;
  valor_financiado: number;
  taxa_mensal: number;
  parcelas: number;
  sistema: string;
  primeira_parcela: string;
  parcelas_pagas: number;
  conta_id: string | null;
  categoria_juros_id: string | null;
  ativo: boolean;
}): Divida {
  return {
    id: linha.id,
    nome: linha.nome,
    instituicao: linha.instituicao,
    cor: linha.cor,
    valorFinanciado: paraCentavos(linha.valor_financiado),
    taxaMensal: Number(linha.taxa_mensal),
    parcelas: linha.parcelas,
    sistema: linha.sistema as SistemaDeAmortizacao,
    primeiraParcela: linha.primeira_parcela,
    parcelasPagas: linha.parcelas_pagas,
    contaId: linha.conta_id,
    categoriaJurosId: linha.categoria_juros_id,
    ativo: linha.ativo,
  };
}

/**
 * As dívidas com tudo calculado, ordenadas pela TAXA (§4.7).
 *
 * Nunca por valor: a mais cara é a que se ataca primeiro, e ordenar pelo saldo
 * colocaria o financiamento do imóvel a 0,7% ao mês na frente do rotativo a
 * 14%, que é exatamente a decisão errada.
 */
export async function listarDividas(incluirQuitadas = false): Promise<DividaCalculada[]> {
  let consulta = supabase.from('dividas').select('*');
  if (!incluirQuitadas) consulta = consulta.eq('ativo', true);

  const [{ data, error }, extras] = await Promise.all([
    consulta,
    supabase
      .from('amortizacoes_divida')
      .select('divida_id, valor, apos_parcela, modo, parcelas_reduzidas'),
  ]);
  if (error) throw error;
  if (extras.error) throw extras.error;

  const porDivida = new Map<string, AmortizacaoExtra[]>();
  for (const linha of extras.data ?? []) {
    porDivida.set(linha.divida_id, [
      ...(porDivida.get(linha.divida_id) ?? []),
      {
        aposParcela: linha.apos_parcela,
        valor: paraCentavos(linha.valor),
        modo: linha.modo as 'prazo' | 'parcela',
        parcelasReduzidas: linha.parcelas_reduzidas,
      },
    ]);
  }

  return (data ?? [])
    .map(daLinha)
    .map((divida) => {
      const tabela = tabelaComAmortizacoes(
        divida.valorFinanciado,
        divida.taxaMensal,
        divida.parcelas,
        divida.sistema,
        porDivida.get(divida.id) ?? [],
      );

      return {
        divida,
        tabela,
        resumo: resumoDaDivida(tabela, divida.parcelasPagas),
        // Com amortização o prazo encurta, então a quitação vem do TAMANHO da
        // tabela — não mais do número de parcelas do contrato original.
        quitacao: somarMeses(
          primeiroDiaDoMes(divida.primeiraParcela),
          Math.max(0, tabela.length - 1),
        ),
      };
    })
    .sort((a, b) => b.divida.taxaMensal - a.divida.taxaMensal);
}

export type NovaDivida = {
  nome: string;
  instituicao?: string | null;
  cor?: string | null;
  valorFinanciado: Centavos;
  taxaMensal: number;
  parcelas: number;
  sistema: SistemaDeAmortizacao;
  primeiraParcela: DataISO;
  parcelasPagas: number;
  /** Conta de onde a parcela sai, quando se quer a recorrência automática. */
  contaId?: string | null;
  categoriaId?: string | null;
};

/**
 * Cadastra a dívida.
 *
 * Não cria recorrência: a parcela de um financiamento não é despesa inteira, e
 * uma recorrência de valor fixo não sabe dividi-la. Quem lança é `pagarParcela`,
 * que consulta a tabela de amortização.
 *
 * A dívida pesa no fluxo de caixa mesmo assim — a projeção lê as dívidas
 * diretamente, como compromisso com prazo (§8.2).
 */
export async function criarDivida(nova: NovaDivida): Promise<string> {
  const { data, error } = await supabase
    .from('dividas')
    .insert({
      nome: nova.nome.trim(),
      instituicao: nova.instituicao?.trim() || null,
      cor: nova.cor ?? null,
      valor_financiado: paraNumerico(nova.valorFinanciado),
      taxa_mensal: nova.taxaMensal,
      parcelas: nova.parcelas,
      sistema: nova.sistema,
      primeira_parcela: nova.primeiraParcela,
      parcelas_pagas: nova.parcelasPagas,
      conta_id: nova.contaId ?? null,
      categoria_juros_id: nova.categoriaId ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

/** Registrar que mais uma parcela foi paga. É o que move o saldo devedor. */
export async function atualizarParcelasPagas(id: string, pagas: number): Promise<void> {
  const { error } = await supabase
    .from('dividas')
    .update({ parcelas_pagas: Math.max(0, Math.trunc(pagas)) })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Paga a próxima parcela, em DUAS linhas (§2.1, §14).
 *
 * A amortização sai como transferência: ela repaga um gasto que já foi contado
 * quando a compra aconteceu, e lançá-la como despesa dobraria o mês — é o mesmo
 * defeito que o §14 proíbe para pagamento de fatura.
 *
 * Os juros saem como despesa, porque são custo novo: é o preço do dinheiro, e o
 * único pedaço da parcela que merece aparecer num relatório de gasto.
 *
 * Sem conta cadastrada, nenhuma linha é gravada: só o contador anda. É o caso
 * de quem acompanha a dívida sem lançar o pagamento no app.
 */
export async function pagarParcela(dividaId: string, data: DataISO = hoje()): Promise<void> {
  const { data: linha, error } = await supabase
    .from('dividas')
    .select('*')
    .eq('id', dividaId)
    .single();
  if (error) throw new Error(error.message);

  const divida = daLinha(linha);
  const tabela = tabelaDeAmortizacao(
    divida.valorFinanciado,
    divida.taxaMensal,
    divida.parcelas,
    divida.sistema,
  );

  const proxima = tabela[divida.parcelasPagas];
  if (!proxima) throw new Error('Esta dívida já está quitada.');

  if (divida.contaId) {
    const comum = {
      conta_id: divida.contaId,
      data_competencia: data,
      data_caixa: data,
      origem: 'manual' as const,
      revisado: true,
      // A ponta que permite desfazer sem deixar lançamento órfão.
      divida_id: dividaId,
      divida_parcela: proxima.numero,
    };

    const linhas: InsercaoTransacao[] = [
      {
        ...comum,
        valor: paraNumerico(-proxima.amortizacao),
        tipo: 'transferencia',
        descricao: `${divida.nome} — parcela ${proxima.numero}/${divida.parcelas}`,
      },
    ];

    if (proxima.juros > 0) {
      linhas.push({
        ...comum,
        valor: paraNumerico(-proxima.juros),
        tipo: 'despesa',
        categoria_id: divida.categoriaJurosId,
        descricao: `${divida.nome} — juros da ${proxima.numero}ª`,
      });
    }

    const { error: erroLinhas } = await supabase.from('transacoes').insert(linhas);
    if (erroLinhas) throw new Error(erroLinhas.message);
  }

  await atualizarParcelasPagas(dividaId, divida.parcelasPagas + 1);
}

/**
 * Desfaz a última parcela paga: apaga os lançamentos dela e volta o contador.
 *
 * Voltar só o contador deixaria as duas linhas para trás, e o mesmo dinheiro
 * passaria a existir como saldo devedor E como lançamento na conta — a família
 * de defeito que já apareceu na fatura paga sem pagamento e no aporte que sumia
 * sozinho.
 */
export async function desfazerParcela(dividaId: string): Promise<void> {
  const { data: divida, error } = await supabase
    .from('dividas')
    .select('parcelas_pagas')
    .eq('id', dividaId)
    .single();
  if (error) throw new Error(error.message);
  if (divida.parcelas_pagas <= 0) throw new Error('Nenhuma parcela paga para desfazer.');

  const { error: erroApagar } = await supabase
    .from('transacoes')
    .delete()
    .eq('divida_id', dividaId)
    .eq('divida_parcela', divida.parcelas_pagas);
  if (erroApagar) throw new Error(erroApagar.message);

  await atualizarParcelasPagas(dividaId, divida.parcelas_pagas - 1);
}

/**
 * Amortização extraordinária: dinheiro a mais, fora da parcela (§4.7).
 *
 * O lançamento é UMA linha de transferência, não duas: aqui não há juros. O
 * extra abate principal puro — que é exatamente por isso que ele compensa, e
 * por isso que a parcela normal, essa sim, se divide em amortização e juros.
 *
 * `parcelasReduzidas` vem do banco. Cada instituição arredonda de um jeito, e
 * recalcular por fora daria um cronograma que não bate com o extrato.
 */
export async function amortizarDivida(dados: {
  dividaId: string;
  valor: Centavos;
  data: DataISO;
  modo: 'prazo' | 'parcela';
  parcelasReduzidas: number;
}): Promise<void> {
  const { data: linha, error } = await supabase
    .from('dividas')
    .select('nome, conta_id, parcelas_pagas')
    .eq('id', dados.dividaId)
    .single();
  if (error) throw new Error(error.message);

  let transacaoId: string | null = null;

  if (linha.conta_id) {
    const { data: criada, error: erroLancamento } = await supabase
      .from('transacoes')
      .insert({
        conta_id: linha.conta_id,
        valor: paraNumerico(-Math.abs(dados.valor)),
        // Transferência, não despesa: abate principal de um gasto já contado.
        tipo: 'transferencia',
        data_competencia: dados.data,
        data_caixa: dados.data,
        descricao: `${linha.nome} — amortização`,
        origem: 'manual',
        revisado: true,
        divida_id: dados.dividaId,
      })
      .select('id')
      .single();
    if (erroLancamento) throw new Error(erroLancamento.message);
    transacaoId = criada.id;
  }

  const { error: erroAmortizacao } = await supabase.from('amortizacoes_divida').insert({
    divida_id: dados.dividaId,
    valor: paraNumerico(Math.abs(dados.valor)),
    data: dados.data,
    // Ela entra depois da última parcela paga: é onde o contrato é refeito.
    apos_parcela: linha.parcelas_pagas,
    modo: dados.modo,
    parcelas_reduzidas: dados.modo === 'prazo' ? Math.max(0, dados.parcelasReduzidas) : 0,
    transacao_id: transacaoId,
  });
  if (erroAmortizacao) throw new Error(erroAmortizacao.message);
}

export type AmortizacaoRegistrada = {
  id: string;
  valor: Centavos;
  data: DataISO;
  modo: 'prazo' | 'parcela';
  parcelasReduzidas: number;
};

export async function listarAmortizacoes(dividaId: string): Promise<AmortizacaoRegistrada[]> {
  const { data, error } = await supabase
    .from('amortizacoes_divida')
    .select('id, valor, data, modo, parcelas_reduzidas')
    .eq('divida_id', dividaId)
    .order('data');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    valor: paraCentavos(linha.valor),
    data: linha.data,
    modo: linha.modo as 'prazo' | 'parcela',
    parcelasReduzidas: linha.parcelas_reduzidas,
  }));
}

/** Desfaz uma amortização, apagando o lançamento junto. */
export async function excluirAmortizacao(id: string): Promise<void> {
  const { data: linha } = await supabase
    .from('amortizacoes_divida')
    .select('transacao_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('amortizacoes_divida').delete().eq('id', id);
  if (error) throw new Error(error.message);

  if (linha?.transacao_id) {
    await supabase.from('transacoes').delete().eq('id', linha.transacao_id);
  }
}

export async function quitarDivida(id: string, data: DataISO): Promise<void> {
  const { error } = await supabase
    .from('dividas')
    .update({ ativo: false, quitada_em: data })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirDivida(id: string): Promise<void> {
  const { error } = await supabase.from('dividas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
