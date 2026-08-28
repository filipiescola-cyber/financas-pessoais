// Metas: quanto guardar por mês, e de onde vem o número (§8.8).
//
// Duas ideias que mudam o que a tela significa:
//
//   O ALVO SÓ SERVE COM PRAZO. "Juntar R$ 20.000" não é meta, é desejo — não dá
//   para saber se está indo bem. Com prazo, vira uma conta de dividir que
//   responde a pergunta única que importa: quanto por mês.
//
//   DINHEIRO GUARDADO PRECISA ESTAR EM ALGUM LUGAR. Uma meta com R$ 1.200
//   "guardados" que não correspondem a saldo nenhum é um número que o usuário
//   digitou e acredita. Por isso a meta pode apontar para uma conta, e aí o
//   valor deixa de ser declarado e passa a ser observado.

import type { Centavos } from './dinheiro';
import { primeiroDiaDoMes, type DataISO } from './datas';

export type ProjecaoDaMeta = {
  falta: Centavos;
  concluida: boolean;
  /** Meses cheios entre hoje e o prazo. null quando não há prazo. */
  mesesRestantes: number | null;
  /** Quanto guardar por mês para chegar no prazo. null sem prazo. */
  mensalNecessario: Centavos | null;
  /** Prazo já passou e ainda falta dinheiro. */
  prazoVencido: boolean;
};

/** Meses cheios de um mês ao outro, contando o mês do prazo. */
function mesesEntre(de: DataISO, ate: DataISO): number {
  const [anoA, mesA] = primeiroDiaDoMes(de).split('-').map(Number);
  const [anoB, mesB] = primeiroDiaDoMes(ate).split('-').map(Number);
  return (anoB! - anoA!) * 12 + (mesB! - mesA!);
}

export function projetarMeta(
  valorAlvo: Centavos,
  valorAtual: Centavos,
  prazo: DataISO | null,
  hoje: DataISO,
): ProjecaoDaMeta {
  const falta = Math.max(valorAlvo - valorAtual, 0);
  const concluida = valorAlvo > 0 && valorAtual >= valorAlvo;

  if (prazo === null) {
    return { falta, concluida, mesesRestantes: null, mensalNecessario: null, prazoVencido: false };
  }

  const restantes = mesesEntre(hoje, prazo);
  const prazoVencido = prazo < hoje && !concluida;

  if (concluida) {
    return { falta, concluida, mesesRestantes: restantes, mensalNecessario: 0, prazoVencido: false };
  }

  // Prazo no mês corrente ou já vencido: o que falta é para agora, não dividido.
  // Dividir por zero daria Infinity; dividir por um mês que já acabou mentiria.
  const meses = Math.max(restantes, 1);

  return {
    falta,
    concluida,
    mesesRestantes: restantes,
    // Arredonda para cima: guardar o valor exato deixaria centavos faltando.
    mensalNecessario: Math.ceil(falta / meses),
    prazoVencido,
  };
}

/**
 * Em quantos meses a meta é alcançada guardando um valor por mês.
 * Serve para a pergunta inversa: "consigo guardar X, quando chego lá?"
 */
export function mesesParaAlcancar(falta: Centavos, aporteMensal: Centavos): number | null {
  if (falta <= 0) return 0;
  if (aporteMensal <= 0) return null;
  return Math.ceil(falta / aporteMensal);
}

export type OrigemDoValor = 'conta' | 'declarado';

/**
 * De onde vem o "quanto já tem" (§13.2 aplicado a metas).
 *
 * `conta` — o saldo real da conta vinculada. Não pode divergir da realidade
 *           porque não é digitado.
 * `declarado` — um número que o usuário informou. Pode estar certo, mas o app
 *           não tem como confirmar, e a tela precisa dizer isso.
 */
export function origemDoValor(contaVinculadaId: string | null): OrigemDoValor {
  return contaVinculadaId === null ? 'declarado' : 'conta';
}
