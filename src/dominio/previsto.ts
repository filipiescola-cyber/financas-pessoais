// O que ainda falta acontecer no mês (§5.2, §8.6).
//
// A geração automática de recorrência é deliberadamente conservadora: ela não
// cria vencimento anterior à data em que a recorrência foi cadastrada, senão
// cadastrar uma conta antiga despejaria meses de lançamentos que o usuário não
// pediu.
//
// O efeito colateral é o caso comum de quem está começando: você cadastra o
// salário no dia 28, ele vencia no dia 27, e ele nunca aparece — nem sozinho,
// nem como pendência. Este módulo existe para o mês inteiro ficar visível, com
// o que já entrou e o que falta, e o lançamento ser uma decisão sua.

import type { Centavos } from './dinheiro';
import { somarMeses, ultimoDiaDoMes, type DataISO } from './datas';
import { faturaDeReferencia, type ConfiguracaoDoCartao } from './fatura';
import type { Feriados } from './diasUteis';
import {
  chaveDaOcorrencia,
  dataDaOcorrencia,
  valorDaOcorrencia,
  type RegraDoDia,
} from './recorrencias';

export { chaveDaOcorrencia } from './recorrencias';

export type SituacaoPrevista = 'lancado' | 'atrasado' | 'aguardando';

export type RecorrenciaPrevista = {
  id: string;
  descricao: string;
  /** Onde ela é cobrada. Num cartão, decide em qual fatura a linha entra. */
  contaId?: string;
  tipo: 'receita' | 'despesa';
  valorPrevisto: Centavos | null;
  dia: number;
  regra: RegraDoDia;
  /** Primeiro dia em que ela vale. Antes disso não existe previsão nenhuma. */
  comecaEm: DataISO;
  /** Prazo, quando a recorrência tem fim. Depois dele ela some do previsto. */
  terminaEm: DataISO | null;
  /**
   * Quanto o valor muda a cada mês (§5.2). Zero é a recorrência comum.
   *
   * Existe para a obra que sobe todo mês e para a dívida negociada que desce —
   * contas que antes só cabiam como "valor varia", e que por isso ficavam fora
   * da projeção do §8 justamente por serem as que mais mexem com ela.
   */
  incremento?: Centavos;
  /**
   * A configuração do cartão, quando a recorrência é cobrada num (§2.1).
   *
   * Sem ela o previsto de cartão saía do caixa no dia da COMPRA. Assinatura no
   * cartão dia 10 baixava o saldo no dia 10, quando o dinheiro só sai no
   * vencimento da fatura — e ainda aparecia solta na lista, ao lado da fatura
   * em que deveria estar dentro.
   */
  cartao?: ConfiguracaoDoCartao | null;
};

export type ItemPrevisto = {
  recorrenciaId: string;
  contaId: string | null;
  descricao: string;
  tipo: 'receita' | 'despesa';
  valor: Centavos | null;
  /** Quando o fato acontece: a data da compra ou do vencimento da conta. */
  dataPrevista: DataISO;
  /**
   * Quando o dinheiro sai (§2.4). Igual à prevista fora do cartão; no cartão é
   * o vencimento da fatura em que a compra cai.
   */
  dataCaixa: DataISO;
  /** Em qual fatura ela entra, quando é de cartão. Só para a tela dizer. */
  vencimentoDaFatura: DataISO | null;
  situacao: SituacaoPrevista;
};

/**
 * O previsto do mês, item a item.
 *
 *   lançado    — já existe transação daquela recorrência naquela data
 *   atrasado   — a data já passou e não existe lançamento
 *   aguardando — ainda vai vencer
 *
 * Dia 31 num mês curto cai no último dia, mesma regra do cartão e da geração.
 *
 * Fora da janela [começa, termina] a recorrência não aparece. Antes do início
 * ela ainda não vale — uma assinatura que começa em novembro não está atrasada
 * em setembro. Depois do prazo ela não é mais "aguardando", é passado, e o mês
 * seguinte a um financiamento quitado não deve mostrar a parcela como pendência
 * eterna.
 *
 * `puladas` são as ocorrências que o usuário apagou de propósito: elas somem da
 * lista em vez de voltarem como atraso. O mês em que o freela não veio é um
 * fato, e a recorrência continua valendo para os outros meses.
 */
