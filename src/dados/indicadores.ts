// Feriados e indexadores (§9.1, §9.2).
//
// REGRA QUE MANDA AQUI (§9.6): nenhuma API é caminho crítico. Se todas caírem,
// o app continua funcionando com dado manual — sem exceção. Por isso:
//
//   O usuário sempre pode digitar a taxa na mão. A API é acelerador, não
//   dependência.
//   O valor buscado é gravado no banco COM A DATA. Se a API revisar o número
//   depois, o histórico não muda sozinho.
//   Falha é silenciosa e visível ao mesmo tempo: não trava nada, e a tela
//   mostra desde quando o dado está parado.
//
// DESVIO DECLARADO DO §9.6: a chamada sai do front, não de uma Edge Function.
// As três razões que o §9.6 dá para usar Edge Function — CORS, esconder chave e
// cache central — não se aplicam: as duas APIs são públicas, sem chave, com CORS
// liberado, e o cache é a própria tabela no banco. Se alguma delas passar a
// exigir chave, aí a Edge Function vira obrigatória.

import { hoje, type DataISO } from '../dominio/datas';
import { supabase } from './supabase';

const BRASIL_API = 'https://brasilapi.com.br/api';

export type ResultadoDaAtualizacao = {
  ok: boolean;
  quantidade: number;
  mensagem: string;
};

/**
 * Feriados nacionais do ano (§9.2).
 *
 * "Sem isso o rendimento erra cerca de 10 dias por ano." Roda uma vez por ano —
 * feriado nacional não muda no meio do caminho.
 *
 * Desde que a recorrência ganhou regra de dia útil (§5.2), a tabela também
 * decide QUANDO o salário cai. Um ano faltando não é mais só rendimento um
 * pouco otimista: é a data prevista errada em todo mês com feriado.
 */
export async function atualizarFeriados(ano: number): Promise<ResultadoDaAtualizacao> {
  try {
    const resposta = await fetch(`${BRASIL_API}/feriados/v1/${ano}`);
    if (!resposta.ok) {
      return { ok: false, quantidade: 0, mensagem: `BrasilAPI respondeu ${resposta.status}.` };
    }

    const feriados = (await resposta.json()) as { date: string; name: string }[];
    if (!Array.isArray(feriados) || feriados.length === 0) {
      return { ok: false, quantidade: 0, mensagem: 'A API não devolveu feriados.' };
    }

    const { error } = await supabase.from('feriados').upsert(
      feriados.map((f) => ({ data: f.date, descricao: f.name })),
      { onConflict: 'data' },
    );
    if (error) throw new Error(error.message);

    return {
      ok: true,
      quantidade: feriados.length,
      mensagem: `${feriados.length} feriados de ${ano} gravados.`,
    };
  } catch (erro) {
    return {
      ok: false,
      quantidade: 0,
      mensagem: `Não foi possível buscar os feriados: ${(erro as Error).message}. Dá para cadastrar na mão, e o cálculo continua funcionando com o que já existe.`,
    };
  }
}

/**
 * Garante que os anos pedidos existem na tabela, buscando só o que falta.
 *
 * Chamada na abertura do app (§13.3), não por um botão: quem precisa saber que
 * 20 de novembro é feriado é o app, e fazer o usuário lembrar de apertar um
 * botão uma vez por ano é o mesmo que não ter o dado. A verificação é uma
 * contagem por ano — barata o bastante para rodar diariamente.
 *
 * Falha de rede não interrompe nada: `atualizarFeriados` devolve o erro em vez
 * de lançar, e o §9 é explícito em tratar API externa como acelerador, nunca
 * como dependência.
 */
export async function garantirFeriados(anos: number[]): Promise<number> {
  let buscados = 0;

  for (const ano of anos) {
    const { count, error } = await supabase
      .from('feriados')
      .select('data', { count: 'exact', head: true })
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`);

    if (error || (count ?? 0) > 0) continue;

    const resultado = await atualizarFeriados(ano);
    if (resultado.ok) buscados += resultado.quantidade;
  }

  return buscados;
}

export async function listarFeriados(): Promise<Set<DataISO>> {
  const { data, error } = await supabase.from('feriados').select('data');
  if (error) throw error;
  return new Set((data ?? []).map((linha) => linha.data));
}

/**
 * Taxas vigentes (§9.2). CDI acompanha a Selic e muda a cada Copom.
 *
 * A taxa nova vale DALI PARA FRENTE (§7.1): o passado nunca é recalculado, e é
 * por isso que cada taxa é gravada com a data em que passou a valer.
 */
export async function atualizarIndexadores(): Promise<ResultadoDaAtualizacao> {
  try {
    const resposta = await fetch(`${BRASIL_API}/taxas/v1`);
    if (!resposta.ok) {
      return { ok: false, quantidade: 0, mensagem: `BrasilAPI respondeu ${resposta.status}.` };
    }

    const taxas = (await resposta.json()) as { nome: string; valor: number }[];
    const interessam = taxas.filter((t) => ['CDI', 'SELIC', 'IPCA'].includes(t.nome.toUpperCase()));

    if (interessam.length === 0) {
      return { ok: false, quantidade: 0, mensagem: 'A API não devolveu CDI, Selic nem IPCA.' };
    }

    const hojeISO = hoje();
    const { error } = await supabase.from('indexadores').upsert(
      interessam.map((t) => ({
        nome: t.nome.toUpperCase(),
        taxa_anual: t.valor,
        vigente_desde: hojeISO,
      })),
      { onConflict: 'nome,vigente_desde' },
    );
    if (error) throw new Error(error.message);

    return {
      ok: true,
      quantidade: interessam.length,
      mensagem: interessam.map((t) => `${t.nome} ${t.valor}%`).join(' · '),
    };
  } catch (erro) {
    return {
      ok: false,
      quantidade: 0,
      mensagem: `Não foi possível buscar as taxas: ${(erro as Error).message}. Dá para informar na mão abaixo.`,
    };
  }
}

export type IndexadorGravado = {
  nome: string;
  taxaAnual: number;
  vigenteDesde: DataISO;
};

/** A taxa mais recente de cada indexador, com a data em que foi registrada. */
export async function taxasVigentes(): Promise<Map<string, IndexadorGravado>> {
  const { data, error } = await supabase
    .from('indexadores')
    .select('nome, taxa_anual, vigente_desde')
    .order('vigente_desde', { ascending: false });
  if (error) throw error;

  const vigentes = new Map<string, IndexadorGravado>();
  for (const linha of data ?? []) {
    if (vigentes.has(linha.nome)) continue;
    vigentes.set(linha.nome, {
      nome: linha.nome,
      taxaAnual: Number(linha.taxa_anual),
      vigenteDesde: linha.vigente_desde,
    });
  }
  return vigentes;
}

/** Entrada manual da taxa. É o caminho que sempre funciona (§7.1). */
export async function registrarTaxaManual(
  nome: 'CDI' | 'SELIC' | 'IPCA',
  taxaAnual: number,
  vigenteDesde: DataISO = hoje(),
): Promise<void> {
  const { error } = await supabase
    .from('indexadores')
    .upsert({ nome, taxa_anual: taxaAnual, vigente_desde: vigenteDesde }, {
      onConflict: 'nome,vigente_desde',
    });
  if (error) throw new Error(error.message);
}

export async function tabelaDeIR() {
  const { data, error } = await supabase
    .from('aliquotas_ir')
    .select('dias_min, dias_max, aliquota')
    .order('dias_min');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    diasMin: linha.dias_min,
    diasMax: linha.dias_max,
    aliquota: Number(linha.aliquota),
  }));
}
