// Recorrências (§5.2, §4.5).
//
// Nesta fase só o CADASTRO. A geração automática do lançamento no dia certo é
// da Fase 3 (§13.3) — e a tela diz isso, para não prometer lançamento que não vem.
//
// Fonte de renda fixa vira recorrência de receita (§4.5): nenhuma tabela nova,
// e já entra na projeção do §8 desde o primeiro dia.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, type DataISO } from '../dominio/datas';
import type { Natureza } from '../dominio/natureza';
import type { RegraDoDia } from '../dominio/recorrencias';
import { supabase } from './supabase';

export type Recorrencia = {
  id: string;
  descricao: string;
  valorPrevisto: Centavos | null;
  categoriaId: string | null;
  contaId: string;
  tipo: 'receita' | 'despesa';
  natureza: Natureza | null;
  frequencia: 'mensal' | 'semanal' | 'anual';
  dia: number;
  /** Com regra de dia útil, `dia` é ordinal e não data. */
  regra: RegraDoDia;
  /** Primeiro dia em que ela vale. Pode ser no futuro. */
  comecaEm: DataISO;
  /** Data da última ocorrência, quando a recorrência tem prazo. */
  terminaEm: DataISO | null;
  ativo: boolean;
};

export type NovaRecorrencia = {
  descricao: string;
  valorPrevisto: Centavos | null;
  categoriaId: string | null;
  contaId: string;
  tipo: 'receita' | 'despesa';
  natureza?: Natureza | null;
  frequencia?: 'mensal' | 'semanal' | 'anual';
  dia: number;
  regra?: RegraDoDia;
  comecaEm?: DataISO;
  terminaEm?: DataISO | null;
};

export async function listarRecorrencias(): Promise<Recorrencia[]> {
  const { data, error } = await supabase
    .from('recorrencias')
    .select('*')
    .eq('ativo', true)
    .order('dia');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    descricao: linha.descricao,
    valorPrevisto: linha.valor_previsto === null ? null : paraCentavos(linha.valor_previsto),
    categoriaId: linha.categoria_id,
    contaId: linha.conta_id,
    tipo: linha.tipo as 'receita' | 'despesa',
    natureza: linha.natureza as Natureza | null,
    frequencia: linha.frequencia as Recorrencia['frequencia'],
    dia: linha.dia,
    regra: linha.regra_do_dia as RegraDoDia,
    comecaEm: linha.comeca_em,
    terminaEm: linha.termina_em,
    ativo: linha.ativo,
  }));
}

export async function criarRecorrencia(nova: NovaRecorrencia): Promise<string> {
  const { data, error } = await supabase
    .from('recorrencias')
    .insert({
      descricao: nova.descricao.trim(),
      valor_previsto: nova.valorPrevisto === null ? null : paraNumerico(nova.valorPrevisto),
      categoria_id: nova.categoriaId,
      conta_id: nova.contaId,
      tipo: nova.tipo,
      // Despesa fixa e salário são, por definição, natureza fixa (§2.5).
      natureza: nova.natureza ?? 'fixa',
      frequencia: nova.frequencia ?? 'mensal',
      dia: nova.dia,
      regra_do_dia: nova.regra ?? 'fixo',
      comeca_em: nova.comecaEm ?? hoje(),
      termina_em: nova.terminaEm ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Desativa todas as recorrências de uma conta, para encerrá-la (§4.8).
 *
 * Recorrência apontando para conta encerrada geraria lançamento todo mês numa
 * conta morta, sozinha e sem ninguém ver. Desativar não apaga: o histórico do
 * que já foi gerado continua todo lá.
 */
export async function arquivarRecorrenciasDaConta(contaId: string): Promise<void> {
  const { error } = await supabase
    .from('recorrencias')
    .update({ ativo: false })
    .eq('conta_id', contaId)
    .eq('ativo', true);
  if (error) throw new Error(error.message);
}

export async function arquivarRecorrencia(id: string): Promise<void> {
  const { error } = await supabase.from('recorrencias').update({ ativo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