export function previstoDoMes(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  mes: DataISO,
  hoje: DataISO,
  feriados: Feriados,
  puladas: ReadonlySet<string> = new Set(),
): ItemPrevisto[] {
  return recorrencias
    .flatMap((recorrencia) => {
      const dataPrevista = dataDaOcorrencia(mes, recorrencia.dia, recorrencia.regra, feriados);
      if (dataPrevista < recorrencia.comecaEm) return [];
      if (recorrencia.terminaEm !== null && dataPrevista > recorrencia.terminaEm) return [];
      if (puladas.has(chaveDaOcorrencia(recorrencia.id, dataPrevista))) return [];

      const lancado = jaLancadas.has(chaveDaOcorrencia(recorrencia.id, dataPrevista));

      const situacao: SituacaoPrevista = lancado
        ? 'lancado'
        : dataPrevista <= hoje
          ? 'atrasado'
          : 'aguardando';

      const noCartao = recorrencia.cartao
        ? faturaDeReferencia(dataPrevista, recorrencia.cartao).dataVencimento
        : null;

      return [
        {
          recorrenciaId: recorrencia.id,
          contaId: recorrencia.contaId ?? null,
          descricao: recorrencia.descricao,
          tipo: recorrencia.tipo,
          valor: valorDaOcorrencia(
            recorrencia.valorPrevisto,
            recorrencia.incremento ?? 0,
            recorrencia.comecaEm,
            dataPrevista,
          ),
          dataPrevista,
          dataCaixa: noCartao ?? dataPrevista,
          vencimentoDaFatura: noCartao,
          situacao,
        },
      ];
    })
    .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
}

export type ResumoDoPrevisto = {
  entrouPrevisto: Centavos;
  faltaEntrar: Centavos;
  saiuPrevisto: Centavos;
  faltaSair: Centavos;
  atrasados: number;
};

/**
 * Resumo para o topo da tela.
 *
 * Recorrência sem valor previsto — as de valor que oscila — não entra em soma
 * nenhuma: somar zero por ela faria o "falta entrar" parecer menor do que é.
 * Ela aparece na lista, para ser lançada com o número certo.
 */
export function resumirPrevisto(itens: readonly ItemPrevisto[]): ResumoDoPrevisto {
  const resumo: ResumoDoPrevisto = {
    entrouPrevisto: 0,
    faltaEntrar: 0,
    saiuPrevisto: 0,
    faltaSair: 0,
    atrasados: 0,
  };

  for (const item of itens) {
    if (item.situacao === 'atrasado') resumo.atrasados += 1;
    if (item.valor === null) continue;

    const jaAconteceu = item.situacao === 'lancado';
    if (item.tipo === 'receita') {
      if (jaAconteceu) resumo.entrouPrevisto += item.valor;
      else resumo.faltaEntrar += item.valor;
    } else if (jaAconteceu) {
      resumo.saiuPrevisto += item.valor;
    } else {
      resumo.faltaSair += item.valor;
    }
  }

  return resumo;
}

/**
 * Soma, com sinal, do previsto ainda não lançado nos meses `[deMes, ateMes)`.
 *
 * Existe por causa de um buraco no saldo de abertura de meses distantes. A
 * geração de recorrência só cria lançamento até hoje, então nenhum mês futuro
 * tem salário ou aluguel gravado no banco. O acumulado do banco até o dia 30/09
 * é, portanto, igual ao de hoje — e outubro abria com o mesmo saldo de
 * setembro, como se setembro inteiro não tivesse acontecido.
 *
 * O mês seguinte parecia certo só porque o buraco tem o tamanho de zero mês.
 *
 * Recorrência sem valor previsto fica de fora, pela mesma razão do resumo:
 * somar zero por ela empurraria o saldo para um número que ninguém prometeu.
 */
