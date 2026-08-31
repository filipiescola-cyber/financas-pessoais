// Passos do onboarding (§4.1).
//
// Mora no domínio, não em `dados/config.ts`, porque decidir onde o wizard abre é
// regra — e regra precisa de teste sem arrastar o cliente do banco junto.
//
// Duas trilhas, e a escolha é do usuário logo na primeira tela:
//
//   RÁPIDA — só o que o app precisa para não mentir. Sem saldo, sem fatura
//   aberta e sem os parcelamentos em andamento, os próximos meses aparecem
//   artificialmente baratos e a projeção do §8 não serve para nada. Esse é o
//   piso, e ele não é negociável em trilha nenhuma.
//
//   COMPLETA — o piso mais o que dá contexto (despesas fixas, empresa, dívidas)
//   e os passos que só EXPLICAM. Estes últimos não pedem nada: existem porque
//   três ideias deste app contrariam a intuição — pagar fatura não é despesa,
//   gasto e saída de dinheiro acontecem em datas diferentes, e despesa não tem
//   um total único. Quem não entende essas três lê os próprios números errado,
//   por mais certos que eles estejam.
//
// O §4.1 avisa que o onboarding longo é onde se abandona. Por isso a trilha
// rápida existe, por isso ela vem primeiro na tela de escolha, e por isso os
// passos de conceito ficam TODOS fora dela.

export type PassoDoOnboarding =
  | 'trilha'
  | 'carteira'
  | 'contas'
  | 'cartoes'
  | 'conceito-cartao'
  | 'fatura-aberta'
  | 'parcelamentos'
  | 'despesas-fixas'
  | 'fontes-de-renda'
  | 'conceito-natureza'
  | 'empresa'
  | 'dividas'
  | 'categorias'
  | 'tour';

export type Trilha = 'rapida' | 'completa';

/** O piso: sem isto o app dá número errado, não número incompleto. */
const ESSENCIAIS: PassoDoOnboarding[] = [
  'trilha',
  'carteira',
  'contas',
  'cartoes',
  'fatura-aberta',
  'parcelamentos',
  'fontes-de-renda',
  'categorias',
];

const COMPLETA: PassoDoOnboarding[] = [
  'trilha',
  'carteira',
  'contas',
  'cartoes',
  'conceito-cartao',
  'fatura-aberta',
  'parcelamentos',
  'despesas-fixas',
  'fontes-de-renda',
  'conceito-natureza',
  'empresa',
  'dividas',
  'categorias',
  'tour',
];

export function passosDaTrilha(trilha: Trilha): PassoDoOnboarding[] {
  return trilha === 'rapida' ? ESSENCIAIS : COMPLETA;
}

/** Passos que só explicam: não pedem nada e nunca bloqueiam. */
export const SO_EXPLICAM: PassoDoOnboarding[] = [
  'trilha',
  'conceito-cartao',
  'conceito-natureza',
  'tour',
];

export function soExplica(passo: PassoDoOnboarding): boolean {
  return SO_EXPLICAM.includes(passo);
}

/** Passos que podem ser adiados, com aviso de que a projeção fica incompleta (§4.1). */
export const ADIAVEIS: PassoDoOnboarding[] = ['fatura-aberta', 'parcelamentos'];

export type StatusOnboarding = {
  concluido: boolean;
  passoAtual: PassoDoOnboarding;
  pulados: PassoDoOnboarding[];
  /**
   * Qual trilha o usuário escolheu.
   *
   * Opcional porque quem começou antes desta tela existir não escolheu nada —
   * e cair na trilha completa de repente, no meio de um onboarding já em
   * andamento, seria mudar as regras no meio do caminho.
   */
  trilha?: Trilha;
};

export const STATUS_INICIAL: StatusOnboarding = {
  concluido: false,
  passoAtual: 'trilha',
  pulados: [],
};

/** A trilha em uso, com o padrão para quem começou antes da escolha existir. */
export function trilhaDe(status: StatusOnboarding): Trilha {
  return status.trilha ?? 'rapida';
}

/**
 * Onde o wizard deve abrir.
 *
 * O passo gravado é onde o usuário PAROU, e usá-lo direto tem um efeito ruim:
 * depois de concluir, o gravado é o último passo, então voltar ao onboarding
 * caía na tela final — sem nada para fazer além de concluir de novo.
 *
 * A regra certa é abrir no primeiro passo que ainda pede alguma coisa:
 *
 *   não concluído   -> onde parou
 *   concluído com passo adiado -> no primeiro adiado, que é o que o banner do
 *                                 Início promete quando diz "preencher agora"
 *   concluído e completo       -> do começo, para servir de revisão
 */
export function passoDeEntrada(status: StatusOnboarding): PassoDoOnboarding {
  const passos = passosDaTrilha(trilhaDe(status));
  if (!status.concluido) {
    // Trocar de trilha pode deixar o passo gravado fora da lista. Nesse caso a
    // resposta certa é o começo, nunca uma tela que a trilha atual não tem.
    return passos.includes(status.passoAtual) ? status.passoAtual : passos[0]!;
  }

  const pendente = passos.find((passo) => status.pulados.includes(passo));
  return pendente ?? passos[0]!;
}
