// Projeção de fluxo de caixa (§8).
//
// "Para quem tem renda fixa, 'posso comprar?' se responde olhando o saldo. Para
// quem tem renda variável, o saldo de hoje não responde nada."
//
// Duas decisões dominam este arquivo:
//
//   MEDIANA, NUNCA MÉDIA (§8.3). Um mês excepcional distorce a média e infla a
//   projeção justamente para quem menos pode errar. A mediana ignora o outlier.
//
//   CONFIANÇA EXPLÍCITA (§8.2). Parcela já lançada é fato consumado; mediana de
//   variável é chute educado. Os dois entram na conta, mas a tela precisa dizer
//   qual é qual — "uma projeção que finge precisão é pior do que projeção nenhuma".

import type { Centavos } from './dinheiro';
import { primeiroDiaDoMes, somarMeses, type DataISO } from './datas';

export type Cenario = 'pessimista' | 'provavel' | 'otimista';

export type Confianca = 'alta' | 'media' | 'baixa';

/**
 * Mediana. Com número par de elementos, a média dos dois centrais.
 * Lista vazia devolve null — e não zero: "ainda não sei" é diferente de "zero".
 */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);

  return ordenados.length % 2 === 1
    ? ordenados[meio]!
    : Math.round((ordenados[meio - 1]! + ordenados[meio]!) / 2);
}

export type OrigemDaRenda = 'historico' | 'recorrencia' | 'semente' | 'ausente';

export type RendaProjetada = {
  pessimista: Centavos;
  provavel: Centavos;
  otimista: Centavos;
  origem: OrigemDaRenda;
  mesesDeHistorico: number;
};

/** A partir daqui a mediana real substitui as sementes do onboarding (§8.3). */
export const MESES_PARA_CONFIAR_NO_HISTORICO = 3;

/**
 * Renda projetada em três cenários (§8.3).
 *
 * `historicoMensal` deve conter só receita de natureza fixa e variável — venda
 * de bem, reembolso e restituição ficam de fora (§2.7). São altas e isoladas, e
 * dentro da janela puxam a mediana para cima, fazendo o app dizer que dá para
 * gastar mais do que dá.
 */
export function projetarRenda(
  historicoMensal: readonly Centavos[],
  sementes: { mesTipico: Centavos; mesRuim: Centavos } | null,
  /**
   * Soma das recorrências de receita cadastradas (§4.5).
   *
   * Fonte fixa vira recorrência, e o §4.5 promete que ela "já entra na projeção
   * desde o primeiro dia". Sem isso, cadastrar o salário no onboarding não
   * mudava nada na tela até três meses de histórico existirem — que é
   * exatamente quando a projeção deixa de precisar dela.
   *
   * Ela NÃO é somada quando há histórico: a recorrência gera lançamento todo
   * mês, então o salário já está dentro do histórico e somar de novo dobraria.
   */
  rendaFixaCadastrada: Centavos = 0,
): RendaProjetada {
  const meses = historicoMensal.length;

  if (meses >= MESES_PARA_CONFIAR_NO_HISTORICO) {
    const ultimos12 = historicoMensal.slice(-12);
    const ultimos6 = historicoMensal.slice(-6);

    return {
      // Decisão de compra se toma olhando o pior mês, não o provável (§8.3).
      pessimista: Math.min(...ultimos12),
      provavel: mediana(ultimos6) ?? 0,
      otimista: Math.max(...ultimos12),
      origem: 'historico',
      mesesDeHistorico: meses,
    };
  }

  // Renda fixa é certeza; a variável é estimativa. Os cenários existem para a
  // segunda, então a primeira entra igual nos três.
  if (sementes) {
    return {
      pessimista: rendaFixaCadastrada + sementes.mesRuim,
      provavel: rendaFixaCadastrada + sementes.mesTipico,
      // Sem histórico não há como estimar um mês bom sem inventar. O otimista
      // fica igual ao típico em vez de virar um número imaginado.
      otimista: rendaFixaCadastrada + sementes.mesTipico,
      origem: 'semente',
      mesesDeHistorico: meses,
    };
  }

  if (rendaFixaCadastrada > 0) {
    return {
      pessimista: rendaFixaCadastrada,
      provavel: rendaFixaCadastrada,
      otimista: rendaFixaCadastrada,
      origem: 'recorrencia',
      mesesDeHistorico: meses,
    };
  }

  return {
    pessimista: 0,
    provavel: 0,
    otimista: 0,
    origem: 'ausente',
    mesesDeHistorico: meses,
  };
}

