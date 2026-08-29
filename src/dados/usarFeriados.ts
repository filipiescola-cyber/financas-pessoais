// O calendário de dias úteis, uma vez por sessão (§9.2).
//
// A tabela `feriados` é a mesma que o cálculo de rendimento usa. Um app, um
// calendário: se a regra do "5º dia útil" tivesse a própria lista, as duas
// divergiriam no primeiro ano em que alguém atualizasse só uma.
//
// Muda uma vez por ano, então fica em cache pela sessão inteira. Vazia, a conta
// de dia útil sobra o fim de semana — degradação explícita, documentada em
// `dominio/diasUteis.ts`.

import { useQuery } from '@tanstack/react-query';
import type { Feriados } from '../dominio/diasUteis';
import { listarFeriados } from './indicadores';

const VAZIO: Feriados = new Set<string>();

export function usarFeriados(): Feriados {
  const consulta = useQuery({
    queryKey: ['feriados'],
    queryFn: listarFeriados,
    staleTime: Infinity,
  });

  return consulta.data ?? VAZIO;
}
