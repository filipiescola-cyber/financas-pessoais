// Orçamentos e metas (§8.6, §8.8) e conferência de saldo (§5.3).

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, type DataISO } from '../dominio/datas';
import { supabase } from './supabase';

export type Orcamento = {
  id: string;
  mesReferencia: DataISO;
  categoriaId: string;
  valorPlanejado: Centavos;
};

export async function listarOrcamentos(mes: DataISO): Promise<Orcamento[]> {
  const { data, error } = await supabase
    .from('orcamentos')
    .select('*')
    .eq('mes_referencia', primeiroDiaDoMes(mes));
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    mesReferencia: linha.mes_referencia,
    categoriaId: linha.categoria_id,
    valorPlanejado: paraCentavos(linha.valor_planejado),
  }));
}

/** Teto por categoria por mês. Definir zero remove o teto. */
export async function definirTeto(
  mes: DataISO,
  categoriaId: string,
  valor: Centavos,
): Promise<void> {
  const mesReferencia = primeiroDiaDoMes(mes);

  if (valor <= 0) {
    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('mes_referencia', mesReferencia)
      .eq('categoria_id', categoriaId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('orcamentos').upsert(
    {
      mes_referencia: mesReferencia,
      categoria_id: categoriaId,
      valor_planejado: paraNumerico(valor),
    },
    { onConflict: 'mes_referencia,categoria_id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * Copia os tetos de um mês para outro. Orçamento muda pouco de mês a mês, e
 * redigitar tudo todo mês é o tipo de atrito que faz a funcionalidade morrer.
 */
export async function copiarOrcamentoDoMesAnterior(
  mesDestino: DataISO,
  mesOrigem: DataISO,
): Promise<number> {
  const origem = await listarOrcamentos(mesOrigem);
  if (origem.length === 0) return 0;

  const { error } = await supabase.from('orcamentos').upsert(
    origem.map((o) => ({
      mes_referencia: primeiroDiaDoMes(mesDestino),
      categoria_id: o.categoriaId,
      valor_planejado: paraNumerico(o.valorPlanejado),
    })),
    { onConflict: 'mes_referencia,categoria_id' },
  );
  if (error) throw new Error(error.message);

  return origem.length;
}

export type Meta = {
  id: string;
  nome: string;
  valorAlvo: Centavos;
  valorAtual: Centavos;
  prazo: DataISO | null;
  contaId: string | null;
};

export async function listarMetas(): Promise<Meta[]> {
  const { data, error } = await supabase.from('metas').select('*').order('prazo');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    valorAlvo: paraCentavos(linha.valor_alvo),
    valorAtual: paraCentavos(linha.valor_atual),
    prazo: linha.prazo,
    contaId: linha.conta_id,
  }));
}

export async function criarMeta(nova: {
  nome: string;
  valorAlvo: Centavos;
  valorAtual: Centavos;
  prazo: DataISO | null;
}): Promise<void> {
  const { error } = await supabase.from('metas').insert({
    nome: nova.nome.trim(),
    valor_alvo: paraNumerico(nova.valorAlvo),
    valor_atual: paraNumerico(nova.valorAtual),
    prazo: nova.prazo,
  });
  if (error) throw new Error(error.message);
}

export async function atualizarValorDaMeta(id: string, valorAtual: Centavos): Promise<void> {
  const { error } = await supabase
    .from('metas')
    .update({ valor_atual: paraNumerico(valorAtual) })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirMeta(id: string): Promise<void> {
  const { error } = await supabase.from('metas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Registra a conferência de saldo (§5.3).
 *
 * A diferença NUNCA é corrigida por trás: vira um lançamento explícito na
 * categoria "Ajuste de saldo", que é de sistema justamente para isso. O
 * histórico precisa continuar contando a verdade — inclusive a de que houve
 * um ajuste.
 *
 * `saldo_conferido` e `data_conferencia` ficam gravados só para comparação:
 * eles não são o saldo do app (§13.2).
 */
export async function registrarConferencia(dados: {
  contaId: string;
  saldoReal: Centavos;
  diferenca: Centavos;
  criarAjuste: boolean;
  data?: DataISO;
}): Promise<void> {
  const data = dados.data ?? hoje();

  const { error } = await supabase
    .from('contas')
    .update({
      saldo_conferido: paraNumerico(dados.saldoReal),
      data_conferencia: data,
    })
    .eq('id', dados.contaId);
  if (error) throw new Error(error.message);

  if (!dados.criarAjuste || dados.diferenca === 0) return;

  const { data: categoria, error: erroCategoria } = await supabase
    .from('categorias')
    .select('id')
    .eq('nome', 'Ajuste de saldo')
    .eq('sistema', true)
    .maybeSingle();
  if (erroCategoria) throw new Error(erroCategoria.message);

  const { error: erroLancamento } = await supabase.from('transacoes').insert({
    conta_id: dados.contaId,
    categoria_id: categoria?.id ?? null,
    descricao: 'Ajuste de saldo após conferência',
    valor: paraNumerico(dados.diferenca),
    tipo: dados.diferenca > 0 ? 'receita' : 'despesa',
    data_competencia: data,
    data_caixa: data,
    origem: 'manual',
    revisado: true,
  });
  if (erroLancamento) throw new Error(erroLancamento.message);
}
