import { CORES_DE_CONTA, corDaInstituicao, INSTITUICOES } from './instituicoes';
import { Campo, ENTRADA } from './base';

/**
 * Instituição e cor da conta (§4).
 *
 * Os dois campos vivem juntos porque escolher um resolve o outro: clicar em
 * "Nubank" traz o roxo junto, e ninguém precisa decidir cor nenhuma. A paleta
 * só aparece para quem digitou uma instituição que não está na lista — que é
 * exatamente quem tem uma cor a escolher.
 *
 * A lista é atalho, não cadastro: o campo de texto continua aceitando qualquer
 * coisa, e nada é validado contra ela.
 */
export function CampoInstituicao({
  instituicao,
  cor,
  aoMudar,
}: {
  instituicao: string;
  cor: string | null;
  aoMudar: (instituicao: string, cor: string | null) => void;
}) {
  const conhecida = corDaInstituicao(instituicao) !== null;

  return (
    <Campo rotulo="Instituição (opcional)">
      <div className="flex flex-wrap gap-2">
        {INSTITUICOES.map((item) => {
          const escolhida = instituicao.trim().toLowerCase() === item.nome.toLowerCase();
          return (
            <button
              key={item.nome}
              type="button"
              onClick={() => aoMudar(escolhida ? '' : item.nome, escolhida ? null : item.cor)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                escolhida
                  ? 'bg-superficie-alta text-slate-100 ring-1 ring-inset'
                  : 'border border-borda text-slate-400 hover:border-borda-forte'
              }`}
              style={escolhida ? { boxShadow: `inset 0 0 0 1px ${item.cor}` } : undefined}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.cor }}
              />
              {item.nome}
            </button>
          );
        })}
      </div>

      <input
        value={instituicao}
        onChange={(e) => {
          const texto = e.target.value;
          // Digitou o nome de uma conhecida: a cor dela vem junto. Digitou
          // outra coisa: mantém a cor que já estava escolhida.
          aoMudar(texto, corDaInstituicao(texto) ?? cor);
        }}
        placeholder="ou digite outra"
        className={`${ENTRADA} mt-2`}
      />

      {instituicao.trim() !== '' && !conhecida && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-600">cor</span>
          {CORES_DE_CONTA.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={`Cor ${opcao}`}
              onClick={() => aoMudar(instituicao, cor === opcao ? null : opcao)}
              className={`h-6 w-6 rounded-full transition ${
                cor === opcao ? 'ring-2 ring-slate-300 ring-offset-2 ring-offset-superficie' : ''
              }`}
              style={{ backgroundColor: opcao }}
            />
          ))}
        </div>
      )}
    </Campo>
  );
}
