// Divisão de transação (§5.5).
//
// Uma compra, mais de uma categoria. O caso clássico do §5.5 é o mercado onde
// metade é comida e metade é embalagem da empresa.
//
// Três regras, e as três existem para o mesmo perigo — contar o dinheiro duas
// vezes:
//
//   1. A SOMA DAS FILHAS BATE COM O PAI, exatamente. Não é validação de
//      formulário: é a diferença entre um relatório que fecha e um que não
//      fecha. A regra de arredondamento é a mesma do parcelamento (§13.1) — a
//      sobra vai na última parte, nunca espalhada.
//
//   2. O SALDO É AFETADO UMA VEZ SÓ, pelo pai. As filhas existem para os
//      relatórios por categoria e nunca somam saldo — quem garante isso é o
//      filtro `transacao_pai_id is null` que já vive na view, na função do
//      banco e no extrato.
//
//   3. RELATÓRIO POR CATEGORIA USA AS FILHAS; extrato e conciliação usam o pai.
//      As duas coisas ao mesmo tempo dobrariam o mês.
//
// A parte "Empresa" é o outro motivo de a divisão existir (§2.6). Ela não é
// despesa sua: é dinheiro seu parado dentro do negócio, e precisa aparecer como
// saldo da conta Empresa. Por isso ela sai daqui marcada — quem grava monta a
// perna espelho do outro lado.

import type { Centavos } from './dinheiro';
import { dividirEmParcelas } from './parcelas';

/** Os motivos do §2.6. Repetido aqui porque o domínio não conhece o banco. */
export type MotivoDaEmpresa = 'investimento' | 'giro' | 'subsidio' | 'devolucao';

export type ParteDaDivisao = {
  /** Sempre positivo. O sinal é do pai, e é aplicado na hora de gravar. */
  valor: Centavos;
  categoriaId: string | null;
  descricao: string;
  /**
   * Preenchido quando esta parte é da empresa (§2.6).
   *
   * Muda o que a parte É: deixa de ser despesa pessoal e vira transferência,
   * porque comprar filamento não é você gastando — é você movendo patrimônio
   * de um bolso para outro. Somada às despesas, ela inflaria o custo de vida
   * mínimo, que é o número do §2.5 com mais serventia.
   */
  motivoEmpresa: MotivoDaEmpresa | null;
};

/** Uma parte só não é divisão — é a transação original com outro nome. */
export const MINIMO_DE_PARTES = 2;

export type SituacaoDaDivisao = {
  /** O valor do pai, em positivo. É o que precisa ser distribuído. */
  total: Centavos;
  alocado: Centavos;
  /** Quanto ainda falta distribuir. Negativo quando passou do total. */
  sobra: Centavos;
  fecha: boolean;
  /**
   * O que impede de salvar, já escrito para a tela. `null` quando dá para
   * salvar. Mora aqui, e não no componente, porque a regra é de domínio: a
   * tela só decide onde o texto aparece.
   */
  impedimento: string | null;
};

/**
 * A conta da divisão, do jeito que a tela precisa mostrar enquanto se digita.
 *
 * O número que interessa é a SOBRA, não o total alocado: "faltam R$ 12,40" diz
 * o que fazer, "R$ 67,60 de R$ 80,00" faz a pessoa subtrair de cabeça.
 */
export function situacaoDaDivisao(
  valorDoPai: Centavos,
  partes: readonly ParteDaDivisao[],
): SituacaoDaDivisao {
  const total = Math.abs(valorDoPai);
  const alocado = partes.reduce((soma, parte) => soma + Math.abs(parte.valor), 0);
  const sobra = total - alocado;

  return {
    total,
    alocado,
    sobra,
    fecha: sobra === 0,
    impedimento: impedimentoDaDivisao(total, partes, sobra),
  };
}

