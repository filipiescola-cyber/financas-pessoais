// Encerrar uma conta ou um cartão sem quebrar o histórico (§4.8).
//
// A regra do projeto é dura e continua valendo: conta com lançamento NUNCA é
// apagada. Apagar reescreveria meses já fechados, e um app de finanças que
// reescreve o passado não serve para nada.
//
// Mas "não apagar" não pode virar "não dá para encerrar". Conta bancária fecha
// na vida real, e o app precisa saber disso — senão ela fica para sempre na
// lista, no seletor de lançamento e no saldo consolidado.
//
// Encerrar é, então: tirar de circulação, gravar a data, e preservar tudo.
//
// Cada pendência vem com os ITENS, não com um número. "1 recorrência ativa" não
// dá para decidir nada: desativar qual? Uma tela que pede confiança cega antes
// de mexer em dado do usuário é uma tela que ele vai fechar sem clicar.

import type { Centavos } from './dinheiro';

/** Uma linha de pendência, do jeito que a tela mostra. */
export type Item = {
  id: string;
  rotulo: string;
  /** Coluna da direita: valor, data, o que ajudar a reconhecer o item. */
  detalhe?: string;
};

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------
//
// Duas pendências impedem, porque cada uma é uma forma diferente de o app
// passar a mentir depois:
//
//   SALDO — dinheiro não evapora porque a conta fechou. Ele foi para algum
//   lugar, e esse lugar é uma transferência (§2.3). Encerrar com saldo faria o
//   patrimônio cair sem nenhum lançamento explicando.
//
//   RECORRÊNCIA — continuaria gerando lançamento todo mês numa conta morta,
//   sozinha, para sempre. É a que mais estraga: o usuário não vê acontecer.
//
// O resto avisa: são coisas que precisam ser sabidas, mas que não deixam
// nenhum número errado.

export type SituacaoDaConta = {
  /** Saldo atual, pelas regras do §13.2. */
  saldo: Centavos;
  recorrenciasAtivas: Item[];
  /** Parcelas e recorrências já gravadas com data à frente (§13.2). */
  lancamentosFuturos: Item[];
  /** Cartões que têm esta conta como pagadora (§2.1). */
  cartoesQuePagam: Item[];
  /** Atalhos de um toque que preenchem esta conta (§5.2). */
  modelos: Item[];
  temHistorico: boolean;
};

export type Bloqueio =
  | { motivo: 'saldo'; valor: Centavos }
  | { motivo: 'recorrencias'; itens: Item[] };

export type Aviso =
  | { motivo: 'lancamentos_futuros'; itens: Item[] }
  | { motivo: 'metas'; itens: Item[] }
  | { motivo: 'cartoes'; itens: Item[] }
  | { motivo: 'modelos'; itens: Item[] };

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

  if (situacao.saldo !== 0) bloqueios.push({ motivo: 'saldo', valor: situacao.saldo });
  if (situacao.recorrenciasAtivas.length > 0) {
    bloqueios.push({ motivo: 'recorrencias', itens: situacao.recorrenciasAtivas });
  }

  if (situacao.lancamentosFuturos.length > 0) {
    avisos.push({ motivo: 'lancamentos_futuros', itens: situacao.lancamentosFuturos });
  }
  if (situacao.cartoesQuePagam.length > 0) {
    avisos.push({ motivo: 'cartoes', itens: situacao.cartoesQuePagam });
  }
  if (situacao.modelos.length > 0) avisos.push({ motivo: 'modelos', itens: situacao.modelos });

  return {
    bloqueios,
    avisos,
    pode: bloqueios.length === 0,
    // Saldo inicial não impede: sem lançamento nenhum, ele é só um número
    // digitado no cadastro. O que impede é alguma outra linha apontando para
    // a conta, que o banco recusaria apagar.
    podeExcluir:
      !situacao.temHistorico &&
      situacao.recorrenciasAtivas.length === 0 &&
      situacao.cartoesQuePagam.length === 0 &&
      situacao.modelos.length === 0,
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

export type SituacaoDoCartao = {
  /** Soma das faturas não pagas cujo vencimento já chegou. */
  faturaCobravel: Centavos;
  /** Soma das faturas não pagas que ainda vão vencer — parcelas, sobretudo. */
  faturasFuturas: Centavos;
  /** Assinaturas cobradas neste cartão (§5.2). */
  recorrenciasAtivas: Item[];
  modelos: Item[];
  temHistorico: boolean;
};

export type BloqueioDoCartao =
  | { motivo: 'fatura_cobravel'; valor: Centavos }
  | { motivo: 'recorrencias'; itens: Item[] };

export type AvisoDoCartao =
  | { motivo: 'faturas_futuras'; valor: Centavos }
  | { motivo: 'modelos'; itens: Item[] };

export type EncerramentoDoCartao = {
  bloqueios: BloqueioDoCartao[];
  avisos: AvisoDoCartao[];
  pode: boolean;
  podeExcluir: boolean;
};

export function conferirEncerramentoDeCartao(situacao: SituacaoDoCartao): EncerramentoDoCartao {
  const bloqueios: BloqueioDoCartao[] = [];
  const avisos: AvisoDoCartao[] = [];

  if (situacao.faturaCobravel !== 0) {
    bloqueios.push({ motivo: 'fatura_cobravel', valor: situacao.faturaCobravel });
  }
  if (situacao.recorrenciasAtivas.length > 0) {
    bloqueios.push({ motivo: 'recorrencias', itens: situacao.recorrenciasAtivas });
  }

  if (situacao.faturasFuturas !== 0) {
    avisos.push({ motivo: 'faturas_futuras', valor: situacao.faturasFuturas });
  }
  if (situacao.modelos.length > 0) avisos.push({ motivo: 'modelos', itens: situacao.modelos });

  return {
    bloqueios,
    avisos,
    pode: bloqueios.length === 0,
    podeExcluir:
      !situacao.temHistorico &&
      situacao.recorrenciasAtivas.length === 0 &&
      situacao.modelos.length === 0,
  };
}
