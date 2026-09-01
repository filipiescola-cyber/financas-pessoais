// Orçamento, metas e reserva de emergência (§8.6, §8.8, §5.3).
//
// Funções puras. Três ideias que valem mais que o código:
//
//   O ritmo importa mais que o total. Gastar 60% do orçamento no dia 5 é
//   diferente de gastar 60% no dia 25, e um número solto não distingue os dois.
//
//   Reserva se mede em MESES, não em reais (§8.8). "Você tem R$ 8.000" não diz
//   nada; "você tem 3,2 meses de custo fixo coberto" diz tudo.
//
//   O denominador da reserva é a despesa FIXA, não a total: em emergência real
//   as variáveis são a primeira coisa que se corta.

import type { Centavos } from './dinheiro';
import { diasNoMes, somarMeses, ultimoDiaDoMes, type DataISO } from './datas';

export type SituacaoDoOrcamento = 'dentro' | 'atencao' | 'estourado';

export type ProgressoDoOrcamento = {
  planejado: Centavos;
  realizado: Centavos;
  restante: Centavos;
  /** 0 a 1 e além: 1.2 significa 20% acima do teto. */
  proporcaoGasta: number;
  /** Quanto do mês já passou, de 0 a 1. */
  proporcaoDoMes: number;
  situacao: SituacaoDoOrcamento;
  /** true quando o gasto corre mais rápido que o calendário. */
  acimaDoRitmo: boolean;
};

/** O §8.6 alerta em 80% antes do dia 20 — é o ponto em que ainda dá para reagir. */
export const LIMIAR_DE_ATENCAO = 0.8;

export function progressoDoOrcamento(
  planejado: Centavos,
  realizado: Centavos,
  data: DataISO,
): ProgressoDoOrcamento {
  const [ano, mes, dia] = data.split('-').map(Number);
  const proporcaoDoMes = dia! / diasNoMes(ano!, mes!);

  // Sem teto definido não há progresso a medir: proporção zero em vez de
  // divisão por zero virando Infinity na tela.
  const proporcaoGasta = planejado > 0 ? realizado / planejado : 0;

  const situacao: SituacaoDoOrcamento =
    proporcaoGasta > 1 ? 'estourado' : proporcaoGasta >= LIMIAR_DE_ATENCAO ? 'atencao' : 'dentro';

  return {
    planejado,
    realizado,
    restante: planejado - realizado,
    proporcaoGasta,
    proporcaoDoMes,
    situacao,
    // Comparar com o calendário é o que transforma o número em informação
    // acionável: 60% no dia 5 é problema, 60% no dia 25 é normal.
    acimaDoRitmo: planejado > 0 && proporcaoGasta > proporcaoDoMes,
  };
}

/**
 * Vale alertar? O §8.6 é restritivo de propósito: "alerta que dispara demais é
 * silenciado, e junto com ele some o alerta que importava".
 */
export function mereceAlerta(progresso: ProgressoDoOrcamento, data: DataISO): boolean {
  const dia = Number(data.split('-')[2]);
  if (progresso.planejado === 0) return false;
  if (progresso.situacao === 'estourado') return true;
  // Depois do dia 20 chegar em 80% é esperado — avisar aí seria ruído.
  return progresso.situacao === 'atencao' && dia < 20;
}

export type ProgressoDaMeta = {
  valorAlvo: Centavos;
  valorAtual: Centavos;
  falta: Centavos;
  proporcao: number;
  concluida: boolean;
};

export function progressoDaMeta(valorAlvo: Centavos, valorAtual: Centavos): ProgressoDaMeta {
  const proporcao = valorAlvo > 0 ? Math.min(valorAtual / valorAlvo, 1) : 0;
  return {
    valorAlvo,
    valorAtual,
    falta: Math.max(valorAlvo - valorAtual, 0),
    proporcao,
    concluida: valorAlvo > 0 && valorAtual >= valorAlvo,
  };
}

export type Reserva = {
  /** Quantos meses de custo fixo o saldo cobre. null quando não há custo fixo. */
  mesesCobertos: number | null;
  custoFixoMensal: Centavos;
  saldo: Centavos;
  /** 6 meses para renda variável, 3 para renda fixa (§8.8). */
  referencia: number;
  suficiente: boolean;
};

/**
 * Reserva de emergência medida em meses (§8.8).
 *
 * Sem custo fixo cadastrado devolve null, não zero nem infinito: "ainda não
 * sei" é uma resposta melhor do que um número inventado (§13.5).
 */
export function calcularReserva(
  saldo: Centavos,
  custoFixoMensal: Centavos,
  rendaIrregular: boolean,
): Reserva {
  const referencia = rendaIrregular ? 6 : 3;

  if (custoFixoMensal <= 0) {
    return { mesesCobertos: null, custoFixoMensal, saldo, referencia, suficiente: false };
  }

  const mesesCobertos = saldo / custoFixoMensal;
  return {
    mesesCobertos,
    custoFixoMensal,
    saldo,
    referencia,
    suficiente: mesesCobertos >= referencia,
  };
}

export type Conferencia = {
  saldoDoApp: Centavos;
  saldoReal: Centavos;
  diferenca: Centavos;
  bate: boolean;
};

/**
 * Conferência de saldo (§5.3).
 *
 * "Sem integração bancária o saldo do app derrapa com o tempo." A diferença
 * nunca é corrigida por trás: ela vira um lançamento explícito na categoria
 * "Ajuste de saldo", para o histórico continuar contando a verdade.
 *
 * Sinal da diferença = o valor do lançamento de ajuste. Positivo significa que
 * o banco tem mais do que o app achava, então entra dinheiro.
 */
/**
 * Em que data a conferência começa olhando (§5.3, §8.7).
 *
 * O lembrete é no dia 1º, e quem abre a tela no dia 1º está fechando o mês que
 * ACABOU — o extrato que ele tem na mão é o de agosto, não o saldo de hoje.
 * Comparar contra hoje faz a diferença aparecer onde ela não está: o saldo de
 * 1º de setembro já tem o salário e as contas do dia, que não estavam no mês
 * que se quer fechar.
 *
 * Depois dos primeiros dias a pergunta muda: aí é conferência avulsa, e o dia
 * de hoje é o certo. A tela deixa trocar dos dois jeitos — isto é só por onde
 * ela abre.
 */
export function dataPadraoDaConferencia(hoje: DataISO): DataISO {
  const dia = Number(hoje.slice(8, 10));
  return dia <= 5 ? ultimoDiaDoMes(somarMeses(hoje, -1)) : hoje;
}

export function conferir(saldoDoApp: Centavos, saldoReal: Centavos): Conferencia {
  const diferenca = saldoReal - saldoDoApp;
  return { saldoDoApp, saldoReal, diferenca, bate: diferenca === 0 };
}
