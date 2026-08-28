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
};

export type MesProjetado = {
  mes: DataISO;
  saldoInicial: Centavos;
  receita: Centavos;
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
  provisaoEventualMensal: Centavos;
  medianaDasVariaveis: Centavos;
  /** Já gravado no banco, por mês: parcelas e recorrências futuras (§13.2). */
  jaLancadoPorMes: Readonly<Record<DataISO, Centavos>>;
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

    const saidas: ComponentesDoMes = {
      fixas: entrada.fixasMensais,
      jaLancado: entrada.jaLancadoPorMes[mes] ?? 0,
      provisaoEventual: entrada.provisaoEventualMensal,
      variaveis: entrada.medianaDasVariaveis,
    };

    const totalDeSaidas =
      saidas.fixas + saidas.jaLancado + saidas.provisaoEventual + saidas.variaveis;

    const saldoInicial = saldo;
    saldo = saldoInicial + receita - totalDeSaidas;

    meses.push({ mes, saldoInicial, receita, saidas, totalDeSaidas, saldoFinal: saldo });
  }

  return meses;
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

