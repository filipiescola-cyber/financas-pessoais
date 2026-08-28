// Rotinas de abertura (§13.3).
//
// "O app é um PWA sem servidor próprio. Nada roda sozinho a menos que alguém
// dispare." Quem dispara é a abertura do app.
//
// Regra que vale para todas: idempotente e retroativa. Se o usuário ficar 40
// dias sem abrir, ao voltar tudo se acerta de uma vez, sem duplicar nada.

import { hoje } from '../dominio/datas';
import { gravarConfig, lerConfig } from './config';
import { backfillFaturas, fecharFaturasVencidas, garantirFaturas } from './faturas';
import { gerarRecorrenciasPendentes } from './geracaoRecorrencias';
import { supabase } from './supabase';

export type ResultadoDasRotinas = {
  faturasFechadas: number;
  transacoesVinculadas: number;
  recorrenciasGeradas: number;
  executadaEm: string;
};

const CHAVE = 'ultima_execucao_rotinas';

/**
 * Roda uma vez por dia, na abertura. O controle é por data, não por sessão:
 * abrir o app cinco vezes no mesmo dia não repete o trabalho, e a primeira
 * abertura depois da virada roda tudo que ficou pendente.
 */
export async function rodarRotinasDeAbertura(forcar = false): Promise<ResultadoDasRotinas | null> {
  const hojeISO = hoje();
  const ultima = await lerConfig<{ data: string }>(CHAVE);
  if (!forcar && ultima?.data === hojeISO) return null;

  // 1. Cada cartão precisa ter as próximas 12 faturas prontas (§4.2).
  const { data: cartoes, error } = await supabase.from('cartoes').select('*');
  if (error) throw error;

  for (const cartao of cartoes ?? []) {
    await garantirFaturas(cartao.conta_id, {
      diaFechamento: cartao.dia_fechamento,
      diaVencimento: cartao.dia_vencimento,
    });
  }

  // 2. Transações de cartão da Fase 1 nasceram sem fatura. O vínculo é
  //    determinístico e só preenche o que está nulo.
  const { atualizadas } = await backfillFaturas();

  // 3. Fecha o que já passou da data de fechamento.
  const faturasFechadas = await fecharFaturasVencidas(hojeISO);

  // 4. Gera os lançamentos de recorrência que já venceram e ainda não existem.
  const recorrenciasGeradas = await gerarRecorrenciasPendentes(hojeISO);

  await gravarConfig(CHAVE, { data: hojeISO, em: new Date().toISOString() });

  return {
    faturasFechadas,
    transacoesVinculadas: atualizadas,
    recorrenciasGeradas,
    executadaEm: hojeISO,
  };
}
