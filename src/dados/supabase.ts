import { createClient } from '@supabase/supabase-js';

// A anon key é pública por natureza — o que protege o banco é a RLS (§10.1).
// Nenhuma chave no repositório: as duas variáveis vêm do .env local e do painel
// da Netlify em produção.
const url = import.meta.env.VITE_SUPABASE_URL;
const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !chaveAnon) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. ' +
      'Copie .env.example para .env e preencha com os dados do projeto Supabase.',
  );
}

export const supabase = createClient(url, chaveAnon, {
  auth: {
    // App pessoal de uso diário: exigir login toda semana é atrito puro (§5).
    persistSession: true,
    autoRefreshToken: true,
  },
});
