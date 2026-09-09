// As ocorrências de recorrência já geradas num período (§5.2, §13.3).
//
// Existe por causa de um bug que só aparecia às vezes, e o "às vezes" era a
// pista: a mesma chave de cache guardava intervalos DIFERENTES. A tela inicial
// pedia um mês, a lista de lançamentos pedia três, e as duas usavam
// `['ocorrencias-geradas', mes]`.
//
// Quem carregasse primeiro enchia o cache. Abrindo o app pelo Início — que é
// o caminho normal — a lista de lançamentos recebia só o mês corrente, não
// achava a competência do mês anterior, e a cobrança de cartão já lançada
// reaparecia como prevista ao lado dela mesma. A fatura mostrava a mesma
// assinatura duas vezes.
//
// Aqui a chave é o próprio intervalo. Duas telas que peçam o mesmo período
// compartilham o cache de propósito; duas que peçam períodos diferentes não
// podem mais se confundir, porque a chave e a consulta saem dos MESMOS dois
// argumentos.

import { useQuery } from '@tanstack/react-query';
import { ocorrenciasDoPeriodo } from './geracaoRecorrencias';
import type { DataISO } from '../dominio/datas';

export function usarOcorrencias(de: DataISO, ate: DataISO, habilitado = true) {
  return useQuery({
    queryKey: ['ocorrencias-geradas', de, ate],
    queryFn: () => ocorrenciasDoPeriodo(de, ate),
    // A ponte só existe olhando um mês distante: sem isto ela buscaria um
    // intervalo invertido em todo mês passado, de graça.
    enabled: habilitado,
  });
}
