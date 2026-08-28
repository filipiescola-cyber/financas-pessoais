// Encerrar uma conta sem quebrar o histórico (§4.8).
//
// A regra do projeto é dura e continua valendo: conta com lançamento NUNCA é
// apagada. Apagar reescreveria meses já fechados, e um app de finanças que
// reescreve o passado não serve para nada.
//
// Mas "não apagar" não pode virar "não dá para encerrar". Conta bancária
// fecha na vida real, e o app precisa saber disso — senão ela fica para sempre
// na lista, no seletor de lançamento e no saldo consolidado.
//
// Encerrar é, então: tirar de circulação, gravar a data, e preservar tudo.
//
// O que este módulo decide é o que precisa ser resolvido ANTES, porque cada
// pendência é uma forma diferente de o app passar a mentir depois:
//
//   SALDO — dinheiro não evapora porque a conta fechou. Ele foi para algum
//   lugar, e esse lugar é uma transferência (§2.3). Encerrar com saldo faria
//   o patrimônio cair sem nenhum lançamento explicando.
//
//   RECORRÊNCIA — continuaria gerando lançamento todo mês numa conta morta,
//   sozinha, para sempre. É a que mais estraga: o usuário não vê acontecer.
//
// O resto é aviso, não impedimento: são coisas que o usuário precisa saber,
// mas que não deixam o app errado.

import type { Centavos } from './dinheiro';

export type MotivoDeBloqueio = 'saldo' | 'recorrencias';
export type MotivoDeAviso = 'lancamentos_futuros' | 'metas' | 'cartoes' | 'modelos';

export type SituacaoDaConta = {
  /** Saldo atual, pelas regras do §13.2. */
  saldo: Centavos;
  recorrenciasAtivas: number;
  /** Parcelas e recorrências já gravadas com data à frente (§13.2). */
  lancamentosFuturos: number;
  metasVinculadas: number;
  /** Cartões que têm esta conta como pagadora (§2.1). */
  cartoesQuePagam: number;
  /** Atalhos de um toque que preenchem esta conta (§5.2). */
  modelos: number;
  temHistorico: boolean;
};

export type Bloqueio = { motivo: MotivoDeBloqueio; quantidade: number };
export type Aviso = { motivo: MotivoDeAviso; quantidade: number };

export type Encerramento = {
  bloqueios: Bloqueio[];
  avisos: Aviso[];
  /** Encerrar é possível: nada pendente que faria o app mentir. */
  pode: boolean;
  /**
   * Conta sem nenhum lançamento pode ser apagada de vez (§4.8): não há
   * histórico para preservar, e é o caso de quem criou errado no onboarding.
   */
  podeExcluir: boolean;
};

export function conferirEncerramento(situacao: SituacaoDaConta): Encerramento {
  const bloqueios: Bloqueio[] = [];
  const avisos: Aviso[] = [];

  if (situacao.saldo !== 0) bloqueios.push({ motivo: 'saldo', quantidade: situacao.saldo });
  if (situacao.recorrenciasAtivas > 0) {
    bloqueios.push({ motivo: 'recorrencias', quantidade: situacao.recorrenciasAtivas });
  }

  if (situacao.lancamentosFuturos > 0) {
    avisos.push({ motivo: 'lancamentos_futuros', quantidade: situacao.lancamentosFuturos });
  }
  if (situacao.metasVinculadas > 0) {
    avisos.push({ motivo: 'metas', quantidade: situacao.metasVinculadas });
  }
  if (situacao.cartoesQuePagam > 0) {
    avisos.push({ motivo: 'cartoes', quantidade: situacao.cartoesQuePagam });
  }
  if (situacao.modelos > 0) avisos.push({ motivo: 'modelos', quantidade: situacao.modelos });

  return {
    bloqueios,
    avisos,
    pode: bloqueios.length === 0,
    // Saldo inicial não impede: sem lançamento nenhum, ele é só um número
    // digitado no cadastro. O que impede é alguma outra linha apontando para
    // a conta, que o banco recusaria apagar.
    podeExcluir:
      !situacao.temHistorico &&
      situacao.recorrenciasAtivas === 0 &&
      situacao.metasVinculadas === 0 &&
      situacao.cartoesQuePagam === 0 &&
      situacao.modelos === 0,
  };
}

// ---------------------------------------------------------------------------
// Cartão de crédito
// ---------------------------------------------------------------------------
//
// Encerrar cartão tem um risco que conta não tem: DÍVIDA QUE SOME DA TELA.
//
// Cartão não tem saldo — tem fatura (§2.1). Um cartão fora de circulação
// desaparece do seletor de faturas, e com ele desaparece o que ainda se deve.
// Não some do banco, mas some da vista, que na prática é o mesmo: ninguém paga
// o que não vê.
//
// Por isso a régua é diferente dos dois lados:
//
//   O QUE JÁ É COBRÁVEL IMPEDE. Fatura fechada ou vencida e não paga é dívida
//   de agora. Encerrar sem registrar o pagamento apagaria da tela um valor que
//   o banco continua cobrando.
//
//   O QUE VEM DEPOIS SÓ AVISA — e a tela de faturas continua mostrando o
//   cartão encerrado enquanto sobrar fatura por pagar. Parcelamento em curso é
//   o caso comum: a dívida existe, é conhecida, e não é motivo para deixar o
//   cartão morto para sempre na lista.

export type MotivoDeBloqueioDoCartao = 'fatura_cobravel' | 'recorrencias';
export type MotivoDeAvisoDoCartao = 'faturas_futuras' | 'modelos';

export type SituacaoDoCartao = {
  /** Soma das faturas não pagas cujo vencimento já chegou. */
  faturaCobravel: Centavos;
  /** Soma das faturas não pagas que ainda vão vencer — parcelas, sobretudo. */
  faturasFuturas: Centavos;
  /** Assinaturas cobradas neste cartão (§5.2). */
  recorrenciasAtivas: number;
  modelos: number;
  temHistorico: boolean;
};

export type BloqueioDoCartao = { motivo: MotivoDeBloqueioDoCartao; quantidade: number };
export type AvisoDoCartao = { motivo: MotivoDeAvisoDoCartao; quantidade: number };

export type EncerramentoDoCartao = {
  bloqueios: BloqueioDoCartao[];
  avisos: AvisoDoCartao[];
  pode: boolean;
  podeExcluir: boolean;
};

export function conferirEncerramentoDeCartao(
  situacao: SituacaoDoCartao,
): EncerramentoDoCartao {
  const bloqueios: BloqueioDoCartao[] = [];
  const avisos: AvisoDoCartao[] = [];

  if (situacao.faturaCobravel !== 0) {
    bloqueios.push({ motivo: 'fatura_cobravel', quantidade: situacao.faturaCobravel });
  }
  if (situacao.recorrenciasAtivas > 0) {
    bloqueios.push({ motivo: 'recorrencias', quantidade: situacao.recorrenciasAtivas });
  }

  if (situacao.faturasFuturas !== 0) {
    avisos.push({ motivo: 'faturas_futuras', quantidade: situacao.faturasFuturas });
  }
  if (situacao.modelos > 0) avisos.push({ motivo: 'modelos', quantidade: situacao.modelos });

  return {
    bloqueios,
    avisos,
    pode: bloqueios.length === 0,
    podeExcluir:
      !situacao.temHistorico && situacao.recorrenciasAtivas === 0 && situacao.modelos === 0,
  };
}
