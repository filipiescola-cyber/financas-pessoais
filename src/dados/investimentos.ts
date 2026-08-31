// Investimentos (§7).
//
// O saldo mostrado é ESTIMATIVA até ser conferido (§7.3, §14). O app calcula,
// o banco confirma — e a diferença aparece na tela em vez de ser escondida.

import { paraCentavos, paraNumerico, type Centavos } from '../dominio/dinheiro';
import { hoje, type DataISO } from '../dominio/datas';
import { calcularPosicao, parcelasVivas, principalVivo, type Movimento } from '../dominio/posicao';
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
  /**
   * De qual conta o dinheiro saiu (§7.4).
   *
   * Opcional: quem está cadastrando uma aplicação que já existia antes do app
   * não deve ver um lançamento inventado aparecer na conta. Informado, gera a
   * transferência — que é o que faz o dinheiro sair de algum lugar em vez de
   * surgir do nada.
   */
  contaOrigemId?: string | null;
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
    descricao: `Aplicação em ${novo.nome.trim()}`,
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
  descricao: string;
}): Promise<void> {
  const ehAporte = dados.tipo === 'aporte';

  const ids = dados.contaDoCaixa
    ? await criarTransferencia({
        valor: dados.valor,
        contaOrigemId: ehAporte ? dados.contaDoCaixa : await contaDeInvestimentos(),
        contaDestinoId: ehAporte ? await contaDeInvestimentos() : dados.contaDoCaixa,
        data: dados.data,
        descricao: dados.descricao,
      })
    : [];

  const { error } = await supabase.from('movimentacoes_investimento').insert({
    investimento_id: dados.investimentoId,
    tipo: dados.tipo,
    valor: paraNumerico(dados.valor),
    data: dados.data,
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
  await registrarMovimento({
    investimentoId: dados.investimentoId,
    tipo: 'resgate',
    valor: dados.valor,
    data: dados.data,
    contaDoCaixa: dados.contaDestinoId,
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
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
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
};

/**
 * Calcula todos os investimentos de uma vez.
 *
 * Uma leitura só de feriados, taxas e tabela de IR para o conjunto inteiro: são
 * os mesmos dados para todas as aplicações, e buscar por aplicação seria
 * desperdício num plano gratuito.
 */
export async function calcularTodos(ate: DataISO = hoje()): Promise<InvestimentoCalculado[]> {
  const [investimentos, feriados, taxas, tabela, movimentos] = await Promise.all([
    listarInvestimentos(),
    listarFeriados(),
    taxasVigentes(),
    tabelaDeIR(),
    listarMovimentos(),
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
      parcelasVivas(papel, doInvestimento, taxaDoIndexador, feriados),
    );

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

/** Os movimentos de todas as aplicações, numa consulta só, já agrupados. */
async function listarMovimentos(): Promise<Map<string, Movimento[]>> {
  const { data, error } = await supabase
    .from('movimentacoes_investimento')
    .select('investimento_id, tipo, valor, data')
    .order('data');
  if (error) throw error;

  const porInvestimento = new Map<string, Movimento[]>();

  for (const linha of data ?? []) {
    const lista = porInvestimento.get(linha.investimento_id) ?? [];
    lista.push({
      tipo: linha.tipo as 'aporte' | 'resgate',
      valor: paraCentavos(linha.valor),
      data: linha.data,
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
}): Promise<void> {
  await registrarMovimento({
    investimentoId: dados.investimentoId,
    tipo: 'aporte',
    valor: dados.valor,
    data: dados.data,
    contaDoCaixa: dados.contaOrigemId,
    descricao: `Aplicação em ${dados.nome.trim()}`,
  });
}
