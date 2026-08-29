import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';

// Login e nada mais, ainda de propósito — mas por outro motivo desde o
// multiusuário.
//
// Cada pessoa agora tem os próprios dados: a política de RLS filtra por dono
// (ver a migration ..._multiusuario.sql), então uma conta nova enxerga um app
// vazio, não o de outra pessoa. O que continua desligado é o CADASTRO PÚBLICO,
// e essa é uma escolha diferente: sem ele, entra quem for criado no painel do
// Supabase — o dono decide quem, em vez de qualquer um se inscrever.
//
// Se um dia o cadastro aberto fizer sentido, é aqui que a tela de "criar conta"
// entra, chamando supabase.auth.signUp. A segurança dos dados não depende
// disso; o controle de quem entra, sim.
export function Login() {
  const { sessao, carregando, entrar } = useAutenticacao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <div className="p-6 text-slate-400">Carregando…</div>;
  if (sessao) return <Navigate to="/" replace />;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch {
      // Mensagem genérica de propósito: não confirmar se o e-mail existe.
      setErro('E-mail ou senha incorretos.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={aoEnviar} className="w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-6 shadow-2xl shadow-black/40">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white">
            F
          </div>
          <div className="leading-tight">
            <h1 className="text-xl font-semibold text-slate-100">Finanças</h1>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Pessoais</p>
          </div>
        </div>

        <label className="block">
          <span className="text-sm text-slate-400">E-mail</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-400">Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
          />
        </label>

        {erro && <p className="text-sm text-red-400">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