export type ComponentesDoMes = {
  /** Recorrências de despesa cadastradas. Confiança alta. */
  fixas: Centavos;
  /** Parcelas e recorrências já gravadas com data futura. Fato consumado. */
  jaLancado: Centavos;
  /** Anual dividido por 12 (§2.5). Confiança média. */
  provisaoEventual: Centavos;
  /** Mediana das variáveis. Confiança baixa. */
  variaveis: Centavos;
  /**
   * Eventual com data conhecida: IPVA, IPTU, seguro (§2.5).
   *
   * Entra no MÊS em que cai, e não diluído em doze, porque aqui a data é
   * sabida. A provisão existe para o eventual que ainda não tem data — quando
   * ela tem, suavizar esconderia justamente o mês em que o dinheiro sai.
   */
  eventualDatado: Centavos;
};

export type MesProjetado = {
  mes: DataISO;
  saldoInicial: Centavos;
  receita: Centavos;
  /** Aplicação que vence neste mês e volta a ser dinheiro disponível. */
  liberado: Centavos;
  saidas: ComponentesDoMes;
  totalDeSaidas: Centavos;
  saldoFinal: Centavos;
};

export type EntradaDaProjecao = {
  saldoAtual: Centavos;
  aPartirDe: DataISO;
  horizonteEmMeses: number;
  renda: RendaProjetada;
  fixasMensais: Centavos;
  /**
   * As fixas que têm prazo, com a data da última parcela.
   *
   * Ficam separadas das outras porque param: financiamento de 36x, curso de
   * 12x, consórcio. Somadas ao total mensal, elas manteriam o mês 20 tão
   * pesado quanto o mês 1 — e o alívio que a última parcela traz, que é
   * exatamente o que se quer enxergar num fluxo de caixa, nunca apareceria.
   *
   * Cada recorrência está em UMA das duas listas, nunca nas duas.
   */
  fixasComPrazo: { valor: Centavos; ate: DataISO }[];
  provisaoEventualMensal: Centavos;
  medianaDasVariaveis: Centavos;
  /** Já gravado no banco, por mês: parcelas e recorrências futuras (§13.2). */
  jaLancadoPorMes: Readonly<Record<DataISO, Centavos>>;
  /** Recorrência ANUAL cadastrada, no mês em que cai (§2.5). */
  anuaisPorMes?: Readonly<Record<DataISO, Centavos>>;
  /**
   * Aplicação presa que vence, por mês (§4.6, §7.1).
   *
   * O saldo de partida já vem sem o que está travado — um CDB de 2028 não é
   * dinheiro para gastar. Mas ele volta a ser no dia do vencimento, e sem esta
   * entrada a projeção desceria pelo travado e nunca subiria: o mês em que o
   * papel vence apareceria apertado por causa do dinheiro que chega nele.
   */
  liberacoesPorMes?: Readonly<Record<DataISO, Centavos>>;
};

/**
 * Projeta N meses à frente, encadeando o saldo final de um mês no inicial do
 * seguinte. Valores de saída são positivos aqui; o sinal é aplicado na conta.
 */
export function projetarFluxo(entrada: EntradaDaProjecao, cenario: Cenario): MesProjetado[] {
  const receita = entrada.renda[cenario];
  const meses: MesProjetado[] = [];

  let saldo = entrada.saldoAtual;

  for (let i = 0; i < entrada.horizonteEmMeses; i += 1) {
    const mes = primeiroDiaDoMes(somarMeses(entrada.aPartirDe, i));

    const aindaPesa = entrada.fixasComPrazo.reduce(
      (total, fixa) => (mes <= fixa.ate ? total + fixa.valor : total),
      0,
    );

    const saidas: ComponentesDoMes = {
      fixas: entrada.fixasMensais + aindaPesa,
      jaLancado: entrada.jaLancadoPorMes[mes] ?? 0,
      provisaoEventual: entrada.provisaoEventualMensal,
      variaveis: entrada.medianaDasVariaveis,
      eventualDatado: entrada.anuaisPorMes?.[mes] ?? 0,
    };

    const totalDeSaidas =
      saidas.fixas +
      saidas.jaLancado +
      saidas.provisaoEventual +
      saidas.variaveis +
      saidas.eventualDatado;

    const liberado = entrada.liberacoesPorMes?.[mes] ?? 0;

    const saldoInicial = saldo;
    saldo = saldoInicial + receita + liberado - totalDeSaidas;

    meses.push({
      mes,
      saldoInicial,
      receita,
      liberado,
      saidas,
      totalDeSaidas,
      saldoFinal: saldo,
    });
  }

  return meses;
}

