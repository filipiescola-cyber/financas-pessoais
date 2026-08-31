// Dívidas: financiamentos e empréstimos (§4.7).
//
// A tabela guarda o CONTRATO; o saldo devedor é calculado a cada leitura, a
// partir da tabela de amortização e de quantas parcelas já foram pagas (§13.2).
//
// A parcela mensal é uma recorrência comum — a mesma que aluguel e assinatura
// usam, com prazo. É ela que faz a dívida pesar no fluxo de caixa do §8 e
// sumir sozinha no mês da quitação. Aqui só se guarda o vínculo, para o
// cadastro criar as duas pontas de uma vez.

import { primeiroDiaDoMes, somarMeses, type DataISO } from '../dominio/datas';
import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import {
  resumoDaDivida,
  tabelaDeAmortizacao,
  type ParcelaDaDivida,
  type ResumoDaDivida,
  type SistemaDeAmortizacao,
} from '../dominio/divida';
import { criarRecorrencia } from './recorrencias';
import { supabase } from './supabase';

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
  recorrenciaId: string | null;
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
  recorrencia_id: string | null;
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
    recorrenciaId: linha.recorrencia_id,
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

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? [])
    .map(daLinha)
    .map((divida) => {
      const tabela = tabelaDeAmortizacao(
        divida.valorFinanciado,
        divida.taxaMensal,
        divida.parcelas,
        divida.sistema,
      );

      return {
        divida,
        tabela,
        resumo: resumoDaDivida(tabela, divida.parcelasPagas),
        quitacao: somarMeses(primeiroDiaDoMes(divida.primeiraParcela), divida.parcelas - 1),
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
 * Cadastra a dívida e, opcionalmente, a recorrência que lança a parcela.
 *
 * As duas pontas de uma vez porque separá-las é onde o usuário desiste: a
 * dívida sem recorrência não aparece no fluxo de caixa, e descobrir isso três
 * meses depois é descobrir que a projeção estava otimista o tempo todo.
 *
 * No SAC a parcela cai todo mês, então a recorrência entra sem valor previsto:
 * ela vira uma pendência de revisão, com o número certo à mão na tabela. Fixar
 * o valor da primeira faria a projeção errar para mais durante anos.
 */
export async function criarDivida(nova: NovaDivida): Promise<string> {
  const tabela = tabelaDeAmortizacao(
    nova.valorFinanciado,
    nova.taxaMensal,
    nova.parcelas,
    nova.sistema,
  );

  let recorrenciaId: string | null = null;

  if (nova.contaId) {
    const restantes = nova.parcelas - nova.parcelasPagas;
    const proxima = somarMeses(nova.primeiraParcela, nova.parcelasPagas);
    const ultima = somarMeses(nova.primeiraParcela, nova.parcelas - 1);
    const dia = Number(nova.primeiraParcela.slice(8, 10));

    if (restantes > 0) {
      recorrenciaId = await criarRecorrencia({
        descricao: nova.nome,
        valorPrevisto: nova.sistema === 'price' ? (tabela[0]?.valor ?? 0) : null,
        categoriaId: nova.categoriaId ?? null,
        contaId: nova.contaId,
        tipo: 'despesa',
        natureza: 'fixa',
        dia,
        regra: 'fixo',
        comecaEm: proxima,
        terminaEm: ultima,
      });
    }
  }

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
      recorrencia_id: recorrenciaId,
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
