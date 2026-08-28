// Passos do onboarding (§4.1).
//
// Mora no domínio, não em `dados/config.ts`, porque decidir onde o wizard abre é
// regra — e regra precisa de teste sem arrastar o cliente do banco junto.

export type PassoDoOnboarding =
  | 'carteira'
  | 'contas'
  | 'cartoes'
  | 'fatura-aberta'
  | 'parcelamentos'
  | 'despesas-fixas'
  | 'fontes-de-renda'
  | 'empresa'
  | 'categorias';

export const PASSOS: PassoDoOnboarding[] = [
  'carteira',
  'contas',
  'cartoes',
  'fatura-aberta',
  'parcelamentos',
  'despesas-fixas',
  'fontes-de-renda',
  'empresa',
  'categorias',
];

/** Passos que podem ser adiados, com aviso de que a projeção fica incompleta (§4.1). */
export const ADIAVEIS: PassoDoOnboarding[] = ['fatura-aberta', 'parcelamentos'];

export type StatusOnboarding = {
  concluido: boolean;
  passoAtual: PassoDoOnboarding;
  pulados: PassoDoOnboarding[];
};

export const STATUS_INICIAL: StatusOnboarding = {
  concluido: false,
  passoAtual: 'carteira',
  pulados: [],
};

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
  if (!status.concluido) return status.passoAtual;

  const pendente = PASSOS.find((passo) => status.pulados.includes(passo));
  return pendente ?? PASSOS[0]!;
}
