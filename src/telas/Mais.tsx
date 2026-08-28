import { Link } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';

const ITENS = [
  { para: '/cartoes', titulo: 'Cartões', descricao: 'Fechamento, vencimento e limite' },
  { para: '/categorias', titulo: 'Categorias', descricao: 'Natureza fixa, variável e eventual' },
  { para: '/dados', titulo: 'Dados', descricao: 'Backup e exportação em JSON e CSV' },
];

export function Mais() {
  const { sessao, sair } = useAutenticacao();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Mais</h1>
        <p className="text-sm text-slate-500">{sessao?.user.email}</p>
      </header>

      <nav className="space-y-2">
        {ITENS.map((item) => (
          <Link
            key={item.para}
            to={item.para}
            className="block rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700"
          >
            <p className="text-slate-100">{item.titulo}</p>
            <p className="text-xs text-slate-500">{item.descricao}</p>
          </Link>
        ))}
      </nav>

      <button
        onClick={() => void sair()}
        className="w-full rounded-lg border border-slate-800 px-4 py-3 text-sm text-slate-400 hover:border-slate-700"
      >
        Sair
      </button>
    </div>
  );
}
