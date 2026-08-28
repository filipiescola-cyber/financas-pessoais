// Tipos do domínio, do lado do app.
//
// Existem separados de `tipos-gerados.ts` de propósito. O arquivo gerado é o
// espelho literal do banco: dinheiro vem como number (numeric) e pode vir nulo
// onde a coluna aceita nulo. Aqui dentro do app, dinheiro é SEMPRE centavos
// inteiros (§13.1) e os campos obrigatórios já foram resolvidos.
//
// A conversão acontece uma vez só, na fronteira — nos módulos de acesso.

import type { Centavos } from '../dominio/dinheiro';
import type { DataISO } from '../dominio/datas';
import type { Natureza } from '../dominio/natureza';
import type { TipoDeConta } from '../dominio/saldo';
import type { Database } from './tipos-gerados';

export type LinhaConta = Database['public']['Tables']['contas']['Row'];
export type LinhaCartao = Database['public']['Tables']['cartoes']['Row'];
export type LinhaCategoria = Database['public']['Tables']['categorias']['Row'];
export type LinhaSaldo = Database['public']['Views']['saldos_contas']['Row'];

export type { TipoDeConta };

export type Conta = {
  id: string;
  nome: string;
  tipo: TipoDeConta;
  instituicao: string | null;
  saldoInicial: Centavos;
  saldoConferido: Centavos | null;
  dataConferencia: DataISO | null;
  ativo: boolean;
};

/** Conta com o saldo calculado pela view (§13.2). */
export type ContaComSaldo = Conta & { saldoAtual: Centavos };

export type Cartao = {
  contaId: string;
  limite: Centavos | null;
  diaFechamento: number;
  diaVencimento: number;
  /**
   * Conta de onde a fatura costuma ser paga (§2.1). É um padrão para a tela de
   * pagamento, não fonte de verdade: a origem real de cada pagamento é a que
   * ficou gravada na transferência daquele mês.
   */
  contaPagamentoId: string | null;
};

export type CartaoComConta = Cartao & { conta: Conta };

export type TipoDeCategoria = 'receita' | 'despesa';

export type Categoria = {
  id: string;
  nome: string;
  tipo: TipoDeCategoria;
  categoriaPaiId: string | null;
  cor: string | null;
  icone: string | null;
  natureza: Natureza | null;
  sistema: boolean;
  ativo: boolean;
};

/** Rótulos de cada tipo de conta, para seletores e listagens. */
export const ROTULO_TIPO_CONTA: Record<TipoDeConta, string> = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira',
  cartao_credito: 'Cartão de crédito',
  investimento: 'Investimento',
  empresa: 'Empresa',
  divida: 'Dívida',
};

/**
 * Tipos que o usuário pode criar pela tela de contas na Fase 1.
 * `cartao_credito` tem tela própria (§4.2) e `divida` fica para depois (§4.7).
 */
export const TIPOS_DE_CONTA_CADASTRAVEIS: readonly TipoDeConta[] = [
  'corrente',
  'poupanca',
  'carteira',
  'investimento',
  'empresa',
];
