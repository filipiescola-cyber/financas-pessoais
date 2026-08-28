import { useState } from 'react';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from './CampoValor';
import { Botao } from './base';

/**
 * Revisar antes de lançar uma recorrência prevista (§5.2).
 *
 * O valor previsto é uma expectativa, não um fato: salário vem com hora extra,
 * conta de luz vem mais cara, o freela veio pela metade. Lançar direto pelo
 * previsto grava um número que o usuário sabe que está errado — e um número
 * errado lançado é pior do que a pendência, porque a pendência ainda se vê.
 *
 * O previsto entra preenchido, então quando bate é um toque a mais e pronto.
 * Quando não bate, a diferença aparece escrita: é ela que o usuário confere,
 * não o valor absoluto.
 *
 * A recorrência NÃO é atualizada com o valor lançado. Um mês diferente é um
 * mês diferente; reescrever a expectativa a cada lançamento faria a previsão
 * perseguir o passado em vez de prever o mês seguinte.
 */
export function RevisarELancar({
  valorPrevisto,
  tipo,
  lancando,
  aoConfirmar,
  discreto = false,
}: {
  valorPrevisto: Centavos | null;
  tipo: 'receita' | 'despesa';
  lancando: boolean;
  aoConfirmar: (valorReal: Centavos) => void;
  /** Variante em texto, para linhas de lista mais apertadas. */
  discreto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState<Centavos>(valorPrevisto ?? 0);

  if (!aberto) {
    return discreto ? (
      <button
        onClick={() => setAberto(true)}
        className="text-xs text-emerald-400 transition hover:text-emerald-300"
      >
        revisar e lançar
      </button>
    ) : (
      <Botao tipo="secundario" aoClicar={() => setAberto(true)} className="px-3 py-1.5">
        revisar e lançar
      </Botao>
    );
  }

  const diferenca = valorPrevisto === null ? 0 : valor - valorPrevisto;

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoValor
        valor={valor}
        aoMudar={setValor}
        autoFocus
        rotulo={tipo === 'receita' ? 'Quanto entrou de verdade' : 'Quanto saiu de verdade'}
      />

      {valorPrevisto === null ? (
        <p className="text-xs text-slate-500">
          Esta recorrência é de valor variável — não havia previsto para comparar.
        </p>
      ) : diferenca !== 0 ? (
        <p className="text-xs text-amber-300">
          {formatar(Math.abs(diferenca))} {diferenca > 0 ? 'a mais' : 'a menos'} que o previsto de{' '}
          {formatar(valorPrevisto)}.
        </p>
      ) : (
        <p className="text-xs text-slate-600">Igual ao previsto.</p>
      )}

      <div className="flex gap-2">
        <Botao
          aoClicar={() => aoConfirmar(valor)}
          desabilitado={valor <= 0 || lancando}
          className="px-3 py-1.5"
        >
          {lancando ? 'Lançando…' : 'Lançar'}
        </Botao>
        <Botao
          tipo="secundario"
          aoClicar={() => {
            setValor(valorPrevisto ?? 0);
            setAberto(false);
          }}
          className="px-3 py-1.5"
        >
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
