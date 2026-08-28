// Conciliação de extrato com lançamentos manuais (§6.4).
//
// Ponto crítico da Fase 4, e a razão de a spec proibir liberar a importação
// antes disto funcionar: o usuário já lançou coisas na mão, e o extrato traz as
// MESMAS transações. Sem tratamento, tudo duplica.
//
// Regra de casamento (§6.4): mesma conta, mesmo valor, data dentro de ±3 dias,
// e a transação manual ainda sem `fitid`.
//
//   Casou com uma       -> não cria nada. Preenche fitid e descricao_original
//                          na transação que já existe.
//   Não casou           -> entra como nova, revisado = false.
//   Casou com mais de uma -> vai para revisão manual. NUNCA escolher sozinho.
//
// Estas são funções puras: a decisão de casamento é testável sem banco.

import type { Centavos } from '../dominio/dinheiro';
import type { DataISO } from '../dominio/datas';
import type { TransacaoOFX } from './ofx';

/** Janela de tolerância entre a data do lançamento manual e a do extrato. */
export const TOLERANCIA_EM_DIAS = 3;

export type CandidataManual = {
  id: string;
  valor: Centavos;
  dataCaixa: DataISO;
  descricao: string | null;
  /** Transação que já veio de extrato não entra na conciliação (§6.4). */
  fitid: string | null;
};

export type Situacao = 'nova' | 'duplicada' | 'conciliada' | 'ambigua';

export type LinhaDoPreview = {
  transacao: TransacaoOFX;
  situacao: Situacao;
  /** Preenchido em `conciliada`; em `ambigua`, traz todas as candidatas. */
  candidatas: CandidataManual[];
  /** Escolha do usuário: false remove a linha da importação. */
  importar: boolean;
  categoriaSugeridaId: string | null;
};

function diferencaEmDias(a: DataISO, b: DataISO): number {
  const [anoA, mesA, diaA] = a.split('-').map(Number);
  const [anoB, mesB, diaB] = b.split('-').map(Number);
  const umDia = 86_400_000;
  const tempoA = Date.UTC(anoA!, mesA! - 1, diaA!);
  const tempoB = Date.UTC(anoB!, mesB! - 1, diaB!);
  return Math.abs(tempoA - tempoB) / umDia;
}

/** Candidatas a casamento com uma linha do extrato (§6.4). */
export function encontrarCandidatas(
  linha: TransacaoOFX,
  manuais: readonly CandidataManual[],
): CandidataManual[] {
  return manuais.filter(
    (manual) =>
      manual.fitid === null &&
      manual.valor === linha.valor &&
      diferencaEmDias(manual.dataCaixa, linha.data) <= TOLERANCIA_EM_DIAS,
  );
}

/**
 * Monta o preview do §6.5. Nenhuma linha é descartada em silêncio: duplicada e
 * ambígua aparecem marcadas, para o usuário ver o que o app decidiu.
 */
export function montarPreview(
  doArquivo: readonly TransacaoOFX[],
  jaImportados: ReadonlySet<string>,
  manuais: readonly CandidataManual[],
  sugerirCategoria: (descricao: string) => string | null = () => null,
): LinhaDoPreview[] {
  // Uma transação manual não pode casar com duas linhas do extrato.
  const jaUsadas = new Set<string>();

  return doArquivo.map((transacao) => {
    if (jaImportados.has(transacao.fitid)) {
      return {
        transacao,
        situacao: 'duplicada' as const,
        candidatas: [],
        importar: false,
        categoriaSugeridaId: null,
      };
    }

    const candidatas = encontrarCandidatas(transacao, manuais).filter(
      (candidata) => !jaUsadas.has(candidata.id),
    );

    if (candidatas.length === 1) {
      jaUsadas.add(candidatas[0]!.id);
      return {
        transacao,
        situacao: 'conciliada' as const,
        candidatas,
        importar: true,
        categoriaSugeridaId: null,
      };
    }

    if (candidatas.length > 1) {
      return {
        transacao,
        situacao: 'ambigua' as const,
        candidatas,
        importar: false,
        categoriaSugeridaId: null,
      };
    }

    return {
      transacao,
      situacao: 'nova' as const,
      candidatas: [],
      importar: true,
      // Sem match na memória, fica sem categoria. Nunca chutar (§6.5).
      categoriaSugeridaId: sugerirCategoria(transacao.descricao),
    };
  });
}

export function resumirPreview(linhas: readonly LinhaDoPreview[]) {
  return {
    novas: linhas.filter((l) => l.situacao === 'nova').length,
    conciliadas: linhas.filter((l) => l.situacao === 'conciliada').length,
    duplicadas: linhas.filter((l) => l.situacao === 'duplicada').length,
    ambiguas: linhas.filter((l) => l.situacao === 'ambigua').length,
    aImportar: linhas.filter((l) => l.importar).length,
  };
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  nova: 'Nova',
  conciliada: 'Já lançada na mão',
  duplicada: 'Já importada',
  ambigua: 'Precisa de revisão',
};

export const EXPLICACAO_SITUACAO: Record<Situacao, string> = {
  nova: 'Não existe nada parecido no app. Vai entrar como lançamento novo.',
  conciliada:
    'Casou com um lançamento que você já tinha feito. Nada novo é criado — o lançamento existente passa a carregar o identificador do banco.',
  duplicada: 'Este identificador já foi importado antes. A linha é ignorada.',
  ambigua:
    'Mais de um lançamento seu casa com esta linha. O app não escolhe sozinho — confira e decida.',
};
