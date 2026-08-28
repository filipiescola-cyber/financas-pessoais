// Investimentos (§7).
//
// O saldo mostrado é ESTIMATIVA até ser conferido (§7.3, §14). O app calcula,
// o banco confirma — e a diferença aparece na tela em vez de ser escondida.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, type DataISO } from '../dominio/datas';
import { calcular, type Indexador, type Resultado } from '../dominio/rendimento';
import { listarFeriados, tabelaDeIR, taxasVigentes } from './indicadores';
import { supabase } from './supabase';

export type TipoDeInvestimento =
  | 'cdb' | 'tesouro' | 'lci' | 'lca' | 'poupanca' | 'fundo' | 'acoes' | 'cripto' | 'outro';

export type Investimento = {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: TipoDeInvestimento;
  indexador: Indexador | null;
  percentualIndexador: number | null;
  taxaPrefixada: number | null;
  dataAplicacao: DataISO;
  valorAplicado: Centavos;
  vencimento: DataISO | null;
  liquidezDiaria: boolean;
  isentoIR: boolean;
  calculoAutomatico: boolean;
  saldoManual: Centavos | null;
  saldoConferido: Centavos | null;
  dataConferencia: DataISO | null;
  ativo: boolean;
};

/** Isentos de IR para pessoa física (§7.2). */
export const TIPOS_ISENTOS: TipoDeInvestimento[] = ['lci', 'lca', 'poupanca'];

export const ROTULO_TIPO: Record<TipoDeInvestimento, string> = {
  cdb: 'CDB',
  tesouro: 'Tesouro Direto',
  lci: 'LCI',
  lca: 'LCA',
  poupanca: 'Poupança',
  fundo: 'Fundo',
  acoes: 'Ações / FII',
  cripto: 'Cripto',
  outro: 'Outro',
};

/** Renda variável não tem fórmula: o usuário atualiza o saldo na mão (§7.1). */
export const TIPOS_SEM_CALCULO: TipoDeInvestimento[] = ['acoes', 'cripto', 'fundo'];

export async function listarInvestimentos(incluirArquivados = false): Promise<Investimento[]> {
  let consulta = supabase.from('investimentos').select('*').order('data_aplicacao');
  if (!incluirArquivados) consulta = consulta.eq('ativo', true);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    instituicao: linha.instituicao,
    tipo: linha.tipo as TipoDeInvestimento,
    indexador: linha.indexador as Indexador | null,
    percentualIndexador: linha.percentual_indexador === null ? null : Number(linha.percentual_indexador),
    taxaPrefixada: linha.taxa_prefixada === null ? null : Number(linha.taxa_prefixada),
    dataAplicacao: linha.data_aplicacao,
    valorAplicado: paraCentavos(linha.valor_aplicado),
    vencimento: linha.vencimento,
    liquidezDiaria: linha.liquidez_diaria,
    isentoIR: linha.isento_ir,
    calculoAutomatico: linha.calculo_automatico,
    saldoManual: linha.saldo_manual === null ? null : paraCentavos(linha.saldo_manual),
    saldoConferido: linha.saldo_conferido === null ? null : paraCentavos(linha.saldo_conferido),
    dataConferencia: linha.data_conferencia,
    ativo: linha.ativo,
  }));
}

export type NovoInvestimento = {
  nome: string;
  instituicao?: string | null;
  tipo: TipoDeInvestimento;
  indexador: Indexador | null;
  percentualIndexador: number | null;
  taxaPrefixada: number | null;
  dataAplicacao: DataISO;
  valorAplicado: Centavos;
  vencimento?: DataISO | null;
  liquidezDiaria?: boolean;
};