/**
 * O que sobra ou falta NO mês, sem o acumulado (§8.2).
 *
 * A tela mostrava só o saldo acumulado, que desce em bloco e não explica nada:
 * dá para olhar doze meses de números vermelhos crescendo sem descobrir que a
 * causa é a mesma toda vez, e que ela cabe numa linha — entram seis mil, saem
 * nove e oitocentos.
 */
export function resultadoDoMes(mes: MesProjetado): Centavos {
  return mes.receita - mes.totalDeSaidas;
}

export type Diagnostico = {
  /** O resultado de um mês típico. Mediana, nunca média (§8.3). */
  tipico: Centavos;
  mesesNoVermelho: number;
  totalDeMeses: number;
  /** A maior saída, com nome. É por onde começa quem quer mudar o número. */
  maiorSaida: { nome: string; valor: Centavos } | null;
};

const NOME_DA_SAIDA: Record<keyof ComponentesDoMes, string> = {
  fixas: 'as despesas fixas',
  jaLancado: 'as parcelas já assumidas',
  provisaoEventual: 'a provisão para despesas eventuais',
  variaveis: 'os gastos variáveis',
  eventualDatado: 'as despesas anuais',
};

/**
 * O buraco, em uma frase (§8.1).
 *
 * A pergunta do fluxo de caixa não é "quanto vou ter em julho de 2027" — é
 * "por que isso está descendo e o que faz parar". A mediana responde a
 * primeira metade; a maior saída aponta onde mexer para a segunda.
 *
 * Mediana e não média porque um mês com IPVA ou 13º puxaria o número para um
 * lado que não descreve nenhum mês real (§8.3).
 */
