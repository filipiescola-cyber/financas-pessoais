// A fatura em que um lançamento de cartão cai (§2.1).
//
// Mora sozinha por dependência, não por tamanho. Parcelar uma fatura cria uma
// dívida, então as faturas dependem da dívida; e a dívida cobrada no cartão
// precisa saber em que fatura cada parcela cai, então a dívida depende disto.
// Dentro de `faturas.ts`, os dois módulos se importariam mutuamente — e import
// circular funciona até o dia em que a ordem de carregamento muda e uma das
// funções chega `undefined`, sem erro nenhum na compilação.

import { faturaEscolhida, type ConfiguracaoDoCartao } from '../dominio/fatura';
import type { DataISO } from '../dominio/datas';
import { supabase } from './supabase';

/**
 * Id da fatura em que uma compra cai, criando-a se ainda não existir.
 * Compra com data antiga ou parcelamento longo pode apontar para um mês fora da
 * janela de 12 — por isso a criação sob demanda, em vez de confiar na janela.
 */
export async function idDaFatura(
  cartaoId: string,
  competencia: DataISO,
  configuracao: ConfiguracaoDoCartao,
  /** Ajuste manual em meses sobre a fatura calculada (§2.1). */
  deslocamento = 0,
): Promise<string> {
  const calculada = faturaEscolhida(competencia, configuracao, deslocamento);

  const { data: existente, error: erroBusca } = await supabase
    .from('faturas')
    .select('id')
    .eq('cartao_id', cartaoId)
    .eq('mes_referencia', calculada.mesReferencia)
    .maybeSingle();
  if (erroBusca) throw new Error(erroBusca.message);
  if (existente) return existente.id;

  const { data, error } = await supabase
    .from('faturas')
    .insert({
      cartao_id: cartaoId,
      mes_referencia: calculada.mesReferencia,
      data_fechamento: calculada.dataFechamento,
      data_vencimento: calculada.dataVencimento,
    })
    .select('id')
    .single();

  if (error) {
    // Corrida com outra aba: alguém criou entre a busca e a inserção.
    const { data: recuperada } = await supabase
      .from('faturas')
      .select('id')
      .eq('cartao_id', cartaoId)
      .eq('mes_referencia', calculada.mesReferencia)
      .maybeSingle();
    if (recuperada) return recuperada.id;
    throw new Error(error.message);
  }

  return data.id;
}