function impedimentoDaDivisao(
  total: Centavos,
  partes: readonly ParteDaDivisao[],
  sobra: Centavos,
): string | null {
  if (total === 0) return 'Lançamento sem valor não tem o que dividir.';
  if (partes.length < MINIMO_DE_PARTES) return 'Uma divisão precisa de pelo menos duas partes.';
  if (partes.some((parte) => Math.abs(parte.valor) === 0)) return 'Toda parte precisa de um valor.';

  // A sobra é o impedimento mais comum, e o texto diz o número em vez de
  // mandar conferir: quem está dividindo já sabe que não fechou.
  if (sobra > 0) return `Ainda falta distribuir ${emReais(sobra)}.`;
  if (sobra < 0) return `As partes passam ${emReais(-sobra)} do valor do lançamento.`;

  return null;
}

function emReais(centavos: Centavos): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Divide o valor em N partes iguais, com a sobra na última (§13.1).
 *
 * É o ponto de partida da tela: quem abre a divisão quase sempre quer duas
 * metades e ajusta uma delas. Reusa a função do parcelamento de propósito — a
 * regra de arredondamento é a mesma, e duas implementações dela divergiriam no
 * primeiro caso ímpar.
 */
export function distribuirIgualmente(valorDoPai: Centavos, quantidade: number): Centavos[] {
  return dividirEmParcelas(Math.abs(valorDoPai), quantidade);
}

/**
 * Joga a sobra na última parte, para a divisão fechar num toque.
 *
 * Sem isso, dividir R$ 80,01 em três vira uma caça ao centavo perdido — e a
 * regra do §13.1 já diz onde ele vai.
 */
export function completarUltimaParte(
  valorDoPai: Centavos,
  partes: readonly ParteDaDivisao[],
): ParteDaDivisao[] {
  if (partes.length === 0) return [];

  const { sobra } = situacaoDaDivisao(valorDoPai, partes);
  if (sobra === 0) return [...partes];

  const ultima = partes[partes.length - 1]!;
  const ajustada = Math.abs(ultima.valor) + sobra;

  // Sobra negativa maior que a última parte zeraria ou inverteria o sinal dela.
  // Nesse caso não há o que completar: quem digitou demais precisa ver o
  // impedimento e corrigir, não receber um valor inventado.
  if (ajustada <= 0) return [...partes];

  return [...partes.slice(0, -1), { ...ultima, valor: ajustada }];
}

/** Uma filha pronta para gravar: já com o sinal do pai. */
export type FilhaDaDivisao = {
  valor: Centavos;
  categoriaId: string | null;
  descricao: string;
  motivoEmpresa: MotivoDaEmpresa | null;
  /**
   * Transferência, não despesa (§2.6). A parte da empresa move patrimônio de
   * um bolso para outro e não pode entrar no custo de vida mínimo.
   */
  ehTransferencia: boolean;
};

/**
 * As filhas, com o sinal do pai aplicado.
 *
 * O sinal vem do pai e não do tipo porque é o pai que já moveu o saldo: uma
 * filha com sinal trocado não erraria o saldo (filha não soma saldo), mas
 * erraria o relatório por categoria, que é justamente o que ela existe para
 * alimentar.
 */
export function filhasDaDivisao(
  valorDoPai: Centavos,
  partes: readonly ParteDaDivisao[],
): FilhaDaDivisao[] {
  const situacao = situacaoDaDivisao(valorDoPai, partes);
  if (situacao.impedimento !== null) {
    throw new Error(situacao.impedimento);
  }

  const sinal = valorDoPai < 0 ? -1 : 1;

  return partes.map((parte) => ({
    valor: sinal * Math.abs(parte.valor),
    categoriaId: parte.categoriaId,
    descricao: parte.descricao.trim(),
    motivoEmpresa: parte.motivoEmpresa,
    ehTransferencia: parte.motivoEmpresa !== null,
  }));
}

/**
 * Dá para dividir este lançamento?
 *
 * Transferência não se divide: ela já é o movimento entre dois bolsos e não
 * tem categoria para repartir. Filha também não — divisão de divisão viraria
 * uma árvore, e nenhuma das três regras lá de cima sabe somar dois níveis.
 */
export function podeDividir(transacao: {
  tipo: 'receita' | 'despesa' | 'transferencia';
  transacaoPaiId: string | null;
  valor: Centavos;
}): boolean {
  return (
    transacao.tipo !== 'transferencia' &&
    transacao.transacaoPaiId === null &&
    Math.abs(transacao.valor) > 0
  );
}
