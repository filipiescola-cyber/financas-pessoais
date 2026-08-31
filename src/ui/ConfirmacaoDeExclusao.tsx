// Confirmação de exclusão, com a consequência dita antes do clique (§4.8, §7.4).
//
// A regra do app é: arquivar é para o que ACABOU, excluir é para o que NUNCA
// ACONTECEU. A segunda só é segura se quem clica souber o que ela desfaz — e
// por isso o painel existe: a frase é a trava, não um período de espera.
//
// Esperar N dias premiaria o instante de MENOS informação: no momento em que se
// cadastra algo errado, sabe-se com certeza que foi errado; uma semana depois,
// não. E liberaria apagar o que foi arquivado por ter acabado de verdade.

import type { ReactNode } from 'react';
import { Botao } from './base';

export function ConfirmacaoDeExclusao({
  /** O que a exclusão desfaz, em uma frase. Já resolvido por quem chama. */
  consequencia,
  /** Quando existe, a exclusão está bloqueada e isto explica por quê. */
  impedimento,
  ajuda,
  rotulo = 'Excluir mesmo assim',
  emAndamento,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  consequencia: ReactNode;
  impedimento?: ReactNode;
  ajuda?: ReactNode;
  rotulo?: string;
  emAndamento?: boolean;
  erro?: string | null;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const bloqueado = impedimento !== undefined && impedimento !== null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3">
      <p className="text-sm text-slate-200">{bloqueado ? impedimento : consequencia}</p>
      {ajuda && <p className="text-xs leading-relaxed text-slate-500">{ajuda}</p>}
      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="flex gap-2">
        {!bloqueado && (
          <Botao tipo="perigo" aoClicar={aoConfirmar} desabilitado={emAndamento}>
            {emAndamento ? 'Excluindo…' : rotulo}
          </Botao>
        )}
        <Botao tipo="secundario" aoClicar={aoCancelar}>
          {bloqueado ? 'Entendi' : 'Cancelar'}
        </Botao>
      </div>
    </div>
  );
}
