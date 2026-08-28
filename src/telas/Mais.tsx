import { Link } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';
import { Pagina } from '../ui/base';
import { gruposForaDasAbas } from '../ui/navegacao';

export function Mais() {
  const { sessao, sair } = useAutenticacao();

  return (
    <Pagina titulo="Mais" subtitulo={sessao?.user.email}>
      {/* Os mesmos grupos da barra lateral, vindos da mesma lista: celular e
          desktop discordarem sobre onde uma tela mora é como ter dois apps. */}
      {gruposForaDasAbas().map((grupo) => (
        <section key={grupo.titulo} className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500">{grupo.titulo}</h2>
          {grupo.itens.map((item) => (
            <Link
              key={item.para}
              to={item.para}
              className="flex items-center gap-3 rounded-lg border border-borda bg-superficie px-4 py-3 hover:border-borda-forte"
            >
              <span className="text-slate-500">
                <item.icone />
              </span>
              <span className="min-w-0">
                <span className="block text-slate-100">{item.rotulo}</span>
                <span className="block text-xs text-slate-500">{item.descricao}</span>
              </span>
            </Link>
          ))}
        </section>
      ))}

      <button
        onClick={() => void sair()}
        className="w-full rounded-lg border border-borda px-4 py-3 text-sm text-slate-400 hover:border-borda-forte"
      >
        Sair
      </button>
    </Pagina>
  );
}
