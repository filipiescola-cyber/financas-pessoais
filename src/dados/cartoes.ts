// Acesso a cartões (§4.2).
//
// Um cartão são duas linhas: uma em `contas` (tipo cartao_credito) e uma em
// `cartoes` com os dias. O PostgREST não expõe transação, então a criação é
// feita em dois passos com compensação — se o segundo falhar, o primeiro é
// desfeito. Sem isso sobraria uma conta de cartão sem fechamento, que é
// exatamente o estado que quebra o §2.1.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { ehDiaValido } from '../dominio/fatura';
import type { SituacaoDoCartao } from '../dominio/encerramento';
import { contaTemTransacoes, desarquivarConta, itemDaRecorrencia } from './contas';
import { dividaDoCartao } from './faturas';
import { supabase } from './supabase';
import type { CartaoComConta, LinhaCartao, LinhaConta, TipoDeConta } from './tipos';
import type { Database } from './tipos-gerados';

type AtualizacaoCartao = Database['public']['Tables']['cartoes']['Update'];

export type NovoCartao = {
  nome: string;
  instituicao?: string | null;
  cor?: string | null;
  limite: Centavos | null;
  diaFechamento: number;
  diaVencimento: number;
  contaPagamentoId?: string | null;
};

function montar(conta: LinhaConta, cartao: LinhaCartao): CartaoComConta {
  return {
    contaId: cartao.conta_id,
    limite: cartao.limite === null ? null : paraCentavos(cartao.limite),
    diaFechamento: cartao.dia_fechamento,
    diaVencimento: cartao.dia_vencimento,
    contaPagamentoId: cartao.conta_pagamento_id,
    conta: {
      id: conta.id,
      nome: conta.nome,
      tipo: conta.tipo as TipoDeConta,
      instituicao: conta.instituicao,
      saldoInicial: paraCentavos(conta.saldo_inicial),
      saldoConferido: conta.saldo_conferido === null ? null : paraCentavos(conta.saldo_conferido),
      dataConferencia: conta.data_conferencia,
      ativo: conta.ativo,
      encerradaEm: conta.encerrada_em,
      cor: conta.cor,
      contaPaiId: conta.conta_pai_id,
    },
  };
}

export async function listarCartoes(incluirArquivados = false): Promise<CartaoComConta[]> {
  const { data: cartoes, error } = await supabase.from('cartoes').select('*');
  if (error) throw error;
  if (!cartoes || cartoes.length === 0) return [];

  let consulta = supabase
    .from('contas')
    .select('*')
    .in(
      'id',
      cartoes.map((c) => c.conta_id),
    )
    .order('nome');
  if (!incluirArquivados) consulta = consulta.eq('ativo', true);

  const { data: contas, error: erroContas } = await consulta;
  if (erroContas) throw erroContas;

  const porId = new Map(cartoes.map((c) => [c.conta_id, c]));
  return (contas ?? [])
    .map((conta) => {
      const cartao = porId.get(conta.id);
      return cartao ? montar(conta, cartao) : null;
    })
    .filter((c): c is CartaoComConta => c !== null);
}

export async function criarCartao(novo: NovoCartao): Promise<CartaoComConta> {
  validar(novo);

  const { data: conta, error: erroConta } = await supabase
    .from('contas')
    .insert({
      nome: novo.nome.trim(),
      tipo: 'cartao_credito',
      instituicao: novo.instituicao?.trim() || null,
      cor: novo.cor ?? null,
      // Cartão não tem saldo próprio: o que existe é fatura (§2.1).
      saldo_inicial: 0,
    })
    .select()
    .single();

  if (erroConta) throw new Error(erroConta.message);

  const { data: cartao, error: erroCartao } = await supabase
    .from('cartoes')
    .insert({
      conta_id: conta.id,
      limite: novo.limite === null ? null : paraNumerico(novo.limite),
      dia_fechamento: novo.diaFechamento,
      dia_vencimento: novo.diaVencimento,
      conta_pagamento_id: novo.contaPagamentoId ?? null,
    })
    .select()
    .single();

  if (erroCartao) {
    // Compensação: sem os dias, a conta de cartão é inútil e perigosa.
    await supabase.from('contas').delete().eq('id', conta.id);
    throw new Error(erroCartao.message);
  }

  return montar(conta, cartao);
}

