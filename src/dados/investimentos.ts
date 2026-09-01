// Investimentos (§7).
//
// O saldo mostrado é ESTIMATIVA até ser conferido (§7.3, §14). O app calcula,
// o banco confirma — e a diferença aparece na tela em vez de ser escondida.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, type DataISO } from '../dominio/datas';
import { calcularPosicao, parcelasVivas, principalVivo, type Movimento } from '../dominio/posicao';
import {
  contasDaVenda,
  posicaoPorCotacao,
  valorEmReais,
  type MovimentoDeUnidade,
  type PosicaoPorCotacao,
} from '../dominio/cotacao';
import type { TablesInsert } from './tipos-gerados';
import type { Indexador, Resultado } from '../dominio/rendimento';
import { listarFeriados, tabelaDeIR, taxasVigentes } from './indicadores';
import { criarTransferencia } from './transacoes';
import { supabase } from './supabase';

export type TipoDeInvestimento =
  | 'cdb' | 'rdb' | 'tesouro' | 'lci' | 'lca' | 'poupanca'
  | 'fundo' | 'acoes' | 'cripto' | 'outro';

export type Investimento = {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: TipoDeInvestimento;
  /** O valor vem de quantidade x preco x cambio, nao de um saldo digitado. */
  porCotacao: boolean;
  moeda: 'BRL' | 'USD';
  precoUnitario: number | null;
  cotacaoMoeda: number | null;
  dataCotacao: DataISO | null;
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
  /**
   * A conta de investimento onde a aplicação mora (§7.4).
   *
   * Antes o destino do aporte era sempre a PRIMEIRA conta do tipo criada: quem
   * tem C6 Invest e E Trade via tudo cair no C6. A aplicação não sabia onde
   * morava, então o código escolhia por ela — e escolhia errado.
   */
  contaId: string | null;
  ativo: boolean;
};

/** Isentos de IR para pessoa física (§7.2). */
export const TIPOS_ISENTOS: TipoDeInvestimento[] = ['lci', 'lca', 'poupanca'];

export const ROTULO_TIPO: Record<TipoDeInvestimento, string> = {
  cdb: 'CDB',
  rdb: 'RDB',
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
    porCotacao: linha.por_cotacao,
    moeda: linha.moeda as 'BRL' | 'USD',
    precoUnitario: linha.preco_unitario,
    cotacaoMoeda: linha.cotacao_moeda,
    dataCotacao: linha.data_cotacao,
    saldoManual: linha.saldo_manual === null ? null : paraCentavos(linha.saldo_manual),
    saldoConferido: linha.saldo_conferido === null ? null : paraCentavos(linha.saldo_conferido),
    dataConferencia: linha.data_conferencia,
    contaId: linha.conta_id,
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
  /**
   * De qual conta o dinheiro saiu (§7.4).
   *
   * Opcional: quem está cadastrando uma aplicação que já existia antes do app
   * não deve ver um lançamento inventado aparecer na conta. Informado, gera a
   * transferência — que é o que faz o dinheiro sair de algum lugar em vez de
   * surgir do nada.
   */
  contaOrigemId?: string | null;
  /** Onde a aplicação mora. Sem isto, o aporte não sabe para onde ir. */
  contaId?: string | null;
};

/**
 * A conta onde o dinheiro aplicado passa a ficar (§7.4).
 *
 * Aporte é transferência, não despesa: o dinheiro sai da corrente e continua
 * seu, agora aplicado. Sem uma conta do outro lado, a transferência não teria
 * destino e o saldo consolidado cairia — como se você tivesse gasto.
 *
 * Uma só para todas as aplicações, e não uma por CDB: oito aplicações virariam
 * oito contas na lista, e o detalhe de cada uma já vive na tabela de
 * investimentos.
 */
