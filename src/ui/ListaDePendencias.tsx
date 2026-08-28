import type { Item } from '../dominio/encerramento';

/**
 * Os itens por trás de uma pendência de encerramento (§4.8).
 *
 * Existe porque "1 recorrência ativa" não responde a pergunta que o usuário
 * tem na hora de clicar: desativar QUAL? Um botão que mexe em dado sem dizer
 * em que dado mexe é um botão que não se aperta — e a tela inteira trava aí.
 *
 * Lista longa é cortada: passado um punhado de linhas, ela deixa de informar e
 * passa a esconder o botão que resolve a pendência.
 */
export function ListaDePendencias({ itens, limite = 6 }: { itens: readonly Item[]; limite?: number }) {
  if (itens.length === 0) return null;

  const restantes = itens.length - limite;

  return (
    <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie px-3">
      {itens.slice(0, limite).map((item) => (
        <li key={item.id} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
          <span className="truncate text-slate-300">{item.rotulo}</span>
          {item.detalhe !== undefined && (
            <span className="shrink-0 text-slate-500">{item.detalhe}</span>
          )}
        </li>
      ))}
      {restantes > 0 && (
        <li className="py-1.5 text-xs text-slate-600">e mais {restantes}</li>
      )}
    </ul>
  );
}
