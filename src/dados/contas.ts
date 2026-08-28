// Acesso a contas (§4).
//
// Esta é a fronteira: aqui o numeric do banco vira centavos inteiros e volta.
// Nenhuma tela deve conversar com o Supabase direto.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, type DataISO } from '../dominio/datas';
import type { SituacaoDaConta } from '../dominio/encerramento';
import { saldoAte } from './transacoes';
import { supabase } from './supabase';
import type { Conta, ContaComSaldo, LinhaConta, LinhaSaldo, TipoDeConta } from './tipos';
import type { Database } from './tipos-gerados';

type AtualizacaoConta = Database['public']['Tables']['contas']['Update'];

function daLinha(linha: LinhaConta): Conta {
  return {
    id: linha.id,
    nome: linha.nome,
    tipo: linha.tipo as TipoDeConta,
    instituicao: linha.instituicao,
    saldoInicial: paraCentavos(linha.saldo_inicial),
    saldoConferido: linha.saldo_conferido === null ? null : paraCentavos(linha.saldo_conferido),
    dataConferencia: linha.data_conferencia as DataISO | null,
    ativo: linha.ativo,
    encerradaEm: linha.encerrada_em as DataISO | null,
  };
}

export type NovaConta = {
  nome: string;
  tipo: TipoDeConta;
  instituicao?: string | null;
  saldoInicial: Centavos;
};

export async function listarContas(incluirArquivadas = false): Promise<Conta[]> {
  let consulta = supabase.from('contas').select('*').order('nome');
  if (!incluirArquivadas) consulta = consulta.eq('ativo', true);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map(daLinha);
}

/**
 * Contas com o saldo calculado. O saldo vem da view `saldos_contas`, que já
 * aplica as três regras do §13.2 (só o passado, sem filhas de divisão, hoje em
 * America/Sao_Paulo). Nunca somar saldo no cliente.
 */
export async function listarContasComSaldo(): Promise<ContaComSaldo[]> {
  const [contas, saldos] = await Promise.all([
    listarContas(false),
    supabase.from('saldos_contas').select('*'),
  ]);
  if (saldos.error) throw saldos.error;

  const porConta = new Map<string, Centavos>();
  for (const linha of (saldos.data ?? []) as LinhaSaldo[]) {
    if (linha.conta_id === null) continue;
    porConta.set(linha.conta_id, paraCentavos(linha.saldo_atual ?? 0));
  }

  return contas.map((conta) => ({
    ...conta,
    saldoAtual: porConta.get(conta.id) ?? conta.saldoInicial,
  }));
}

export async function criarConta(nova: NovaConta): Promise<Conta> {
  const { data, error } = await supabase
    .from('contas')
    .insert({
      nome: nova.nome.trim(),
      tipo: nova.tipo,
      instituicao: nova.instituicao?.trim() || null,
      saldo_inicial: paraNumerico(nova.saldoInicial),
    })
    .select()
    .single();

  if (error) throw traduzirErro(error);
  return daLinha(data);
}

export async function atualizarConta(
  id: string,
  campos: Partial<Pick<NovaConta, 'nome' | 'instituicao' | 'saldoInicial'>>,
): Promise<Conta> {
  const atualizacao: AtualizacaoConta = {};
  if (campos.nome !== undefined) atualizacao.nome = campos.nome.trim();
  if (campos.instituicao !== undefined) atualizacao.instituicao = campos.instituicao?.trim() || null;
  if (campos.saldoInicial !== undefined) {
    atualizacao.saldo_inicial = paraNumerico(campos.saldoInicial);
  }

  const { data, error } = await supabase
    .from('contas')
    .update(atualizacao)
    .eq('id', id)
    .select()
    .single();

  if (error) throw traduzirErro(error);
  return daLinha(data);
}

/**
 * Reabre uma conta tirada de circulação.
 *
 * Não existe função de arquivar solta de propósito: tirar uma conta de
 * circulação passa por `encerrarConta`, que só é chamada depois do painel
 * conferir as pendências. Um atalho que pulasse a conferência deixaria
 * recorrência gerando lançamento em conta morta — que é exatamente o modo de
 * falha que o painel existe para impedir.
 */
