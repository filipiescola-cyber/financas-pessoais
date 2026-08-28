// Alertas (§8.6).
//
// "Poucos e acionáveis. Alerta que dispara demais é silenciado, e junto com ele
// some o alerta que importava."
//
// A lista do que NÃO alertar é tão importante quanto a do que alertar, e está
// codificada por ausência: não existe função aqui para gasto individual, para
// comparação com outras pessoas, para sequência ou medalha. Nenhuma delas é
// informação — são julgamento.
//
// Sobre frequência: estes alertas não são notificação. Eles são calculados na
// abertura e mostrados numa tela que o usuário escolheu abrir. É o que o §13.3
// permite num app sem servidor — e evita o "nada diário" do §8.6 pela raiz,
// porque nada aqui persegue ninguém.

import type { Centavos } from './dinheiro';
import { diasCorridosEntre } from './diasUteis';
import type { DataISO } from './datas';

export type Gravidade = 'informativo' | 'atencao' | 'urgente';

export type Alerta = {
  id: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  /** Para onde ir para resolver. Alerta sem ação é ruído. */
  destino?: string;
};

export type EntradaDosAlertas = {
  hoje: DataISO;
  /** Primeiro mês da projeção que fica negativo, se houver (§8.2). */
  mesNegativo: { mes: DataISO; saldo: Centavos } | null;
  /** Categorias que passaram do ritmo esperado (§8.6). */
  orcamentosEstourando: { nome: string; proporcao: number }[];
  /** Faturas que fecham nos próximos dias. */
  faturasFechando: { nome: string; dataFechamento: DataISO; valor: Centavos; media: Centavos }[];
  /** Recorrências que já deveriam ter acontecido e não apareceram. */
  recorrenciasFaltando: { descricao: string; diaEsperado: number }[];
  /** Saldo da conta Empresa nos últimos meses, do mais antigo ao mais recente (§2.6). */
  historicoDaEmpresa: Centavos[];
  /** Contas sem conferência há mais de um mês (§5.3). */
  contasSemConferencia: { nome: string; ultimaConferencia: DataISO | null }[];
};

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function nomeDoMes(data: DataISO): string {
  return MESES[Number(data.split('-')[1]) - 1] ?? data;
}

/** Fatura fechando em 3 dias só vira alerta se estiver acima da média (§8.6). */
const DIAS_PARA_FECHAMENTO = 3;
const ACIMA_DA_MEDIA = 1.2;

/**
 * Conta "Empresa" subindo há três meses seguidos (§2.6).
 *
 * "O valor do número não é o nível, é a inclinação." Três meses de alta seguida
 * é o sinal de que o negócio está sendo bancado pelo bolso pessoal em regime
 * permanente, e não numa fase de investimento.
 */
export function empresaSubindoHaTresMeses(historico: readonly Centavos[]): boolean {
  if (historico.length < 4) return false;
  const ultimos = historico.slice(-4);
  return (
    ultimos[1]! > ultimos[0]! && ultimos[2]! > ultimos[1]! && ultimos[3]! > ultimos[2]!
  );
}

export function gerarAlertas(entrada: EntradaDosAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const dia = Number(entrada.hoje.split('-')[2]);

  // Mês negativo, com a maior antecedência possível. É o alerta mais valioso:
  // quanto antes aparece, mais barato é resolver.
  if (entrada.mesNegativo) {
    alertas.push({
      id: 'mes-negativo',
      gravidade: 'urgente',
      titulo: `Saldo fica negativo em ${nomeDoMes(entrada.mesNegativo.mes)}`,
      detalhe:
        'A projeção mostra o saldo abaixo de zero nesse mês. Quanto antes aparecer, mais barato é resolver.',
      destino: '/fluxo',
    });
  }

  for (const orcamento of entrada.orcamentosEstourando) {
    alertas.push({
      id: `orcamento-${orcamento.nome}`,
      gravidade: orcamento.proporcao > 1 ? 'atencao' : 'informativo',
      titulo:
        orcamento.proporcao > 1
          ? `${orcamento.nome} passou do teto`
          : `${orcamento.nome} em ${Math.round(orcamento.proporcao * 100)}% do teto`,
      detalhe:
        orcamento.proporcao > 1
          ? 'O teto do mês já foi ultrapassado.'
          : `Ainda faltam dias no mês. Dá para reagir.`,
      destino: '/orcamento',
    });
  }

  for (const fatura of entrada.faturasFechando) {
    const dias = diasCorridosEntre(entrada.hoje, fatura.dataFechamento);
    // Só alerta se fecha logo E está acima da média: fatura fechando é rotina,
    // fatura fechando cara é informação.
    if (dias > DIAS_PARA_FECHAMENTO) continue;
    if (fatura.media <= 0 || fatura.valor < fatura.media * ACIMA_DA_MEDIA) continue;

    alertas.push({
      id: `fatura-${fatura.nome}`,
      gravidade: 'atencao',
      titulo: `Fatura do ${fatura.nome} fecha em ${dias} dia(s), acima da média`,
      detalhe: 'Vale conferir se há alguma compra que não deveria estar aí.',
      destino: '/faturas',
    });
  }

  for (const recorrencia of entrada.recorrenciasFaltando) {
    alertas.push({
      id: `recorrencia-${recorrencia.descricao}`,
      gravidade: 'atencao',
      titulo: `${recorrencia.descricao} não apareceu este mês`,
      detalhe:
        'Era esperada no dia ' +
        recorrencia.diaEsperado +
        '. Pode ser conta esquecida — ou cobrança que sumiu, o que também interessa saber.',
      destino: '/transacoes',
    });
  }

  if (empresaSubindoHaTresMeses(entrada.historicoDaEmpresa)) {
    alertas.push({
      id: 'empresa-subindo',
      gravidade: 'atencao',
      titulo: 'A conta Empresa sobe há três meses seguidos',
      detalhe:
        'O que importa não é o nível, é a inclinação. Subida constante depois da fase inicial costuma significar que o negócio está sendo bancado pelo bolso pessoal.',
      destino: '/contas',
    });
  }

  // Lembrete de conferência no começo do mês (§5.3). Uma vez por mês, não mais.
  if (dia <= 5) {
    const atrasadas = entrada.contasSemConferencia.filter((conta) => {
      if (conta.ultimaConferencia === null) return true;
      return diasCorridosEntre(conta.ultimaConferencia, entrada.hoje) > 45;
    });

    if (atrasadas.length > 0) {
      alertas.push({
        id: 'conferencia',
        gravidade: 'informativo',
        titulo: 'Hora de conferir os saldos',
        detalhe: `${atrasadas.length} conta(s) sem conferência há mais de um mês. Sem integração bancária o saldo derrapa, e a conferência é o que impede a diferença de virar bola de neve.`,
        destino: '/conferencia',
      });
    }
  }

  return alertas;
}

export const ORDEM_DA_GRAVIDADE: Record<Gravidade, number> = {
  urgente: 0,
  atencao: 1,
  informativo: 2,
};

export function ordenarPorGravidade(alertas: readonly Alerta[]): Alerta[] {
  return [...alertas].sort(
    (a, b) => ORDEM_DA_GRAVIDADE[a.gravidade] - ORDEM_DA_GRAVIDADE[b.gravidade],
  );
}