export function diagnosticar(projecao: readonly MesProjetado[]): Diagnostico | null {
  if (projecao.length === 0) return null;

  const tipico = mediana(projecao.map(resultadoDoMes)) ?? 0;

  // A composição do mês típico serve de referência: pegar o primeiro mês
  // mostraria a parcela que acaba em três meses como se fosse permanente.
  const referencia =
    [...projecao].sort((a, b) => resultadoDoMes(a) - resultadoDoMes(b))[
      Math.floor(projecao.length / 2)
    ] ?? projecao[0]!;

  const saidas = (Object.keys(NOME_DA_SAIDA) as (keyof ComponentesDoMes)[])
    .map((chave) => ({ nome: NOME_DA_SAIDA[chave], valor: referencia.saidas[chave] }))
    .filter((s) => s.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  return {
    tipico,
    mesesNoVermelho: projecao.filter((m) => m.saldoFinal < 0).length,
    totalDeMeses: projecao.length,
    maiorSaida: saidas[0] ?? null,
  };
}

/** O mês mais apertado da projeção. É esse número que muda comportamento (§8.4). */
export function piorMes(projecao: readonly MesProjetado[]): MesProjetado | null {
  if (projecao.length === 0) return null;
  return projecao.reduce((pior, mes) => (mes.saldoFinal < pior.saldoFinal ? mes : pior));
}

export function primeiroMesNegativo(projecao: readonly MesProjetado[]): MesProjetado | null {
  return projecao.find((mes) => mes.saldoFinal < 0) ?? null;
}

export type ImpactoDaCompra = {
  piorMesAntes: MesProjetado | null;
  piorMesDepois: MesProjetado | null;
  primeiroNegativoAntes: MesProjetado | null;
  primeiroNegativoDepois: MesProjetado | null;
  compromissoAntes: Centavos;
  compromissoDepois: Centavos;
  /** Último mês em que a compra ainda pesa. */
  ultimaParcela: DataISO | null;
  valorDaParcela: Centavos;
  /**
   * As duas projeções inteiras, mês a mês e na mesma ordem.
   *
   * O pior mês responde "dá ou não dá", mas não mostra o formato do estrago:
   * uma compra que aperta três meses e passa é diferente de uma que baixa o
   * saldo para sempre, e as duas podem ter o mesmo pior mês.
   */
  antes: MesProjetado[];
  depois: MesProjetado[];
};

/**
 * Simulador de impacto de compra (§8.4). "O recurso mais útil do app inteiro."
 *
 * Não grava nada e não moraliza: devolve números, e a tela mostra sem opinar.
 * A decisão é do usuário.
 */
export function simularCompra(
  entrada: EntradaDaProjecao,
  cenario: Cenario,
  compra: { valor: Centavos; parcelas: number; primeiroMes: DataISO },
): ImpactoDaCompra {
  const antes = projetarFluxo(entrada, cenario);

  const parcelas = Math.max(1, Math.trunc(compra.parcelas));
  const valorTotal = Math.abs(compra.valor);
  const valorDaParcela = Math.floor(valorTotal / parcelas);
  const resto = valorTotal - valorDaParcela * parcelas;

  const acrescimo: Record<DataISO, Centavos> = {};
  let ultimaParcela: DataISO | null = null;

  for (let i = 0; i < parcelas; i += 1) {
    const mes = primeiroDiaDoMes(somarMeses(compra.primeiroMes, i));
    // O resto vai na última parcela, igual ao §13.1.
    const valor = i === parcelas - 1 ? valorDaParcela + resto : valorDaParcela;
    acrescimo[mes] = (acrescimo[mes] ?? 0) + valor;
    ultimaParcela = mes;
  }

  const comCompra: Record<DataISO, Centavos> = { ...entrada.jaLancadoPorMes };
  for (const [mes, valor] of Object.entries(acrescimo)) {
    comCompra[mes] = (comCompra[mes] ?? 0) + valor;
  }

  const depois = projetarFluxo({ ...entrada, jaLancadoPorMes: comCompra }, cenario);

  return {
    piorMesAntes: piorMes(antes),
    piorMesDepois: piorMes(depois),
    primeiroNegativoAntes: primeiroMesNegativo(antes),
    primeiroNegativoDepois: primeiroMesNegativo(depois),
    compromissoAntes: compromissoMensal(entrada.jaLancadoPorMes, entrada.aPartirDe),
    compromissoDepois: compromissoMensal(comCompra, entrada.aPartirDe),
    ultimaParcela,
    valorDaParcela,
    antes,
    depois,
  };
}

/**
 * Compromisso mensal já assumido (§8.5): o quanto de cada mês futuro já está
 * gasto antes de o mês começar.
 *
 * "12x sem juros parece gratuito. Não é — é renda futura já gasta."
 */
export function compromissoMensal(
  jaLancadoPorMes: Readonly<Record<DataISO, Centavos>>,
  aPartirDe: DataISO,
): Centavos {
  const proximo = primeiroDiaDoMes(somarMeses(aPartirDe, 1));
  return jaLancadoPorMes[proximo] ?? 0;
}

/**
 * Em que mês o compromisso acaba (§8.5). "A data em que a folga volta é
 * informação motivadora e ninguém sabe de cabeça."
 */
export function mesEmQueOCompromissoAcaba(
  jaLancadoPorMes: Readonly<Record<DataISO, Centavos>>,
): DataISO | null {
  const comValor = Object.entries(jaLancadoPorMes)
    .filter(([, valor]) => valor > 0)
    .map(([mes]) => mes)
    .sort();

  return comValor[comValor.length - 1] ?? null;
}

export const ROTULO_CENARIO: Record<Cenario, string> = {
  pessimista: 'Mês ruim',
  provavel: 'Mês típico',
  otimista: 'Mês bom',
};

export type EspecieDoCompromisso = 'fixa' | 'divida' | 'parcela' | 'estimativa';

export type Compromisso = {
  nome: string;
  /** Para agrupar. Nulo em compromisso que ninguém categorizou ainda. */
  categoriaId: string | null;
  valor: Centavos;
  /** Última competência em que ele pesa. Nulo quando não tem fim. */
  ate: DataISO | null;
  especie: EspecieDoCompromisso;
};

/**
 * Para onde o dinheiro vai, com NOME (§8.5).
 *
 * "Fixas: R$ 5.094" é uma caixa-preta: o número diz o tamanho do problema e
 * esconde o problema. Quem olha um fluxo de caixa quer saber o que cortar ou
 * quando acaba, e as duas respostas dependem de saber o que está lá dentro.
 *
 * Ordena por valor porque é assim que se decide: o primeiro item costuma valer
 * mais do que os cinco últimos somados, e mexer nele é o que muda o número.
 */
export function compromissosDoMes(
  compromissos: readonly Compromisso[],
  mes: DataISO,
): Compromisso[] {
  return compromissos
    .filter((c) => c.valor > 0 && (c.ate === null || mes <= c.ate))
    .sort((a, b) => b.valor - a.valor);
}

/** Quantos meses faltam até o compromisso sair da conta. Nulo se não acaba. */
export function mesesRestantes(compromisso: Compromisso, mes: DataISO): number | null {
  if (compromisso.ate === null) return null;
  const [anoA, mesA] = mes.split('-').map(Number);
  const [anoB, mesB] = compromisso.ate.split('-').map(Number);
  return Math.max(0, (anoB! - anoA!) * 12 + (mesB! - mesA!) + 1);
}

export type GrupoDeCategoria = {
  categoriaId: string | null;
  total: Centavos;
  itens: Compromisso[];
};

/**
 * O mesmo dinheiro, arrumado por categoria (§2.5).
 *
 * Uma lista de vinte compromissos soltos responde "o que é isso" e não responde
 * "onde eu gasto" — e é a segunda pergunta que decide corte. Categoria é a
 * unidade em que se pensa gasto: ninguém corta "Claro Internet", corta
 * "Assinaturas".
 *
 * Ordena os grupos por total e os itens dentro deles também: em qualquer nível,
 * o que está no topo é onde mexer muda o número.
 */
export function agruparPorCategoria(
  compromissos: readonly Compromisso[],
): GrupoDeCategoria[] {
  const grupos = new Map<string, GrupoDeCategoria>();

  for (const item of compromissos) {
    const chave = item.categoriaId ?? '';
    const atual = grupos.get(chave) ?? {
      categoriaId: item.categoriaId,
      total: 0,
      itens: [],
    };

    atual.total += item.valor;
    atual.itens.push(item);
    grupos.set(chave, atual);
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, itens: [...g.itens].sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => b.total - a.total);
}

export type OpcaoDeMes = {
  mes: DataISO;
  /** O pior saldo da projeção inteira, se a compra começar neste mês. */
  piorSaldo: Centavos;
  ficaNegativo: boolean;
};

/**
 * E se eu comprar mês que vem? (§8.4)
 *
 * A mesma compra em meses diferentes dá resultados diferentes, e a diferença
 * não é intuitiva: adiar um mês pode não resolver nada — se o aperto vem de
 * parcelas que só acabam em março, empurrar para fevereiro muda pouco — como
 * pode resolver tudo, se o mês seguinte é o que uma dívida termina.
 *
 * Só a conta responde, e ela é a mesma simulação repetida.
 */
export function mesesParaComprar(
  entrada: EntradaDaProjecao,
  cenario: Cenario,
  compra: { valor: Centavos; parcelas: number },
  quantosMeses = 6,
): OpcaoDeMes[] {
  const opcoes: OpcaoDeMes[] = [];

  for (let i = 0; i < quantosMeses; i += 1) {
    const mes = primeiroDiaDoMes(somarMeses(entrada.aPartirDe, i));
    const pior = simularCompra(entrada, cenario, { ...compra, primeiroMes: mes }).piorMesDepois;
    const piorSaldo = pior?.saldoFinal ?? 0;

    opcoes.push({ mes, piorSaldo, ficaNegativo: piorSaldo < 0 });
  }

  return opcoes;
}

/**
 * O mês indicado: o PRIMEIRO que não fica negativo.
 *
 * Primeiro, e não o de maior folga: adiar além do necessário não melhora nada
 * que interesse — só empurra a compra, e o app não está aqui para convencer
 * ninguém a esperar (§8.4, "não moralizar").
 *
 * Quando nenhum escapa, devolve o de menor estrago. Continua sendo informação:
 * "não tem mês bom" é uma resposta, e é melhor que silêncio.
 */
export function melhorMesParaComprar(opcoes: readonly OpcaoDeMes[]): OpcaoDeMes | null {
  if (opcoes.length === 0) return null;

  return (
    opcoes.find((o) => !o.ficaNegativo) ??
    opcoes.reduce((melhor, o) => (o.piorSaldo > melhor.piorSaldo ? o : melhor))
  );
}