export function previstoAteOMes(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  deMes: DataISO,
  ateMes: DataISO,
  hoje: DataISO,
  feriados: Feriados,
  puladas: ReadonlySet<string> = new Set(),
): Centavos {
  return previstoNoCaixaEntre(recorrencias, jaLancadas, deMes, ateMes, hoje, feriados, puladas)
    .filter((item) => item.valor !== null)
    .reduce((total, item) => total + (item.tipo === 'receita' ? item.valor! : -item.valor!), 0);
}

/**
 * Os itens da ponte, um a um.
 *
 * A soma acima existe para quem só quer o número; a tela precisa dos itens,
 * porque o saldo dela é montado movimento a movimento (ver `extratoDoMes`).
 * As duas saem daqui de propósito: quando a ponte e o mês exibido tinham cada
 * um a sua regra, o saldo desencontrava na virada.
 */
export function previstoNoCaixaEntre(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  deMes: DataISO,
  ateMes: DataISO,
  hoje: DataISO,
  feriados: Feriados,
  puladas: ReadonlySet<string> = new Set(),
): ItemPrevisto[] {
  const itens: ItemPrevisto[] = [];

  for (let mes = deMes; mes < ateMes; mes = somarMeses(mes, 1)) {
    for (const item of previstoDoMes(recorrencias, jaLancadas, mes, hoje, feriados, puladas)) {
      if (item.situacao === 'lancado') continue;
      // Compra de cartão cuja fatura só vence depois da ponte ainda não saiu
      // daqui: ela pertence ao mês em que o dinheiro sai, e é lá que a lista a
      // conta. Sem esta linha ela entrava duas vezes no saldo.
      if (item.dataCaixa >= ateMes) continue;
      itens.push(item);
    }
  }

  return itens;
}

/**
 * O previsto que sai do CAIXA no mês (§2.4).
 *
 * A lista de lançamentos corre por caixa, e `previstoDoMes` filtra por
 * competência — as duas coincidem fora do cartão e divergem por semanas dentro
 * dele. Uma assinatura cobrada no cartão dia 10 de setembro só tira dinheiro no
 * vencimento de outubro, e é em outubro que ela pertence a esta lista.
 *
 * Olha dois meses para trás porque é o máximo que uma compra pode esperar entre
 * o dia dela e o vencimento da fatura em que caiu.
 */
export function previstoNoCaixaDoMes(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  mes: DataISO,
  hoje: DataISO,
  feriados: Feriados,
  puladas: ReadonlySet<string> = new Set(),
): ItemPrevisto[] {
  const fim = ultimoDiaDoMes(mes);

  return [somarMeses(mes, -2), somarMeses(mes, -1), mes]
    .flatMap((competencia) =>
      previstoDoMes(recorrencias, jaLancadas, competencia, hoje, feriados, puladas),
    )
    .filter((item) => item.dataCaixa >= mes && item.dataCaixa <= fim)
    .sort((a, b) => a.dataCaixa.localeCompare(b.dataCaixa));
}

/**
 * As cobranças que ainda vão entrar NUMA fatura específica (§2.1).
 *
 * A aba de faturas mostrava a fatura sem elas: a assinatura aparecia dentro do
 * bloco em Lançamentos e sumia aqui, na tela que existe justamente para
 * conferir a fatura. Duas telas contando a mesma fatura de dois jeitos.
 *
 * A janela de competência é de três meses porque a fatura de um mês recebe
 * compras do mês anterior — tudo que cai depois do fechamento anterior e até o
 * fechamento dela. Quem decide é `faturaDeReferencia`, a mesma função que a
 * geração usa: aqui só se pergunta quais ocorrências caem nesta.
 */
export function previstoDaFatura(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  mesDaFatura: DataISO,
  vencimento: DataISO,
  hoje: DataISO,
  feriados: Feriados,
  puladas: ReadonlySet<string> = new Set(),
): ItemPrevisto[] {
  return [somarMeses(mesDaFatura, -1), mesDaFatura, somarMeses(mesDaFatura, 1)]
    .flatMap((competencia) =>
      previstoDoMes(recorrencias, jaLancadas, competencia, hoje, feriados, puladas),
    )
    .filter((item) => item.situacao !== 'lancado' && item.vencimentoDaFatura === vencimento)
    .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
}
