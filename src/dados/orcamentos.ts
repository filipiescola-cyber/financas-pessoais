// Orçamentos e metas (§8.6, §8.8) e conferência de saldo (§5.3).

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, primeiroDiaDoMes, type DataISO } from '../dominio/datas';
import { calcularTodos } from './investimentos';
import { supabase } from './supabase';
import type { Database } from './tipos-gerados';

type AtualizacaoMeta = Database['public']['Tables']['metas']['Update'];

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

export type FonteDaMeta = 'aporte' | 'investimentos';

export type Meta = {
  id: string;
  nome: string;
  valorAlvo: Centavos;
  prazo: DataISO | null;
  fonte: FonteDaMeta;
  /**
   * Quanto já foi separado (§8.8, §13.2).
   *
   * Calculado, nunca guardado: com fonte `aporte` é a soma dos aportes, com
   * `investimentos` é a soma dos saldos vinculados. Antes isto era o saldo
   * INTEIRO de uma conta — e o app dizia que a viagem estava quase paga porque
   * o salário tinha acabado de cair.
   */
  valorAtual: Centavos;
  /** As aplicações que contam, quando a fonte é `investimentos`. */
  investimentoIds: string[];
};

export async function listarMetas(): Promise<Meta[]> {
  const [metas, aportes, vinculos] = await Promise.all([
    supabase.from('metas').select('*').order('prazo'),
    supabase.from('aportes_meta').select('meta_id, valor'),
    supabase.from('metas_investimentos').select('meta_id, investimento_id'),
  ]);

  if (metas.error) throw metas.error;
  if (aportes.error) throw aportes.error;
  if (vinculos.error) throw vinculos.error;

  const somaDeAportes = new Map<string, Centavos>();
  for (const linha of aportes.data ?? []) {
    somaDeAportes.set(
      linha.meta_id,
      (somaDeAportes.get(linha.meta_id) ?? 0) + paraCentavos(linha.valor),
    );
  }

  const aplicacoes = new Map<string, string[]>();
  for (const linha of vinculos.data ?? []) {
    aplicacoes.set(linha.meta_id, [
      ...(aplicacoes.get(linha.meta_id) ?? []),
      linha.investimento_id,
    ]);
  }

  // O saldo das aplicações só é buscado se alguma meta depender dele: é a
  // consulta mais cara da tela, e a maioria das metas é por aporte.
  const precisaDeInvestimentos = (metas.data ?? []).some((m) => m.fonte === 'investimentos');
  const saldos = precisaDeInvestimentos
    ? new Map((await calcularTodos()).map((i) => [i.investimento.id, i.saldoExibido]))
    : new Map<string, Centavos>();

  return (metas.data ?? []).map((linha) => {
    const investimentoIds = aplicacoes.get(linha.id) ?? [];
    const fonte = linha.fonte as FonteDaMeta;

    return {
      id: linha.id,
      nome: linha.nome,
      valorAlvo: paraCentavos(linha.valor_alvo),
      prazo: linha.prazo,
      fonte,
      investimentoIds,
      valorAtual:
        fonte === 'investimentos'
          ? investimentoIds.reduce((total, id) => total + (saldos.get(id) ?? 0), 0)
          : (somaDeAportes.get(linha.id) ?? 0),
    };
  });
}

export async function criarMeta(nova: {
  nome: string;
  valorAlvo: Centavos;
  prazo: DataISO | null;
  fonte: FonteDaMeta;
  /** Aporte inicial, quando a fonte é `aporte` e já existe algo guardado. */
  valorInicial?: Centavos;
  /** As aplicações que contam, quando a fonte é `investimentos`. */
  investimentoIds?: string[];
}): Promise<void> {
  const { data, error } = await supabase
    .from('metas')
    .insert({
      nome: nova.nome.trim(),
      valor_alvo: paraNumerico(nova.valorAlvo),
      prazo: nova.prazo,
      fonte: nova.fonte,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  if (nova.fonte === 'aporte' && (nova.valorInicial ?? 0) > 0) {
    await aportarNaMeta(data.id, nova.valorInicial!, hoje());
    return;
  }

  if (nova.fonte === 'investimentos' && nova.investimentoIds?.length) {
    await vincularInvestimentos(data.id, nova.investimentoIds);
  }
}

/**
 * Registra que mais um pedaço foi separado (§8.8).
 *
 * Não move dinheiro: separar para uma meta é uma decisão, não uma
 * transferência. Quem quiser que o dinheiro saia de fato do caixa aplica numa
 * conta ou investimento e vincula a meta lá — é para isso que a outra fonte
 * existe.
 */
export async function aportarNaMeta(
  metaId: string,
  valor: Centavos,
  data: DataISO,
): Promise<void> {
  const { error } = await supabase
    .from('aportes_meta')
    .insert({ meta_id: metaId, valor: paraNumerico(Math.abs(valor)), data });
  if (error) throw new Error(error.message);
}

export type AporteDaMeta = { id: string; valor: Centavos; data: DataISO };

export async function listarAportes(metaId: string): Promise<AporteDaMeta[]> {
  const { data, error } = await supabase
    .from('aportes_meta')
    .select('id, valor, data')
    .eq('meta_id', metaId)
    .order('data', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    valor: paraCentavos(linha.valor),
    data: linha.data,
  }));
}

export async function excluirAporte(id: string): Promise<void> {
  const { error } = await supabase.from('aportes_meta').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function vincularInvestimentos(
  metaId: string,
  investimentoIds: string[],
): Promise<void> {
  const { error: erroLimpar } = await supabase
    .from('metas_investimentos')
    .delete()
    .eq('meta_id', metaId);
  if (erroLimpar) throw new Error(erroLimpar.message);

  if (investimentoIds.length === 0) return;

  const { error } = await supabase
    .from('metas_investimentos')
    .insert(investimentoIds.map((id) => ({ meta_id: metaId, investimento_id: id })));
  if (error) throw new Error(error.message);
}


/** Alvo, nome e prazo de uma meta já criada. O prazo é o que faltava: sem ele
 *  não há como dizer quanto guardar por mês, e antes não havia onde acrescentar. */
export async function atualizarMeta(
  id: string,
  campos: { nome?: string; valorAlvo?: Centavos; prazo?: DataISO | null },
): Promise<void> {
  const atualizacao: AtualizacaoMeta = {};
  if (campos.nome !== undefined) atualizacao.nome = campos.nome.trim();
  if (campos.valorAlvo !== undefined) atualizacao.valor_alvo = paraNumerico(campos.valorAlvo);
  if (campos.prazo !== undefined) atualizacao.prazo = campos.prazo;

  if (Object.keys(atualizacao).length === 0) return;

  const { error } = await supabase.from('metas').update(atualizacao).eq('id', id);
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
