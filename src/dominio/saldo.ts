// Saldo (§13.2).
//
// "Provavelmente o ponto mais fácil de errar do projeto inteiro." Três armadilhas,
// todas tratadas aqui:
//
// 1. TRANSAÇÃO FUTURA JÁ EXISTE NO BANCO. Parcelamento e recorrência gravam
//    lançamentos com data à frente. Saldo de hoje só olha data_caixa <= hoje.
//
// 2. FILHA DE DIVISÃO NÃO SOMA (§5.5). A transação pai já moveu o saldo; as
//    filhas existem para os relatórios por categoria. Contar as duas dobra tudo.
//
// 3. EMPRESA E DÍVIDA NÃO ENTRAM NO CONSOLIDADO (§2.6, §4.7). O saldo da conta
//    "Empresa" é recebível, não caixa — não é dinheiro disponível para gastar.
//
// Saldo nunca é armazenado em coluna. É sempre recalculado.

import type { Centavos } from './dinheiro';
import type { DataISO } from './datas';

export type TipoDeConta =
  | 'corrente'
  | 'poupanca'
  | 'carteira'
  | 'cartao_credito'
  | 'investimento'
  | 'empresa'
  | 'divida';

export type TransacaoParaSaldo = {
  valor: Centavos;
  dataCaixa: DataISO;
  transacaoPaiId: string | null;
};

export type ContaParaSaldo = {
  tipo: TipoDeConta;
  ativo: boolean;
  saldoInicial: Centavos;
};

/**
 * Tipos que ficam fora do "quanto eu tenho para gastar".
 *
 * `empresa`: dinheiro seu parado dentro do negócio. É recebível (§2.6).
 * `divida`: saldo devedor, não caixa (§4.7).
 * `cartao_credito`: fatura em aberto é compromisso, não conta com saldo próprio (§2.1).
 */
export const TIPOS_FORA_DO_CONSOLIDADO: readonly TipoDeConta[] = [
  'empresa',
  'divida',
  'cartao_credito',
];

/** Só o que já aconteceu, e só transação pai. */
export function saldoDaConta(
  saldoInicial: Centavos,
  transacoes: readonly TransacaoParaSaldo[],
  referencia: DataISO,
): Centavos {
  return transacoes.reduce((acumulado, t) => {
    if (t.transacaoPaiId !== null) return acumulado;
    if (t.dataCaixa > referencia) return acumulado;
    return acumulado + t.valor;
  }, saldoInicial);
}

/**
 * Soma o que está de fato disponível. Conta arquivada fica de fora: ela sai dos
 * seletores e do saldo, mas continua nos relatórios de meses passados (§4.8).
 */
export function saldoConsolidado(
  contas: readonly (ContaParaSaldo & { saldoAtual: Centavos })[],
): Centavos {
  return contas
    .filter((c) => c.ativo && !TIPOS_FORA_DO_CONSOLIDADO.includes(c.tipo))
    .reduce((total, c) => total + c.saldoAtual, 0);
}

export function entraNoConsolidado(conta: ContaParaSaldo): boolean {
  return conta.ativo && !TIPOS_FORA_DO_CONSOLIDADO.includes(conta.tipo);
}

/**
 * Rótulo da conta "Empresa" (§2.6). Nunca a palavra "Saldo", nunca verde:
 * um número subindo aqui parece boa notícia e significa o contrário.
 */
export function rotuloDaContaEmpresa(saldo: Centavos): string {
  if (saldo > 0) return 'A empresa te deve';
  if (saldo < 0) return 'Você retirou mais do que aportou';
  return 'Nada parado no negócio';
}

/**
 * Saldo negativo na conta "Empresa" quase sempre é erro de lançamento —
 * pró-labore marcado como devolução de aporte (§2.6).
 */
export function empresaComSaldoSuspeito(saldo: Centavos): boolean {
  return saldo < 0;
}
