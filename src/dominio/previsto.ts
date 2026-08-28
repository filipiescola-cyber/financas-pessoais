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
import { diaNoMes, type DataISO } from './datas';

export type SituacaoPrevista = 'lancado' | 'atrasado' | 'aguardando';

export type RecorrenciaPrevista = {
  id: string;
  descricao: string;
  tipo: 'receita' | 'despesa';
  valorPrevisto: Centavos | null;
  dia: number;
};

export type ItemPrevisto = {
  recorrenciaId: string;
  descricao: string;
  tipo: 'receita' | 'despesa';
  valor: Centavos | null;
  dataPrevista: DataISO;
  situacao: SituacaoPrevista;
};

/** Chave natural do que já foi gerado: recorrência mais data de competência. */
export function chaveDaOcorrencia(recorrenciaId: string, data: DataISO): string {
  return `${recorrenciaId}|${data}`;
}

/**
 * O previsto do mês, item a item.
 *
 *   lançado    — já existe transação daquela recorrência naquela data
 *   atrasado   — a data já passou e não existe lançamento
 *   aguardando — ainda vai vencer
 *
 * Dia 31 num mês curto cai no último dia, mesma regra do cartão e da geração.
 */
export function previstoDoMes(
  recorrencias: readonly RecorrenciaPrevista[],
  jaLancadas: ReadonlySet<string>,
  mes: DataISO,
  hoje: DataISO,
): ItemPrevisto[] {
  return recorrencias
    .map((recorrencia) => {
      const dataPrevista = diaNoMes(mes, recorrencia.dia);
      const lancado = jaLancadas.has(chaveDaOcorrencia(recorrencia.id, dataPrevista));

      const situacao: SituacaoPrevista = lancado
        ? 'lancado'
        : dataPrevista <= hoje
          ? 'atrasado'
          : 'aguardando';

      return {
        recorrenciaId: recorrencia.id,
        descricao: recorrencia.descricao,
        tipo: recorrencia.tipo,
        valor: recorrencia.valorPrevisto,
        dataPrevista,
        situacao,
      };
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