export async function desarquivarConta(id: string): Promise<void> {
  // Reabrir apaga a data de encerramento: uma conta em uso não está encerrada,
  // e deixar a data para trás faria a lista dizer duas coisas ao mesmo tempo.
  const { error } = await supabase
    .from('contas')
    .update({ ativo: true, encerrada_em: null })
    .eq('id', id);
  if (error) throw traduzirErro(error);
}

/**
 * Levanta tudo o que precisa ser resolvido antes de encerrar (§4.8).
 *
 * As cinco perguntas em paralelo: são independentes, e serializar só faria a
 * tela demorar cinco vezes mais para dizer a mesma coisa.
 */
export async function situacaoDaConta(id: string): Promise<SituacaoDaConta> {
  const [saldo, recorrencias, futuros, metas, modelos, cartoes, historico] = await Promise.all([
    saldoAte(hoje(), id),
    supabase
      .from('recorrencias')
      .select('id', { count: 'exact', head: true })
      .eq('conta_id', id)
      .eq('ativo', true),
    supabase
      .from('transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('conta_id', id)
      .gt('data_caixa', hoje()),
    supabase.from('metas').select('id', { count: 'exact', head: true }).eq('conta_id', id),
    supabase.from('modelos').select('id', { count: 'exact', head: true }).eq('conta_id', id),
    supabase
      .from('cartoes')
      .select('conta_id', { count: 'exact', head: true })
      .eq('conta_pagamento_id', id),
    contaTemTransacoes(id),
  ]);

  for (const consulta of [recorrencias, futuros, metas, modelos, cartoes]) {
    if (consulta.error) throw consulta.error;
  }

  return {
    saldo,
    recorrenciasAtivas: recorrencias.count ?? 0,
    lancamentosFuturos: futuros.count ?? 0,
    metasVinculadas: metas.count ?? 0,
    cartoesQuePagam: cartoes.count ?? 0,
    modelos: modelos.count ?? 0,
    temHistorico: historico,
  };
}

/**
 * Encerra a conta: tira de circulação e grava a data (§4.8).
 *
 * Nenhum lançamento é tocado. A conta some dos seletores e do consolidado, mas
 * todo mês fechado continua contando a mesma história que contava ontem.
 *
 * A checagem das pendências fica na tela, que é quem tem como resolvê-las —
 * aqui a data é o que importa gravar.
 */
export async function encerrarConta(id: string, data: DataISO): Promise<void> {
  const { error } = await supabase
    .from('contas')
    .update({ ativo: false, encerrada_em: data })
    .eq('id', id);
  if (error) throw traduzirErro(error);
}

export async function contaTemTransacoes(id: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('transacoes')
    .select('id', { count: 'exact', head: true })
    .eq('conta_id', id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Exclusão só é permitida enquanto a conta não tem histórico. Com transação
 * vinculada, o próprio banco recusa (ON DELETE RESTRICT) — a checagem aqui
 * existe para dar mensagem decente antes de tentar.
 */
export async function excluirContaSemHistorico(id: string): Promise<void> {
  if (await contaTemTransacoes(id)) {
    throw new Error(
      'Esta conta já tem lançamentos. Arquive em vez de excluir — apagar quebraria os relatórios dos meses fechados.',
    );
  }
  const { error } = await supabase.from('contas').delete().eq('id', id);
  if (error) throw traduzirErro(error);
}

/** Só pode existir uma conta Empresa ativa (§4.6). */
export async function jaExisteContaEmpresa(): Promise<boolean> {
  const { count, error } = await supabase
    .from('contas')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'empresa')
    .eq('ativo', true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

type ErroPostgrest = { code?: string; message?: string };

/**
 * As restrições que criamos no banco viram mensagem legível. Sem isso o usuário
 * recebe "duplicate key value violates unique constraint contas_uma_empresa_ativa".
 */
function traduzirErro(erro: ErroPostgrest): Error {
  if (erro.code === '23505' && erro.message?.includes('contas_uma_empresa_ativa')) {
    return new Error(
      'Já existe uma conta Empresa. Só pode haver uma — se você tem mais de um negócio, arquive a atual antes.',
    );
  }
  if (erro.code === '23503') {
    return new Error('Esta conta tem lançamentos vinculados e não pode ser removida. Arquive.');
  }
  return new Error(erro.message ?? 'Erro ao gravar a conta.');
}