async function contaDeInvestimentos(): Promise<string> {
  const { data: existente, error } = await supabase
    .from('contas')
    .select('id')
    .eq('tipo', 'investimento')
    .eq('ativo', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existente) return existente.id;

  const { data, error: erroCriacao } = await supabase
    .from('contas')
    .insert({ nome: 'Investimentos', tipo: 'investimento', saldo_inicial: 0 })
    .select('id')
    .single();
  if (erroCriacao) throw new Error(erroCriacao.message);
  return data.id;
}

export async function criarInvestimento(novo: NovoInvestimento): Promise<void> {
  const calculoAutomatico = !TIPOS_SEM_CALCULO.includes(novo.tipo);

  const { data: criado, error } = await supabase
    .from('investimentos')
    .insert({
    nome: novo.nome.trim(),
    instituicao: novo.instituicao?.trim() || null,
    tipo: novo.tipo,
    indexador: calculoAutomatico ? novo.indexador : null,
    percentual_indexador: novo.percentualIndexador,
    taxa_prefixada: novo.taxaPrefixada,
    data_aplicacao: novo.dataAplicacao,
    valor_aplicado: paraNumerico(novo.valorAplicado),
    vencimento: novo.vencimento ?? null,
    conta_id: novo.contaId ?? null,
    liquidez_diaria: novo.liquidezDiaria ?? true,
    isento_ir: TIPOS_ISENTOS.includes(novo.tipo),
    calculo_automatico: calculoAutomatico,
      // Renda variável começa valendo o que foi aplicado, até o usuário atualizar.
      saldo_manual: calculoAutomatico ? null : paraNumerico(novo.valorAplicado),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  // O aporte é gravado SEMPRE: é dele que sai o principal (§13.2). Sem conta de
  // origem, só a transferência deixa de existir — a aplicação continua valendo
  // o que foi aplicado, em vez de aparecer zerada.
  await registrarMovimento({
    investimentoId: criado.id,
    tipo: 'aporte',
    valor: novo.valorAplicado,
    data: novo.dataAplicacao,
    contaDoCaixa: novo.contaOrigemId ?? null,
    contaDaAplicacao: novo.contaId ?? null,
    descricao: `Aplicação em ${novo.nome.trim()}`,
    percentual: null,
    vencimento: novo.vencimento ?? null,
  });
}

/**
 * Aporte ou resgate: a transferência entre o caixa e a conta de investimentos,
 * e o registro que liga uma coisa à outra (§7.4).
 *
 * Nunca é receita nem despesa. Aplicar não é gastar e resgatar não é ganhar —
 * o patrimônio não muda em nenhum dos dois, só muda de lugar. O rendimento é
 * que é ganho, e ele só vira receita quando realizado.
 */
/**
 * Grava o movimento e, quando há conta envolvida, a transferência que o move.
 *
 * `contaDoCaixa` nulo é o caso de quem cadastra uma aplicação que já existia
 * antes do app: o principal precisa ser registrado — é dele que sai o saldo
 * (§13.2) — mas nenhuma conta pode se mexer, porque esse dinheiro saiu de lá
 * meses atrás e o lançamento seria inventado.
 */
async function registrarMovimento(dados: {
  investimentoId: string;
  tipo: 'aporte' | 'resgate';
  valor: Centavos;
  data: DataISO;
  contaDoCaixa: string | null;
  /** Onde a aplicação mora. Nulo cai na conta genérica, como antes. */
  contaDaAplicacao?: string | null;
  descricao: string;
  percentual?: number | null;
  vencimento?: DataISO | null;
}): Promise<void> {
  const ehAporte = dados.tipo === 'aporte';
  // O outro lado da transferência é a conta DA APLICAÇÃO. Cair sempre na
  // primeira conta de investimento criada fazia o dinheiro aparecer no lugar
  // errado para quem tem mais de uma corretora.
  const daAplicacao = dados.contaDaAplicacao ?? (await contaDeInvestimentos());

  const ids = dados.contaDoCaixa
    ? await criarTransferencia({
        valor: dados.valor,
        contaOrigemId: ehAporte ? dados.contaDoCaixa : daAplicacao,
        contaDestinoId: ehAporte ? daAplicacao : dados.contaDoCaixa,
        data: dados.data,
        descricao: dados.descricao,
      })
    : [];

  const { error } = await supabase.from('movimentacoes_investimento').insert({
    investimento_id: dados.investimentoId,
    tipo: dados.tipo,
    valor: paraNumerico(dados.valor),
    data: dados.data,
    percentual_indexador: dados.percentual ?? null,
    vencimento: dados.vencimento ?? null,
    // Guarda a perna que saiu do caixa: é por ela que se acha o lançamento
    // a partir do investimento, e vice-versa.
    transacao_id: ids[0] ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Resgata a aplicação: o dinheiro volta para a conta (§7.4).
 *
 * O valor é informado, não calculado: o que o banco credita é o líquido, já
 * com IR e IOF, e o app trata o próprio cálculo como estimativa até ser
 * conferido (§7.3). Chutar aqui seria gravar um número inventado no caixa.
 */
export async function resgatarInvestimento(dados: {
  investimentoId: string;
  nome: string;
  valor: Centavos;
  data: DataISO;
  contaDestinoId: string;
  encerrar: boolean;
}): Promise<void> {
  const { data: aplicacao } = await supabase
    .from('investimentos')
    .select('conta_id')
    .eq('id', dados.investimentoId)
    .maybeSingle();

  await registrarMovimento({
    investimentoId: dados.investimentoId,
    tipo: 'resgate',
    valor: dados.valor,
    data: dados.data,
    contaDoCaixa: dados.contaDestinoId,
    contaDaAplicacao: aplicacao?.conta_id ?? null,
    descricao: `Resgate de ${dados.nome.trim()}`,
  });

  if (dados.encerrar) await arquivarInvestimento(dados.investimentoId);
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
/**
 * Corrige o que só se descobre depois: instituição, vencimento e liquidez (§7).
 *
 * Existe porque a tela agrupa por instituição e ordena por vencimento, e sem
 * edição quem cadastrou antes desses campos existirem ficaria preso em "sem
 * instituição" para sempre — sem outra saída além de apagar e recadastrar.
 *
 * Só estes: valor, taxa e data mudam o cálculo do rendimento, e mexer neles
 * pela lateral reescreveria o histórico sem deixar rastro.
 */
export async function atualizarInvestimento(
  id: string,
  campos: {
    instituicao?: string | null;
    vencimento?: DataISO | null;
    liquidezDiaria?: boolean;
    contaId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('investimentos')
    .update({
      ...(campos.instituicao !== undefined
        ? { instituicao: campos.instituicao?.trim() || null }
        : {}),
      ...(campos.vencimento !== undefined ? { vencimento: campos.vencimento } : {}),
      ...(campos.liquidezDiaria !== undefined
        ? { liquidez_diaria: campos.liquidezDiaria }
        : {}),
      ...(campos.contaId !== undefined ? { conta_id: campos.contaId } : {}),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** O que uma exclusão vai desfazer, para a tela dizer antes de agir. */
export type PreviaDaExclusao = {
  lancamentos: number;
  /** Efeito no saldo de cada conta. Positivo = o dinheiro volta para ela. */
  efeitos: { contaId: string; nome: string; delta: Centavos }[];
};

/**
 * Excluir é para o que NUNCA ACONTECEU (§7.4).
 *
 * Arquivar é para o que acabou: a aplicação sai da carteira e o histórico
 * continua contando a verdade. Não serve para erro de digitação — arquivar uma
 * aplicação duplicada esconde a linha e deixa a transferência do aporte no
 * extrato, então a conta corrente fica mais pobre para sempre por um dinheiro
 * que nunca saiu.
 *
 * A trava não é tempo, é consequência: a tela mostra exatamente quantos
 * lançamentos somem e quanto volta para cada conta, e quem decide é quem sabe
 * se o dinheiro se moveu de verdade. Uma aplicação recém-cadastrada por engano
 * tem um lançamento para desfazer; uma de três anos tem trinta, e a própria
 * frase avisa.
 */
export async function previaDaExclusao(investimentoId: string): Promise<PreviaDaExclusao> {
  const alvos = await transacoesDoInvestimento(investimentoId);
  if (alvos.length === 0) return { lancamentos: 0, efeitos: [] };

  const { data: contas } = await supabase.from('contas').select('id, nome');
  const nomes = new Map((contas ?? []).map((c) => [c.id, c.nome]));

  const porConta = new Map<string, Centavos>();
  for (const linha of alvos) {
    // Apagar o lançamento devolve à conta o oposto do que ele fez.
    const delta = -paraCentavos(linha.valor);
    porConta.set(linha.conta_id, (porConta.get(linha.conta_id) ?? 0) + delta);
  }

  return {
    lancamentos: alvos.length,
    efeitos: [...porConta.entries()]
      .filter(([, delta]) => delta !== 0)
      .map(([contaId, delta]) => ({ contaId, nome: nomes.get(contaId) ?? 'Conta', delta }))
      .sort((a, b) => b.delta - a.delta),
  };
}

/**
 * Apaga a aplicação e tudo que ela criou.
 *
 * A ordem importa e é imposta pelo banco: as movimentações seguram tanto o
 * investimento quanto os lançamentos (`on delete restrict`, §7.4), então elas
 * saem primeiro. É a mesma ordem que o "recomeçar do zero" já usava.
 */
export async function excluirInvestimento(investimentoId: string): Promise<void> {
  const alvos = await transacoesDoInvestimento(investimentoId);

  const { error: erroMovimentos } = await supabase
    .from('movimentacoes_investimento')
    .delete()
    .eq('investimento_id', investimentoId);
  if (erroMovimentos) throw new Error(erroMovimentos.message);

  if (alvos.length > 0) {
    const { error } = await supabase
      .from('transacoes')
      .delete()
      .in('id', alvos.map((t) => t.id));
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase.from('investimentos').delete().eq('id', investimentoId);
  if (error) throw new Error(error.message);
}

/** Os dois lados de cada transferência que os movimentos criaram. */
async function transacoesDoInvestimento(investimentoId: string) {
  const { data: movimentos, error } = await supabase
    .from('movimentacoes_investimento')
    .select('transacao_id')
    .eq('investimento_id', investimentoId)
    .not('transacao_id', 'is', null);
  if (error) throw error;

  const ids = (movimentos ?? []).map((m) => m.transacao_id!).filter(Boolean);
  if (ids.length === 0) return [];

  // A movimentação guarda só a perna do caixa; a outra vem pelo par. Sem as
  // duas, o saldo da conta Investimentos ficaria com metade da transferência.
  const { data: pernas, error: erroPernas } = await supabase
    .from('transacoes')
    .select('id, conta_id, valor, transferencia_par_id')
    .in('id', ids);
  if (erroPernas) throw erroPernas;

  const pares = (pernas ?? []).map((t) => t.transferencia_par_id).filter((id): id is string => !!id);
  if (pares.length === 0) return pernas ?? [];

  const { data: outras, error: erroOutras } = await supabase
    .from('transacoes')
    .select('id, conta_id, valor, transferencia_par_id')
    .in('id', pares);
  if (erroOutras) throw erroOutras;

  return [...(pernas ?? []), ...(outras ?? [])];
}

export async function arquivarInvestimento(id: string): Promise<void> {
  const { error } = await supabase.from('investimentos').update({ ativo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function desarquivarInvestimento(id: string): Promise<void> {
  const { error } = await supabase.from('investimentos').update({ ativo: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export type InvestimentoCalculado = {
  /** Principal ainda aplicado: aportes menos resgates (§13.2). */
  aplicado: Centavos;
  investimento: Investimento;
  resultado: Resultado | null;
  /** O que vale hoje: calculado, manual ou conferido. */
  saldoExibido: Centavos;
  /** Diferença entre o calculado e o último conferido, quando houver (§7.3). */
  divergencia: Centavos | null;
  /** Quantidade, custo e ganho, quando o investimento é por cotação (§7.1). */
  posicao?: PosicaoPorCotacao;
};

/**
 * Calcula todos os investimentos de uma vez.
 *
 * Uma leitura só de feriados, taxas e tabela de IR para o conjunto inteiro: são
 * os mesmos dados para todas as aplicações, e buscar por aplicação seria
 * desperdício num plano gratuito.
 */
export async function calcularTodos(ate: DataISO = hoje()): Promise<InvestimentoCalculado[]> {
  const [investimentos, feriados, taxas, tabela, movimentos, unidades] = await Promise.all([
    listarInvestimentos(),
    listarFeriados(),
    taxasVigentes(),
    tabelaDeIR(),
    listarMovimentos(),
    listarMovimentosDeUnidade(),
  ]);

  return investimentos.map((investimento) => {
    const doInvestimento = movimentos.get(investimento.id) ?? [];

    const papel = {
      indexador: investimento.indexador,
      percentualIndexador: investimento.percentualIndexador,
      taxaPrefixada: investimento.taxaPrefixada,
      isentoIR: investimento.isentoIR,
    };

    const taxaDoIndexador =
      investimento.indexador && investimento.indexador !== 'PREFIXADO'
        ? (taxas.get(investimento.indexador)?.taxaAnual ?? null)
        : null;

    // Principal de hoje: a soma dos aportes menos o que já saiu (§13.2). Nunca
    // `valor_aplicado`, que é só o registro da primeira aplicação.
    const aplicado = principalVivo(
      parcelasVivas(papel, doInvestimento, taxaDoIndexador, feriados, tabela),
    );

    // Por cotação o valor não é um saldo digitado: sai de quantidade × preço ×
    // câmbio, e o custo sai dos próprios movimentos (§13.2).
    if (investimento.porCotacao) {
      const posicao = posicaoPorCotacao(
        unidades.get(investimento.id) ?? [],
        investimento.precoUnitario,
        investimento.cotacaoMoeda,
      );

      return {
        investimento,
        aplicado: posicao.custoTotal,
        resultado: null,
        saldoExibido: posicao.valorAtual,
        divergencia: null,
        posicao,
      };
    }

    if (!investimento.calculoAutomatico) {
      return {
        investimento,
        aplicado,
        resultado: null,
        saldoExibido: investimento.saldoManual ?? aplicado,
        divergencia: null,
      };
    }

    const resultado = calcularPosicao(
      papel,
      doInvestimento,
      taxaDoIndexador,
      ate,
      feriados,
      tabela,
    );

    return {
      investimento,
      aplicado,
      resultado,
      saldoExibido: resultado.saldoBruto,
      divergencia:
        investimento.saldoConferido === null
          ? null
          : resultado.saldoBruto - investimento.saldoConferido,
    };
  });
}

/** Os movimentos COM unidade, de todas as posições, já agrupados. */
async function listarMovimentosDeUnidade(): Promise<Map<string, MovimentoDeUnidade[]>> {
  const { data, error } = await supabase
    .from('movimentacoes_investimento')
    .select('investimento_id, tipo, data, quantidade, preco_unitario, cotacao_moeda')
    .not('quantidade', 'is', null)
    .order('data');
  if (error) throw error;

  const mapa = new Map<string, MovimentoDeUnidade[]>();

  for (const linha of data ?? []) {
    mapa.set(linha.investimento_id, [
      ...(mapa.get(linha.investimento_id) ?? []),
      {
        data: linha.data,
        quantidade: Number(linha.quantidade ?? 0),
        preco: Number(linha.preco_unitario ?? 0),
        cambio: Number(linha.cotacao_moeda ?? 1),
        tipo: linha.tipo === 'resgate' ? 'saida' : 'entrada',
        origem: linha.tipo === 'recebimento' ? 'recebimento' : 'compra',
      },
    ]);
  }

  return mapa;
}

/** Os movimentos de todas as aplicações, numa consulta só, já agrupados. */
async function listarMovimentos(): Promise<Map<string, Movimento[]>> {
  const { data, error } = await supabase
    .from('movimentacoes_investimento')
    .select('investimento_id, tipo, valor, data, percentual_indexador')
    .order('data');
  if (error) throw error;

  const porInvestimento = new Map<string, Movimento[]>();

  for (const linha of data ?? []) {
    const lista = porInvestimento.get(linha.investimento_id) ?? [];
    lista.push({
      tipo: linha.tipo as 'aporte' | 'resgate',
      valor: paraCentavos(linha.valor),
      data: linha.data,
      percentual:
        linha.percentual_indexador === null ? null : Number(linha.percentual_indexador),
    });
    porInvestimento.set(linha.investimento_id, lista);
  }

  return porInvestimento;
}

/**
 * Aporte novo numa aplicação que já existe (§7.4).
 *
 * Antes, aportar de novo exigia criar um segundo investimento com o mesmo nome.
 * O dinheiro sai da conta como transferência, igual ao primeiro aporte: aplicar
 * não é gastar.
 */
export async function aportarEmInvestimento(dados: {
  investimentoId: string;
  nome: string;
  valor: Centavos;
  data: DataISO;
  contaOrigemId: string;
  contaDaAplicacao?: string | null;
  /** Só quando este aporte foi contratado a uma taxa diferente da aplicação. */
  percentual?: number | null;
  vencimento?: DataISO | null;
}): Promise<void> {
  await registrarMovimento({
    investimentoId: dados.investimentoId,
    tipo: 'aporte',
    valor: dados.valor,
    data: dados.data,
    contaDoCaixa: dados.contaOrigemId,
    contaDaAplicacao: dados.contaDaAplicacao ?? null,
    descricao: `Aplicação em ${dados.nome.trim()}`,
    percentual: dados.percentual ?? null,
    vencimento: dados.vencimento ?? null,
  });
}

export type MovimentoDaAplicacao = {
  id: string;
  tipo: 'aporte' | 'resgate';
  valor: Centavos;
  data: DataISO;
  percentual: number | null;
  vencimento: DataISO | null;
};

/**
 * O histórico de aportes e resgates de uma aplicação (§7.3).
 *
 * Sem ele o saldo era um número só, e conferir com o extrato do banco exigia
 * lembrar de cabeça o que entrou quando — que é exatamente o que a conferência
 * existe para não depender.
 */
export async function listarMovimentosDe(
  investimentoId: string,
): Promise<MovimentoDaAplicacao[]> {
  const { data, error } = await supabase
    .from('movimentacoes_investimento')
    .select('id, tipo, valor, data, percentual_indexador, vencimento')
    .eq('investimento_id', investimentoId)
    .order('data');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    id: linha.id,
    tipo: linha.tipo as 'aporte' | 'resgate',
    valor: paraCentavos(linha.valor),
    data: linha.data,
    percentual: linha.percentual_indexador === null ? null : Number(linha.percentual_indexador),
    vencimento: linha.vencimento,
  }));
}

// ---------------------------------------------------------------------------
// Investimento por cotação (§7.1, §7.4)
// ---------------------------------------------------------------------------

/**
 * Cria uma posição que ainda não tem nada dentro.
 *
 * Diferente do resto: aqui não há aporte inicial. Uma ação recebida da empresa
 * chega em lotes, cada um na sua data e no seu preço, e forçar um "valor
 * aplicado" no cadastro inventaria um lote que não existiu.
 */
export async function criarInvestimentoPorCotacao(novo: {
  nome: string;
  instituicao?: string | null;
  tipo: TipoDeInvestimento;
  moeda: 'BRL' | 'USD';
  contaId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('investimentos')
    .insert({
      nome: novo.nome.trim(),
      instituicao: novo.instituicao?.trim() || null,
      tipo: novo.tipo,
      data_aplicacao: hoje(),
      valor_aplicado: 0,
      conta_id: novo.contaId ?? (await contaDeInvestimentos()),
      liquidez_diaria: true,
      isento_ir: false,
      calculo_automatico: false,
      saldo_manual: null,
      por_cotacao: true,
      moeda: novo.moeda,
      cotacao_moeda: novo.moeda === 'BRL' ? 1 : null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Unidades que chegaram sem sair dinheiro de lugar nenhum (§2.7).
 *
 * Ação da empresa, bonificação, desdobramento. NÃO é aporte: registrado como
 * tal, o app tiraria de uma conta corrente um dinheiro que ela nunca teve, e o
 * saldo cairia alguns milhares de reais que não existiram.
 *
 * Também não é receita agora. Não dá para gastar o que ainda não foi vendido, e
 * contar como renda inflaria "quanto posso gastar" (§8.3) — o erro que o §2.7
 * existe para impedir. Vira renda na venda, que é a mesma regra do §7.4.
 *
 * O preço do dia é guardado porque é o custo de aquisição: sem ele não dá para
 * dizer quanto do valor é ganho, nem entregar ao contador o número que ele pede.
 */
export async function registrarRecebimento(dados: {
  investimentoId: string;
  quantidade: number;
  preco: number;
  cambio: number;
  data: DataISO;
}): Promise<void> {
  const { error } = await supabase.from('movimentacoes_investimento').insert({
    investimento_id: dados.investimentoId,
    tipo: 'recebimento',
    valor: paraNumerico(valorEmReais(dados.quantidade, dados.preco, dados.cambio)),
    data: dados.data,
    quantidade: dados.quantidade,
    preco_unitario: dados.preco,
    cotacao_moeda: dados.cambio,
    // Sem transação: dinheiro nenhum se moveu entre contas.
    transacao_id: null,
  });
  if (error) throw new Error(error.message);

  await atualizarCotacao({
    investimentoId: dados.investimentoId,
    preco: dados.preco,
    cambio: dados.cambio,
    data: dados.data,
  });
}

/**
 * A última cotação conhecida (§7.3, §9.6).
 *
 * Informada, nunca buscada: o app não depende de API para dizer um número, e
 * uma ação americana precisaria de duas fontes — o preço e o câmbio. O que fica
 * guardado é o fato informado, com a DATA, para a tela poder dizer o quanto ele
 * está velho. Um preço de trinta dias atrás não é errado; errado é não avisar.
 */
export async function atualizarCotacao(dados: {
  investimentoId: string;
  preco: number;
  cambio: number;
  data: DataISO;
}): Promise<void> {
  const { error } = await supabase
    .from('investimentos')
    .update({
      preco_unitario: dados.preco,
      cotacao_moeda: dados.cambio,
      data_cotacao: dados.data,
    })
    .eq('id', dados.investimentoId);
  if (error) throw new Error(error.message);
}

/** Os movimentos da posição, na forma que o domínio entende. */
export async function movimentosDeUnidade(
  investimentoId: string,
): Promise<MovimentoDeUnidade[]> {
  const { data, error } = await supabase
    .from('movimentacoes_investimento')
    .select('tipo, data, quantidade, preco_unitario, cotacao_moeda')
    .eq('investimento_id', investimentoId)
    .not('quantidade', 'is', null)
    .order('data');
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    data: linha.data,
    quantidade: Number(linha.quantidade ?? 0),
    preco: Number(linha.preco_unitario ?? 0),
    cambio: Number(linha.cotacao_moeda ?? 1),
    tipo: linha.tipo === 'resgate' ? ('saida' as const) : ('entrada' as const),
    origem: linha.tipo === 'recebimento' ? ('recebimento' as const) : ('compra' as const),
  }));
}

/**
 * Vender: a única hora em que a ação vira dinheiro (§7.4, §2.7).
 *
 * Três linhas porque são três naturezas, e somá-las apagaria a informação que
 * decide o que fazer com o dinheiro:
 *
 *   O que foi COMPRADO um dia volta como transferência — o dinheiro só voltou
 *   de onde saiu, e chamar isso de receita inflaria a renda do mês.
 *
 *   O que foi RECEBIDO nunca passou pelo caixa: é renda agora, e é agora porque
 *   antes não dava para gastar.
 *
 *   O ganho é rendimento realizado, que é o que o §7.4 manda virar receita.
 */
export async function venderUnidades(dados: {
  investimentoId: string;
  nome: string;
  quantidade: number;
  preco: number;
  cambio: number;
  data: DataISO;
  contaDestinoId: string;
  contaDaAplicacao: string | null;
}): Promise<void> {
  const investimento = (await listarInvestimentos(true)).find(
    (i) => i.id === dados.investimentoId,
  );
  if (!investimento) throw new Error('Investimento não encontrado.');

  const posicao = posicaoPorCotacao(
    await movimentosDeUnidade(dados.investimentoId),
    investimento.precoUnitario,
    investimento.cotacaoMoeda,
  );

  if (dados.quantidade > posicao.quantidade) {
    throw new Error(`Você tem ${posicao.quantidade} e está vendendo ${dados.quantidade}.`);
  }

  const contas = contasDaVenda(posicao, dados.quantidade, dados.preco, dados.cambio);

  const comum = {
    data_competencia: dados.data,
    data_caixa: dados.data,
    origem: 'manual' as const,
    revisado: true,
  };

  const linhas: TablesInsert<'transacoes'>[] = [];

  if (contas.devolucaoDeCaixa > 0) {
    linhas.push({
      ...comum,
      conta_id: dados.contaDestinoId,
      valor: paraNumerico(contas.devolucaoDeCaixa),
      tipo: 'transferencia',
      descricao: `Venda de ${dados.nome}`,
    });
  }

  if (contas.remuneracao !== 0) {
    linhas.push({
      ...comum,
      conta_id: dados.contaDestinoId,
      valor: paraNumerico(contas.remuneracao),
      tipo: 'receita',
      descricao: `${dados.nome} — ações recebidas, agora vendidas`,
    });
  }

  if (contas.ganho !== 0) {
    linhas.push({
      ...comum,
      conta_id: dados.contaDestinoId,
      valor: paraNumerico(contas.ganho),
      tipo: contas.ganho > 0 ? 'receita' : 'despesa',
      descricao: `${dados.nome} — ${contas.ganho > 0 ? 'ganho' : 'prejuízo'} na venda`,
    });
  }

  // A perna que tira da conta de investimentos sai só do que ENTROU nela um
  // dia. Ação recebida nunca passou por caixa nenhum: tirar o bruto daqui
  // deixaria a conta de investimentos negativa pelo valor das ações, e ainda
  // impediria o saldo consolidado de subir na venda — quando é justamente aí
  // que aquele dinheiro passa a existir para você.
  if (dados.contaDaAplicacao && contas.devolucaoDeCaixa > 0) {
    linhas.push({
      ...comum,
      conta_id: dados.contaDaAplicacao,
      valor: paraNumerico(-contas.devolucaoDeCaixa),
      tipo: 'transferencia',
      descricao: `Venda de ${dados.nome}`,
    });
  }

  if (linhas.length > 0) {
    const { error } = await supabase.from('transacoes').insert(linhas);
    if (error) throw new Error(error.message);
  }

  const { error: erroMovimento } = await supabase
    .from('movimentacoes_investimento')
    .insert({
      investimento_id: dados.investimentoId,
      tipo: 'resgate',
      valor: paraNumerico(contas.bruto),
      data: dados.data,
      quantidade: dados.quantidade,
      preco_unitario: dados.preco,
      cotacao_moeda: dados.cambio,
    });
  if (erroMovimento) throw new Error(erroMovimento.message);

  await atualizarCotacao({
    investimentoId: dados.investimentoId,
    preco: dados.preco,
    cambio: dados.cambio,
    data: dados.data,
  });
}
