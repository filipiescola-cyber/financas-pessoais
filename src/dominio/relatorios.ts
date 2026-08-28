// Agregações de relatório (§11, §2.5).
//
// Funções puras: entram transações, saem números. É aqui que erro fica
// silencioso — um filtro errado não quebra a tela, só mostra o número errado
// com confiança — então tudo aqui é testado (§13.4).
//
// Três regras que atravessam este arquivo:
//
//   Relatório de gasto usa COMPETÊNCIA, não caixa (§2.4). A compra de dezembro
//   parcelada é gasto de dezembro, mesmo que o dinheiro só saia em março.
//
//   Transferência nunca entra em receita nem em despesa (§2.3). Inclui
//   pagamento de fatura e aporte na conta Empresa.
//
//   Filha de divisão entra no relatório por categoria; o pai, não (§5.5).
//   Nos totais é o contrário. Contar os dois dobra tudo.

import type { Centavos } from './dinheiro';
import { primeiroDiaDoMes, somarMeses, ultimoDiaDoMes, type DataISO } from './datas';
import type { Natureza } from './natureza';

export type TransacaoDeRelatorio = {
  valor: Centavos;
  tipo: 'receita' | 'despesa' | 'transferencia';
  dataCompetencia: DataISO;
  categoriaId: string | null;
  natureza: Natureza | null;
  transacaoPaiId: string | null;
  temFilhas: boolean;
};

const ehMovimento = (t: TransacaoDeRelatorio) => t.tipo !== 'transferencia';

/**
 * Para somar totais: o pai conta, as filhas não. O pai é o valor que saiu de
 * fato da conta; as filhas só repartem esse valor entre categorias.
 */
const contaNoTotal = (t: TransacaoDeRelatorio) => ehMovimento(t) && t.transacaoPaiId === null;

/**
 * Para repartir por categoria: quem tem filhas cede o lugar a elas, porque são
 * elas que carregam as categorias verdadeiras da compra dividida.
 */
const contaPorCategoria = (t: TransacaoDeRelatorio) => ehMovimento(t) && !t.temFilhas;

export function totalDeReceitas(transacoes: readonly TransacaoDeRelatorio[]): Centavos {
  return transacoes
    .filter((t) => contaNoTotal(t) && t.tipo === 'receita')
    .reduce((soma, t) => soma + t.valor, 0);
}

export function totalDeDespesas(transacoes: readonly TransacaoDeRelatorio[]): Centavos {
  return Math.abs(
    transacoes
      .filter((t) => contaNoTotal(t) && t.tipo === 'despesa')
      .reduce((soma, t) => soma + t.valor, 0),
  );
}

export type FatiaPorCategoria = {
  categoriaId: string | null;
  total: Centavos;
  quantidade: number;
};

/** Gasto por categoria, do maior para o menor. Valores em positivo. */
export function gastoPorCategoria(
  transacoes: readonly TransacaoDeRelatorio[],
): FatiaPorCategoria[] {
  const soma = new Map<string | null, { total: Centavos; quantidade: number }>();

  for (const transacao of transacoes) {
    if (!contaPorCategoria(transacao) || transacao.tipo !== 'despesa') continue;
    const atual = soma.get(transacao.categoriaId) ?? { total: 0, quantidade: 0 };
    soma.set(transacao.categoriaId, {
      total: atual.total + Math.abs(transacao.valor),
      quantidade: atual.quantidade + 1,
    });
  }

  return [...soma.entries()]
    .map(([categoriaId, { total, quantidade }]) => ({ categoriaId, total, quantidade }))
    .sort((a, b) => b.total - a.total);
}

export type PorNatureza = {
  fixa: Centavos;
  variavel: Centavos;
  eventual: Centavos;
  semNatureza: Centavos;
};

/**
 * Despesa separada em fixa, variável e eventual (§2.5).
 *
 * Devolve os três separados de propósito e NÃO devolve um total: "o número
 * consolidado esconde exatamente a informação que interessa". Quem quiser o
 * total soma na tela, sabendo o que está fazendo.
 */
export function despesaPorNatureza(transacoes: readonly TransacaoDeRelatorio[]): PorNatureza {
  const resultado: PorNatureza = { fixa: 0, variavel: 0, eventual: 0, semNatureza: 0 };

  for (const transacao of transacoes) {
    if (!contaPorCategoria(transacao) || transacao.tipo !== 'despesa') continue;
    const valor = Math.abs(transacao.valor);

    if (transacao.natureza === 'fixa') resultado.fixa += valor;
    else if (transacao.natureza === 'variavel') resultado.variavel += valor;
    else if (transacao.natureza === 'eventual') resultado.eventual += valor;
    else resultado.semNatureza += valor;
  }

  return resultado;
}

export type MesDoRelatorio = {
  mes: DataISO;
  receitas: Centavos;
  despesas: Centavos;
};

/**
 * Evolução mês a mês, do mais antigo para o mais recente.
 *
 * Meses sem movimento aparecem zerados de propósito: o buraco no meio da série
 * é informação — some se a série pular o mês.
 */
export function evolucaoMensal(
  transacoes: readonly TransacaoDeRelatorio[],
  ateOMes: DataISO,
  quantidadeDeMeses: number,
): MesDoRelatorio[] {
  const meses: MesDoRelatorio[] = [];

  for (let i = quantidadeDeMeses - 1; i >= 0; i -= 1) {
    const mes = primeiroDiaDoMes(somarMeses(ateOMes, -i));
    const fim = ultimoDiaDoMes(mes);
    const doMes = transacoes.filter(
      (t) => t.dataCompetencia >= mes && t.dataCompetencia <= fim,
    );

    meses.push({
      mes,
      receitas: totalDeReceitas(doMes),
      despesas: totalDeDespesas(doMes),
    });
  }

  return meses;
}

/**
 * Quantos meses já têm movimento. O §13.5 pede que o relatório diga "precisa de
 * pelo menos um mês fechado" em vez de desenhar um gráfico vazio.
 */
export function mesesComMovimento(transacoes: readonly TransacaoDeRelatorio[]): number {
  const meses = new Set(
    transacoes.filter(ehMovimento).map((t) => t.dataCompetencia.slice(0, 7)),
  );
  return meses.size;
}
