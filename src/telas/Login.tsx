import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAutenticacao } from '../dados/autenticacao';

// Login e nada mais. Não existe tela de cadastro de propósito: o app é de um
// usuário só e o signup público fica DESLIGADO no painel do Supabase — é o que
// sustenta a política de RLS "using (true)" (ver 012_rls.sql).
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
      <form onSubmit={aoEnviar} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold text-slate-100">Finanças Pessoais</h1>

        <label className="block">
          <span className="text-sm text-slate-400">E-mail</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
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
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-slate-500"
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
