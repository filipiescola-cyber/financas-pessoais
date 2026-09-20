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
import {
  diasNoMes,
  primeiroDiaDoMes,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from './datas';
import { valorDaOcorrencia } from './recorrencias';

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
  /**
   * Quanto do teto ainda está livre, de 1 a 0.
   *
   * O mesmo que `restante`, em porcentagem. Existe porque teto definido como
   * porcentagem da renda se acompanha em porcentagem: quem decidiu "10% da
   * renda em Lazer" quer saber que já foi por 7 dos 10, não que sobraram
   * R$ 148,03. Estourado é zero, não negativo — "falta -20%" não quer dizer
   * nada, e quem estourou já é avisado pelo `situacao`.
   */
  proporcaoRestante: number;
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
    proporcaoRestante: Math.max(0, 1 - proporcaoGasta),
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

export type OrcamentoComACompra = {
  antes: ProgressoDoOrcamento;
  depois: ProgressoDoOrcamento;
  /** Estava dentro e passa a estourar. É a única virada que interessa avisar. */
  passaAEstourar: boolean;
  /** Quanto ainda cabia no teto antes da compra. Negativo se já estourava. */
  cabiaAinda: Centavos;
};

/**
 * O teto da categoria, com e sem a compra (§8.4).
 *
 * O §8.4 pede isso na lista do simulador e faltava: saber que o saldo aguenta
 * não é a mesma coisa que saber que a compra cabe no que você tinha decidido
 * gastar naquela categoria. As duas perguntas são independentes — dá para ter
 * dinheiro e mesmo assim furar o teto, e é aí que a informação vale.
 *
 * Sem teto definido não há o que dizer, e dizer "0% de R$ 0" seria pior que
 * calar (§13.5). Quem chama decide mostrar pelo `planejado`.
 */
export function orcamentoComACompra(
  planejado: Centavos,
  realizado: Centavos,
  valorDaCompra: Centavos,
  data: DataISO,
): OrcamentoComACompra {
  const antes = progressoDoOrcamento(planejado, realizado, data);
  const depois = progressoDoOrcamento(planejado, realizado + Math.abs(valorDaCompra), data);

  return {
    antes,
    depois,
    passaAEstourar: antes.situacao !== 'estourado' && depois.situacao === 'estourado',
    cabiaAinda: antes.restante,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento como porcentagem da renda fixa (§8.6)
//
// Teto em reais envelhece: a renda muda e os trinta tetos continuam nos valores
// do ano passado, cada um errado por uma fração diferente. Em porcentagem, o
// teto é uma DECISÃO — "Lazer vale 10% do que entra" — e o valor em reais é
// consequência, recalculada a cada mês como qualquer outro número do app
// (§13.2).

export type RecorrenciaDeRenda = {
  tipo: 'receita' | 'despesa';
  frequencia: 'mensal' | 'anual';
  valorPrevisto: Centavos | null;
  incremento: Centavos;
  comecaEm: DataISO;
  terminaEm: DataISO | null;
  ativo: boolean;
};

/**
 * A renda fixa daquele mês: o que entra todo mês e já está cadastrado (§4.5).
 *
 * Só recorrência de RECEITA e só MENSAL. Anual fica de fora de propósito: o 13º
 * é renda do ano, não do mês, e dividi-lo por doze daria um teto que só existe
 * no papel — a pessoa gastaria em março um dinheiro que chega em dezembro.
 *
 * Respeita começo e fim: renda que ainda não começou ou que já acabou não
 * sustenta teto nenhum. E respeita o incremento (§5.2), porque a recorrência
 * gradativa vale valores diferentes em meses diferentes.
 *
 * Renda variável não entra, e é o ponto todo: teto de gasto se ancora no que é
 * certo. Quem vive de renda variável orça pelo mês ruim, não pela média.
 */
export function rendaFixaDoMes(
  recorrencias: readonly RecorrenciaDeRenda[],
  mes: DataISO,
): Centavos {
  const comeco = primeiroDiaDoMes(mes);
  const fim = ultimoDiaDoMes(mes);

  return recorrencias.reduce((total, r) => {
    if (!r.ativo || r.tipo !== 'receita' || r.frequencia !== 'mensal') return total;
    if (r.comecaEm > fim) return total;
    if (r.terminaEm !== null && r.terminaEm < comeco) return total;

    const valor = valorDaOcorrencia(r.valorPrevisto, r.incremento, r.comecaEm, comeco);
    return total + Math.abs(valor ?? 0);
  }, 0);
}

export type TetoGuardado = {
  valorPlanejado: Centavos;
  /** Quando existe, é ELE que manda: o valor em reais vira consequência. */
  percentualDaRenda: number | null;
};

/**
 * O teto em reais, venha ele de um valor fixo ou de uma porcentagem (§8.6).
 *
 * Uma linha do orçamento guarda um dos dois, nunca os dois — o banco recusa o
 * meio-termo. É a regra que impede o defeito de sempre: a porcentagem mudar e
 * o valor em reais continuar o de antes, os dois na mesma linha, um deles
 * mentindo.
 *
 * Sem renda fixa cadastrada, porcentagem não vira nada: zero é honesto, porque
 * 10% de uma renda que o app não conhece é um número inventado (§13.5).
 */
export function tetoDoOrcamento(guardado: TetoGuardado, rendaFixa: Centavos): Centavos {
  if (guardado.percentualDaRenda === null) return guardado.valorPlanejado;
  return Math.round((rendaFixa * guardado.percentualDaRenda) / 100);
}

export type PanoramaDaRenda = {
  rendaFixa: Centavos;
  planejado: Centavos;
  realizado: Centavos;
  /** Quanto da renda está reservado em tetos. Pode passar de 1. */
  proporcaoPlanejada: number;
  /** Quanto da renda já foi gasto. Pode passar de 1. */
  proporcaoRealizada: number;
  /** O que sobra da renda depois do que já saiu. Nunca negativo. */
  proporcaoLivre: number;
  /** Sem renda fixa cadastrada não há porcentagem que signifique algo. */
  semRenda: boolean;
};

/**
 * A mesma leitura do teto, um nível acima: a renda inteira (§8.6).
 *
 * "Quanto por cento falta" precisa de um denominador, e o do mês é a renda —
 * não a soma dos tetos. Somar tetos responde "sobrou do que eu tinha
 * planejado"; a renda responde "sobrou do que eu tenho", que é a pergunta de
 * quem está decidindo se pode gastar.
 */
export function panoramaDaRenda(
  rendaFixa: Centavos,
  planejado: Centavos,
  realizado: Centavos,
): PanoramaDaRenda {
  const semRenda = rendaFixa <= 0;

  return {
    rendaFixa,
    planejado,
    realizado,
    proporcaoPlanejada: semRenda ? 0 : planejado / rendaFixa,
    proporcaoRealizada: semRenda ? 0 : realizado / rendaFixa,
    proporcaoLivre: semRenda ? 0 : Math.max(0, 1 - realizado / rendaFixa),
    semRenda,
  };
}

/**
 * Para que serve o gasto (§8.6).
 *
 * Não confundir com natureza (§2.5), que responde outra pergunta: natureza é
 * "dá para prever?", faixa é "para que serve?". Elas cruzam — o aluguel é fixo
 * e essencial, a assinatura de streaming é fixa e estilo de vida — e por isso
 * são dois campos, não um.
 */
export type FaixaDoOrcamento = 'essenciais' | 'estilo_de_vida' | 'futuro';

export const ROTULOS_DAS_FAIXAS: Record<FaixaDoOrcamento, string> = {
  essenciais: 'Essenciais',
  estilo_de_vida: 'Estilo de vida',
  futuro: 'Futuro',
};

export type FaixaDoCenario = {
  chave: FaixaDoOrcamento;
  nome: string;
  percentual: number;
  exemplos: string;
};

export type CenarioDeOrcamento = {
  nome: string;
  quandoServe: string;
  faixas: readonly FaixaDoCenario[];
};

/**
 * Três divisões conhecidas da renda, como referência (§8.6).
 *
 * Não são recomendação personalizada: são pontos de partida publicados, que
 * servem para dar ordem de grandeza a quem nunca dividiu a renda antes. Três
 * porque um só vira regra, e regra que não cabe na vida de quem lê é
 * abandonada no primeiro mês.
 *
 * As somas fecham em 100% de propósito — orçamento que não fecha é lista de
 * desejos.
 */
export const CENARIOS_DE_ORCAMENTO: readonly CenarioDeOrcamento[] = [
  {
    nome: 'Equilibrado',
    quandoServe: 'As contas fixas cabem em metade do que entra e não há dívida cara correndo.',
    faixas: [
      {
        chave: 'essenciais',
        nome: 'Essenciais',
        percentual: 50,
        exemplos: 'Moradia, Contas, Mercado, Transporte, Saúde',
      },
      {
        chave: 'estilo_de_vida',
        nome: 'Estilo de vida',
        percentual: 30,
        exemplos: 'Lazer, Assinaturas, Vestuário, Presentes',
      },
      {
        chave: 'futuro',
        nome: 'Futuro',
        percentual: 20,
        exemplos: 'Reserva, investimento e amortização',
      },
    ],
  },
  {
    nome: 'Quitando dívida',
    quandoServe:
      'Enquanto existe dívida cara, cada real amortizado economiza o juro que deixa de correr — e o juro do cartão é maior que o de qualquer aplicação.',
    faixas: [
      {
        chave: 'essenciais',
        nome: 'Essenciais',
        percentual: 55,
        exemplos: 'O mesmo de sempre, sem folga',
      },
      {
        chave: 'estilo_de_vida',
        nome: 'Estilo de vida',
        percentual: 15,
        exemplos: 'O que dá para segurar por alguns meses',
      },
      {
        chave: 'futuro',
        nome: 'Futuro',
        percentual: 30,
        exemplos: 'Quase tudo em dívida, até ela acabar',
      },
    ],
  },
  {
    nome: 'Renda apertada',
    quandoServe:
      'O essencial já come 70% do que entra. Prometer 20% de sobra aqui é promessa que não se cumpre — e orçamento que não se cumpre é abandonado.',
    faixas: [
      {
        chave: 'essenciais',
        nome: 'Essenciais',
        percentual: 70,
        exemplos: 'Moradia, Contas, Mercado, Transporte',
      },
      {
        chave: 'estilo_de_vida',
        nome: 'Estilo de vida',
        percentual: 20,
        exemplos: 'O pouco que cabe, sem culpa',
      },
      {
        chave: 'futuro',
        nome: 'Futuro',
        percentual: 10,
        exemplos: 'Reserva primeiro, mesmo devagar',
      },
    ],
  },
];

export type FaixaComValor = FaixaDoCenario & { valor: Centavos };

/** O cenário em reais, sobre a renda fixa de quem está olhando. */
export function valoresDoCenario(
  cenario: CenarioDeOrcamento,
  rendaFixa: Centavos,
): FaixaComValor[] {
  return cenario.faixas.map((faixa) => ({
    ...faixa,
    valor: Math.round((rendaFixa * faixa.percentual) / 100),
  }));
}

export type DivisaoDaRenda = {
  essenciais: Centavos;
  estiloDeVida: Centavos;
  /**
   * O que sobra da renda — é daqui que saem aporte e amortização.
   *
   * Sobra, e não soma de categorias, porque no app aporte e amortização são
   * TRANSFERÊNCIA (§2.3, §14): o dinheiro mudou de lugar, não virou gasto.
   * Medir esta faixa somando despesas daria quase zero e diria que ninguém
   * guarda nada — quando o que a pessoa guarda é justamente o que ela não
   * gastou. Negativo é a informação mais importante que este número dá: saiu
   * mais do que entrou.
   */
  futuro: Centavos;
  /**
   * Gasto que não entrou em faixa nenhuma. Sai do futuro, e fica à vista.
   *
   * Duas origens: categoria sem faixa e lançamento sem categoria — este último
   * descoberto pelo compilador, e ele sozinho já bastaria para o número mentir
   * para mais. Dinheiro que saiu e ninguém classificou não é dinheiro guardado.
   */
  semFaixa: Centavos;
  /** O que já foi gasto em categorias de futuro — juros, taxas de aplicação. */
  gastoEmFuturo: Centavos;
};

/**
 * Onde a renda do mês está caindo, nas três faixas dos cenários (§8.6).
 *
 * Essenciais e estilo de vida se medem pelo gasto das categorias classificadas.
 * Futuro se mede pelo resto — ver o comentário do campo. As três somam a renda
 * por construção, que é o que permite comparar com um cenário que também soma
 * 100%.
 */
export function divisaoDaRenda(
  categorias: readonly { id: string; faixa: FaixaDoOrcamento | null }[],
  gastoPorCategoria: ReadonlyMap<string | null, Centavos>,
  rendaFixa: Centavos,
): DivisaoDaRenda {
  let essenciais = 0;
  let estiloDeVida = 0;
  let semFaixa = 0;
  let gastoEmFuturo = 0;

  for (const categoria of categorias) {
    const gasto = gastoPorCategoria.get(categoria.id) ?? 0;
    if (gasto === 0) continue;

    if (categoria.faixa === 'essenciais') essenciais += gasto;
    else if (categoria.faixa === 'estilo_de_vida') estiloDeVida += gasto;
    else if (categoria.faixa === 'futuro') gastoEmFuturo += gasto;
    else semFaixa += gasto;
  }

  // O gasto sem categoria alguma (§5.4). Ele não aparece na volta acima, que
  // percorre categorias — e some da conta se ninguém for buscá-lo aqui.
  semFaixa += gastoPorCategoria.get(null) ?? 0;

  return {
    essenciais,
    estiloDeVida,
    futuro: rendaFixa - essenciais - estiloDeVida - semFaixa,
    semFaixa,
    gastoEmFuturo,
  };
}

export type ComparacaoDaFaixa = {
  chave: FaixaDoOrcamento;
  nome: string;
  exemplos: string;
  percentualAlvo: number;
  valorAlvo: Centavos;
  valorHoje: Centavos;
  /** Onde você está, em porcentagem da renda. Pode passar de 100 e pode ser negativo. */
  percentualHoje: number;
  /** Positivo: você está gastando mais que o cenário sugere nesta faixa. */
  diferenca: Centavos;
};

/**
 * O cenário ao lado de onde a pessoa está (§8.6).
 *
 * Um cenário sozinho é um cartaz. O que torna ele útil é a coluna "hoje" —
 * saber que o essencial come 64% quando o cenário fala em 50% é o que faz
 * alguém mudar alguma coisa.
 */
export function comparacaoComOCenario(
  cenario: CenarioDeOrcamento,
  divisao: DivisaoDaRenda,
  rendaFixa: Centavos,
): ComparacaoDaFaixa[] {
  const hoje: Record<FaixaDoOrcamento, Centavos> = {
    essenciais: divisao.essenciais,
    estilo_de_vida: divisao.estiloDeVida,
    futuro: divisao.futuro,
  };

  return cenario.faixas.map((faixa) => {
    const valorAlvo = Math.round((rendaFixa * faixa.percentual) / 100);
    const valorHoje = hoje[faixa.chave];

    return {
      chave: faixa.chave,
      nome: faixa.nome,
      exemplos: faixa.exemplos,
      percentualAlvo: faixa.percentual,
      valorAlvo,
      valorHoje,
      percentualHoje: rendaFixa > 0 ? (valorHoje / rendaFixa) * 100 : 0,
      diferenca: valorHoje - valorAlvo,
    };
  });
}

export type TetoSugerido = {
  categoriaId: string;
  /** Porcentagem da renda, com uma casa. */
  percentual: number;
};

/**
 * O cenário virado em teto por categoria (§8.6).
 *
 * A faixa diz quanto vai para Essenciais; ela não diz quanto vai para Mercado.
 * A repartição sai do histórico: cada categoria fica com a MESMA fatia que já
 * tem dentro da faixa dela, só que a faixa inteira passa a caber no que o
 * cenário manda. Quem gasta 60% dos essenciais em Moradia continua com 60%
 * deles — o que muda é o tamanho do bolo.
 *
 * Dividir igualmente seria pior do que não sugerir nada: daria o mesmo teto
 * para Moradia e para Pets, e ninguém cumpre um orçamento desses.
 *
 * Futuro fica de fora de propósito: ele é o que SOBRA (ver `DivisaoDaRenda`), e
 * um teto de gasto nele seria uma promessa medida pelo lado errado.
 *
 * Categoria sem histórico na faixa não recebe teto: sugerir para quem nunca
 * gastou é inventar (§13.5).
 */
export function tetosDoCenario(
  cenario: CenarioDeOrcamento,
  categorias: readonly { id: string; faixa: FaixaDoOrcamento | null }[],
  gastoPorCategoria: ReadonlyMap<string | null, Centavos>,
): TetoSugerido[] {
  const sugestoes: TetoSugerido[] = [];

  for (const faixa of cenario.faixas) {
    if (faixa.chave === 'futuro') continue;

    const daFaixa = categorias.filter((c) => c.faixa === faixa.chave);
    const total = daFaixa.reduce((soma, c) => soma + (gastoPorCategoria.get(c.id) ?? 0), 0);
    if (total <= 0) continue;

    for (const categoria of daFaixa) {
      const gasto = gastoPorCategoria.get(categoria.id) ?? 0;
      if (gasto <= 0) continue;

      // Uma casa decimal: 8,2% da renda é um teto; 8,1743% é um número que
      // ninguém confere. O banco guarda três, e a soma fecha na faixa.
      const percentual = Math.round(((gasto / total) * faixa.percentual) * 10) / 10;
      if (percentual <= 0) continue;

      sugestoes.push({ categoriaId: categoria.id, percentual });
    }
  }

  return sugestoes;
}