export async function atualizarCartao(
  contaId: string,
  campos: Partial<NovoCartao>,
): Promise<void> {
  for (const dia of [campos.diaFechamento, campos.diaVencimento]) {
    if (dia !== undefined && !ehDiaValido(dia)) throw erroDeDia();
  }

  // `cor` mora em `contas`, junto de nome e instituição — o tipo já a aceitava
  // e ela vinha sendo descartada em silêncio, que é o pior jeito de falhar:
  // a tela salvava sem erro e a cor não mudava.
  if (
    campos.nome !== undefined ||
    campos.instituicao !== undefined ||
    campos.cor !== undefined
  ) {
    const { error } = await supabase
      .from('contas')
      .update({
        ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}),
        ...(campos.instituicao !== undefined
          ? { instituicao: campos.instituicao?.trim() || null }
          : {}),
        ...(campos.cor !== undefined ? { cor: campos.cor } : {}),
      })
      .eq('id', contaId);
    if (error) throw new Error(error.message);
  }

  const doCartao: AtualizacaoCartao = {};
  if (campos.limite !== undefined) {
    doCartao.limite = campos.limite === null ? null : paraNumerico(campos.limite);
  }
  if (campos.diaFechamento !== undefined) doCartao.dia_fechamento = campos.diaFechamento;
  if (campos.diaVencimento !== undefined) doCartao.dia_vencimento = campos.diaVencimento;
  if (campos.contaPagamentoId !== undefined) {
    doCartao.conta_pagamento_id = campos.contaPagamentoId;
  }

  if (Object.keys(doCartao).length > 0) {
    const { error } = await supabase.from('cartoes').update(doCartao).eq('conta_id', contaId);
    if (error) throw new Error(error.message);
  }
}

/**
 * Levanta o que precisa ser resolvido antes de encerrar o cartão (§4.8).
 *
 * Não existe função de arquivar cartão solta, pelo mesmo motivo das contas:
 * seria um atalho que pula esta conferência, e a conferência é o que impede
 * dívida de sair da tela sem ter sido paga.
 */
export async function situacaoDoCartao(contaId: string): Promise<SituacaoDoCartao> {
  const [divida, recorrencias, modelos, historico] = await Promise.all([
    dividaDoCartao(contaId),
    supabase
      .from('recorrencias')
      .select('id, descricao, dia, valor_previsto')
      .eq('conta_id', contaId)
      .eq('ativo', true)
      .order('dia'),
    supabase.from('modelos').select('id, nome').eq('conta_id', contaId).order('ordem'),
    contaTemTransacoes(contaId),
  ]);

  if (recorrencias.error) throw recorrencias.error;
  if (modelos.error) throw modelos.error;

  return {
    faturaCobravel: divida.cobravel,
    faturasFuturas: divida.futura,
    recorrenciasAtivas: (recorrencias.data ?? []).map(itemDaRecorrencia),
    modelos: (modelos.data ?? []).map((m) => ({ id: m.id, rotulo: m.nome })),
    temHistorico: historico,
  };
}

/**
 * Apaga um cartão que nunca foi usado. A linha de `cartoes` sai primeiro: ela
 * referencia a conta com ON DELETE RESTRICT, então na ordem inversa o banco
 * recusaria e sobraria um cartão sem conta.
 */
export async function excluirCartaoSemHistorico(contaId: string): Promise<void> {
  if (await contaTemTransacoes(contaId)) {
    throw new Error(
      'Este cartão já tem lançamentos. Encerre em vez de excluir — apagar quebraria as faturas dos meses fechados.',
    );
  }

  const { error: erroFaturas } = await supabase.from('faturas').delete().eq('cartao_id', contaId);
  if (erroFaturas) throw new Error(erroFaturas.message);

  const { error: erroCartao } = await supabase.from('cartoes').delete().eq('conta_id', contaId);
  if (erroCartao) throw new Error(erroCartao.message);

  const { error } = await supabase.from('contas').delete().eq('id', contaId);
  if (error) throw new Error(error.message);
}

/**
 * Reabre o cartão. Delega para a conta porque cartão É conta (§4.2), e porque
 * voltar a ativar sem limpar `encerrada_em` bateria na restrição do banco:
 * conta encerrada está, por definição, fora de circulação.
 */
export async function desarquivarCartao(contaId: string): Promise<void> {
  await desarquivarConta(contaId);
}

function validar(novo: NovoCartao) {
  if (novo.nome.trim() === '') throw new Error('O cartão precisa de um nome.');
  if (!ehDiaValido(novo.diaFechamento) || !ehDiaValido(novo.diaVencimento)) throw erroDeDia();
}

function erroDeDia(): Error {
  return new Error(
    'Dia de fechamento e de vencimento são obrigatórios e precisam estar entre 1 e 31. Sem eles a fatura não fecha (§4.2).',
  );
}
