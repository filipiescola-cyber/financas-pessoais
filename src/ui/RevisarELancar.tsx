import { useState } from 'react';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from './CampoValor';
import { Botao } from './base';

/**
 * Revisar o valor antes de lançar uma recorrência prevista (§5.2).
 *
 * O valor previsto é uma expectativa, não um fato: salário vem com hora extra,
 * conta de luz vem mais cara, o freela veio pela metade. Lançar direto pelo
 * previsto grava um número que o usuário sabe que está errado — e um número
 * errado lançado é pior do que a pendência, porque a pendência ainda se vê.
 *
 * O previsto entra preenchido, então quando bate é um toque a mais e pronto.
 * Quando não bate, a diferença aparece escrita: é ela que o usuário confere,
 * não o valor absoluto. E o botão diz o número que vai ser gravado, não um
 * "confirmar" genérico.
 *
 * A recorrência NÃO é atualizada com o valor lançado. Um mês diferente é um
 * mês diferente; reescrever a expectativa a cada lançamento faria a previsão
 * perseguir o passado em vez de prever o mês seguinte.
 *
 * Só o painel mora aqui; o gatilho fica com a tela. As duas listas que usam
 * isto têm formatos diferentes — na de Início o botão acompanha o valor, na de
 * Lançamentos ele fica embaixo do ícone de relógio — e o painel aberto precisa
 * da linha inteira nas duas. Espremer os dois casos num componente só custava
 * mais do que a linha de estado que cada tela guarda.
 */
export function RevisarELancar({
  valorPrevisto,
  tipo,
  lancando,
  aoConfirmar,
  aoCancelar,
}: {
  valorPrevisto: Centavos | null;
  tipo: 'receita' | 'despesa';
  lancando: boolean;
  aoConfirmar: (valorReal: Centavos) => void;
  aoCancelar: () => void;
}) {
  const [valor, setValor] = useState<Centavos>(valorPrevisto ?? 0);

  const diferenca = valorPrevisto === null ? 0 : valor - valorPrevisto;

  return (
    <div className="w-full space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      {/* A linha acima já diz o que é e quando era; repetir aqui seria ruído. */}
      <p className="text-[11px] uppercase tracking-wider text-slate-500">
        {tipo === 'receita' ? 'quanto entrou de verdade' : 'quanto saiu de verdade'}
      </p>

      <CampoValor valor={valor} aoMudar={setValor} autoFocus />

      {valorPrevisto === null ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Recorrência de valor variável — não havia previsto para comparar.
        </p>
      ) : diferenca !== 0 ? (
        <p className="text-xs leading-relaxed text-amber-300">
          {formatar(Math.abs(diferenca))} {diferenca > 0 ? 'a mais' : 'a menos'} que o previsto de{' '}
          {formatar(valorPrevisto)}.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-600">
          Igual ao previsto de {formatar(valorPrevisto)}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Botao
          aoClicar={() => aoConfirmar(valor)}
          desabilitado={valor <= 0 || lancando}
          className="px-3 py-1.5 text-sm"
        >
          {lancando ? 'Lançando…' : `Lançar ${formatar(valor)}`}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoCancelar} className="px-3 py-1.5 text-sm">
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
