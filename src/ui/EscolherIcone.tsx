import { GRUPOS_DE_ICONES, IconeDeCategoria } from './iconesDeCategoria';

/**
 * A grade de ícones para escolher (§4.3).
 *
 * Tudo visível de uma vez, sem busca: são pouco mais de cinquenta desenhos, e
 * uma caixa de busca só serviria se o usuário soubesse o nome interno de cada
 * um — que ele não sabe, e nem deveria precisar saber. Olhar é mais rápido.
 *
 * "Sem ícone" é a primeira opção e não uma ausência de escolha: categoria sem
 * ícone continua funcionando, e a tela cai no ponto colorido.
 */
export function EscolherIcone({
  escolhido,
  cor,
  aoEscolher,
}: {
  escolhido: string | null;
  cor?: string | null;
  aoEscolher: (chave: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => aoEscolher(null)}
        className={`rounded-full px-2.5 py-1 text-xs transition ${
          escolhido === null
            ? 'bg-slate-700 text-slate-100'
            : 'border border-borda text-slate-500 hover:border-borda-forte'
        }`}
      >
        sem ícone
      </button>

      {GRUPOS_DE_ICONES.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">
            {grupo.titulo}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {grupo.chaves.map((chave) => (
              <button
                key={chave}
                type="button"
                onClick={() => aoEscolher(chave)}
                title={chave}
                aria-pressed={escolhido === chave}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  escolhido === chave
                    ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300'
                    : 'border-borda text-slate-400 hover:border-borda-forte hover:text-slate-200'
                }`}
              >
                <IconeDeCategoria
                  chave={chave}
                  cor={escolhido === chave ? (cor ?? null) : null}
                  className="h-[18px] w-[18px]"
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
