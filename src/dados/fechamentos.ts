// O que já foi feito no ritual de cada mês (§8.7).
//
// Os passos marcados viviam só na memória do navegador: fechar o app apagava
// tudo, e voltar no dia seguinte para terminar significava começar de novo. Um
// ritual que esquece o que já foi feito não é ritual.
//
// Só o que NÃO dá para calcular fica aqui (§13.2). "Não há lançamento sem
// categoria" continua derivado dos dados, e por isso não pode ficar
// desatualizado. O que se guarda é a única coisa que os dados não sabem: que
// uma pessoa olhou e deu por feito.

import { primeiroDiaDoMes, type DataISO } from '../dominio/datas';
import { supabase } from './supabase';

export type Fechamento = {
  mes: DataISO;
  passos: string[];
  concluidoEm: string | null;
};

export async function listarFechamentos(): Promise<Fechamento[]> {
  const { data, error } = await supabase
    .from('fechamentos')
    .select('mes_referencia, passos, concluido_em')
    .order('mes_referencia', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((linha) => ({
    mes: linha.mes_referencia,
    passos: linha.passos ?? [],
    concluidoEm: linha.concluido_em,
  }));
}

/**
 * Grava os passos marcados de um mês.
 *
 * `upsert` pela chave (dono, mês): marcar o segundo passo não pode criar uma
 * segunda linha do mesmo mês, senão o histórico passaria a mostrar "agosto"
 * duas vezes com respostas diferentes.
 *
 * `concluidoEm` vem de fora porque quem sabe se o ritual acabou é o domínio —
 * ele conhece a lista inteira de passos, inclusive os que os dados resolvem
 * sozinhos e que por isso nunca aparecem em `passos`.
 */
export async function salvarFechamento(dados: {
  mes: DataISO;
  passos: readonly string[];
  concluido: boolean;
}): Promise<void> {
  const { error } = await supabase.from('fechamentos').upsert(
    {
      mes_referencia: primeiroDiaDoMes(dados.mes),
      passos: [...dados.passos],
      concluido_em: dados.concluido ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'usuario_id,mes_referencia' },
  );
  if (error) throw new Error(error.message);
}