export async function criarInvestimento(novo: NovoInvestimento): Promise<void> {
  const calculoAutomatico = !TIPOS_SEM_CALCULO.includes(novo.tipo);

  const { error } = await supabase.from('investimentos').insert({
    nome: novo.nome.trim(),
    instituicao: novo.instituicao?.trim() || null,
    tipo: novo.tipo,
    indexador: calculoAutomatico ? novo.indexador : null,
    percentual_indexador: novo.percentualIndexador,
    taxa_prefixada: novo.taxaPrefixada,
    data_aplicacao: novo.dataAplicacao,
    valor_aplicado: paraNumerico(novo.valorAplicado),
    vencimento: novo.vencimento ?? null,
    liquidez_diaria: novo.liquidezDiaria ?? true,
    isento_ir: TIPOS_ISENTOS.includes(novo.tipo),
    calculo_automatico: calculoAutomatico,
    // Renda variável começa valendo o que foi aplicado, até o usuário atualizar.
    saldo_manual: calculoAutomatico ? null : paraNumerico(novo.valorAplicado),
  });

  if (error) throw new Error(error.message);
}

export async function atualizarSaldoManual(id: string, saldo: Centavos): Promise<void> {
  const { error } = await supabase
    .from('investimentos')
    .update({ saldo_manual: paraNumerico(saldo) })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Conferência obrigatória (§7.3): o número real é o do banco, não o calculado. */
export async function conferirInvestimento(id: string, saldoReal: Centavos): Promise<void> {
  const { error } = await supabase
    .from('investimentos')
    .update({ saldo_conferido: paraNumerico(saldoReal), data_conferencia: hoje() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Arquiva, nunca exclui (§4.8).
 *
 * Aplicação resgatada não deixa de ter existido: o histórico de rendimento
 * dela e os aportes ligados ao caixa continuam valendo. Arquivar tira do
 * patrimônio e da lista; apagar reescreveria meses fechados.
 */
export async function arquivarInvestimento(id: string): Promise<void> {
  const { error } = await supabase.from('investimentos').update({ ativo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function desarquivarInvestimento(id: string): Promise<void> {
  const { error } = await supabase.from('investimentos').update({ ativo: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export type InvestimentoCalculado = {
  investimento: Investimento;
  resultado: Resultado | null;
  /** O que vale hoje: calculado, manual ou conferido. */
  saldoExibido: Centavos;
  /** Diferença entre o calculado e o último conferido, quando houver (§7.3). */
  divergencia: Centavos | null;
};

/**
 * Calcula todos os investimentos de uma vez.
 *
 * Uma leitura só de feriados, taxas e tabela de IR para o conjunto inteiro: são
 * os mesmos dados para todas as aplicações, e buscar por aplicação seria
 * desperdício num plano gratuito.
 */
export async function calcularTodos(ate: DataISO = hoje()): Promise<InvestimentoCalculado[]> {
  const [investimentos, feriados, taxas, tabela] = await Promise.all([
    listarInvestimentos(),
    listarFeriados(),
    taxasVigentes(),
    tabelaDeIR(),
  ]);

  return investimentos.map((investimento) => {
    if (!investimento.calculoAutomatico) {
      const saldo = investimento.saldoManual ?? investimento.valorAplicado;
      return {
        investimento,
        resultado: null,
        saldoExibido: saldo,
        divergencia: null,
      };
    }

    const taxaDoIndexador =
      investimento.indexador && investimento.indexador !== 'PREFIXADO'
        ? (taxas.get(investimento.indexador)?.taxaAnual ?? null)
        : null;

    const resultado = calcular(
      {
        valorAplicado: investimento.valorAplicado,
        dataAplicacao: investimento.dataAplicacao,
        indexador: investimento.indexador,
        percentualIndexador: investimento.percentualIndexador,
        taxaPrefixada: investimento.taxaPrefixada,
        isentoIR: investimento.isentoIR,
      },
      taxaDoIndexador,
      ate,
      feriados,
      tabela,
    );

    return {
      investimento,
      resultado,
      saldoExibido: resultado.saldoBruto,
      divergencia:
        investimento.saldoConferido === null
          ? null
          : resultado.saldoBruto - investimento.saldoConferido,
    };
  });
}
