import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, somarDias, ultimoDiaDoMes, type DataISO } from '../dominio/datas';
import type { Feriados } from '../dominio/diasUteis';
import { faturaDeReferencia, type ConfiguracaoDoCartao } from '../dominio/fatura';
import {
  proximasOcorrencias,
  ultimaOcorrenciaAte,
  type Frequencia,
  type RegraDoDia,
} from '../dominio/recorrencias';
import { encerrarRecorrencia } from '../dados/recorrencias';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarAviso } from './Aviso';
import { Botao, Chip, ENTRADA } from './base';

type Escolha =
  | { tipo: 'data'; data: DataISO }
  | { tipo: 'mes'; mes: string }
  | { tipo: 'sem-fim' };

/**
 * Encerrar a partir de uma cobrança escolhida (§5.2).
 *
 * Arquivar para tudo HOJE. Só que muito serviço cancelado ainda cobra até o fim
 * do período pago: arquivando no dia do cancelamento, a cobrança do mês seguinte
 * some do app — e o banco cobra do mesmo jeito. A saída era esperar essa última
 * chegar e só então lembrar de arquivar, que é exatamente o tipo de lembrete
 * que um app manual não pode depender.
 *
 * A pergunta é pela ÚLTIMA COBRANÇA, e não por uma data qualquer. É o que está
 * no e-mail de cancelamento, e é o número que se confere na fatura. Até ela,
 * nada muda; depois dela, a recorrência para sozinha, do mesmo jeito que o
 * financiamento de 36x para na 36ª.
 *
 * Não dá para escolher uma última anterior à cobrança que já veio. Ela
 * aconteceu, e continua na lista — a regra do arquivar vale aqui também.
 */
export function EncerramentoDeRecorrencia({
  recorrencia,
  feriados,
  cartao,
  aoTerminar,
}: {
  recorrencia: {
    id: string;
    descricao: string;
    dia: number;
    regra: RegraDoDia;
    comecaEm: DataISO;
    terminaEm: DataISO | null;
    frequencia: Frequencia;
  };
  feriados: Feriados;
  /** Presente quando a cobrança é de cartão: aí a última tem uma fatura. */
  cartao?: ConfiguracaoDoCartao;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const [escolha, setEscolha] = useState<Escolha | null>(null);

  const agenda = {
    dia: recorrencia.dia,
    regra: recorrencia.regra,
    comecaEm: recorrencia.comecaEm,
    frequencia: recorrencia.frequencia,
  };

  const hojeISO = hoje();
  const ultimaQueVeio = ultimaOcorrenciaAte(agenda, hojeISO, feriados);
  const proximas = proximasOcorrencias(agenda, somarDias(hojeISO, 1), 3, feriados);

  // O que a escolha significa, e o que impede de salvar.
  let fim: DataISO | null = null;
  let impedimento: string | null = null;

  if (escolha === null) {
    impedimento = 'Escolha qual é a última cobrança.';
  } else if (escolha.tipo === 'data') {
    fim = escolha.data;
  } else if (escolha.tipo === 'mes') {
    // No mês escolhido vale a cobrança daquele mês; na anual, a do último
    // aniversário até ele. As duas respostas saem da mesma função.
    const noMes = /^\d{4}-\d{2}$/.test(escolha.mes)
      ? ultimaOcorrenciaAte(agenda, ultimoDiaDoMes(`${escolha.mes}-01`), feriados)
      : null;
    if (noMes === null) impedimento = 'Escolha um mês em que esta cobrança acontece.';
    else fim = noMes;
  }

  if (fim !== null && ultimaQueVeio !== null && fim < ultimaQueVeio) {
    impedimento = `A cobrança de ${formatarBR(ultimaQueVeio)} já aconteceu — a última não pode vir antes dela.`;
  }

  const restantes =
    fim === null
      ? null
      : proximasOcorrencias(agenda, hojeISO, 240, feriados).filter((data) => data <= fim!).length;

  // Em cartão, a última cobrança tem uma fatura — é nela que se confere.
  const faturaDaUltima = cartao && fim !== null ? faturaDeReferencia(fim, cartao).dataVencimento : null;

  const salvar = useMutation({
    mutationFn: () => encerrarRecorrencia(recorrencia.id, fim),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      await invalidar();
      mostrar(
        fim === null
          ? `${recorrencia.descricao} voltou a repetir sem data para acabar.`
          : `${recorrencia.descricao} para depois da cobrança de ${formatarBR(fim)}.`,
      );
      aoTerminar();
    },
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <div>
        <p className="text-sm font-medium text-slate-100">Qual é a última cobrança?</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Até ela, nada muda: lança no dia, aparece {cartao ? 'na fatura' : 'na conta'} e no fluxo de
          caixa. Depois dela, para sozinha — sem precisar lembrar de arquivar no mês certo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ultimaQueVeio !== null && (
          <Chip
            ativo={escolha?.tipo === 'data' && escolha.data === ultimaQueVeio}
            aoClicar={() => setEscolha({ tipo: 'data', data: ultimaQueVeio })}
          >
            A de {formatarBR(ultimaQueVeio)}, que já veio
          </Chip>
        )}
        {proximas.map((data, indice) => (
          <Chip
            key={data}
            ativo={escolha?.tipo === 'data' && escolha.data === data}
            aoClicar={() => setEscolha({ tipo: 'data', data })}
          >
            {indice === 0 ? `Mais uma, em ${formatarBR(data)}` : `Até ${formatarBR(data)}`}
          </Chip>
        ))}
        <Chip
          ativo={escolha?.tipo === 'mes'}
          aoClicar={() => setEscolha({ tipo: 'mes', mes: '' })}
        >
          Outro mês
        </Chip>
        {recorrencia.terminaEm !== null && (
          <Chip
            ativo={escolha?.tipo === 'sem-fim'}
            aoClicar={() => setEscolha({ tipo: 'sem-fim' })}
          >
            Sem data para acabar
          </Chip>
        )}
      </div>

      {escolha?.tipo === 'mes' && (
        <input
          type="month"
          value={escolha.mes}
          min={(ultimaQueVeio ?? recorrencia.comecaEm).slice(0, 7)}
          onChange={(e) => setEscolha({ tipo: 'mes', mes: e.target.value })}
          className={ENTRADA}
        />
      )}

      {/* O resultado em palavras, com a fatura quando é cartão: é o que se
          confere contra o e-mail de cancelamento antes de confirmar. */}
      {impedimento === null ? (
        <p className="rounded-md border border-borda px-3 py-2 text-xs leading-relaxed text-slate-300">
          {fim === null ? (
            'Volta a repetir sem data para acabar.'
          ) : (
            <>
              Última cobrança em <strong>{formatarBR(fim)}</strong>
              {faturaDaUltima !== null && <> · entra na fatura que vence em {formatarBR(faturaDaUltima)}</>}
              {restantes !== null && (
                <> · {restantes === 0 ? 'nenhuma a partir de hoje' : `${restantes}x a partir de hoje`}</>
              )}
              .
            </>
          )}
        </p>
      ) : (
        escolha !== null && <p className="text-xs text-amber-400/80">{impedimento}</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => salvar.mutate()}
          desabilitado={impedimento !== null || salvar.isPending}
        >
          {salvar.isPending
            ? 'Salvando…'
            : escolha?.tipo === 'sem-fim'
              ? 'Tirar a data de fim'
              : 'Encerrar'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
