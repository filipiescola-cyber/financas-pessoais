-- Row Level Security em todas as tabelas (§3, §10.1).
--
-- ATENÇÃO — leia antes de mexer:
--
-- O schema do §3 não tem coluna de dono em tabela nenhuma: o app é de um CPF só.
-- Logo, a política não consegue filtrar por usuário, só por autenticação.
-- A consequência é direta e precisa ser tratada FORA do banco:
--
--   >>> DESLIGAR O CADASTRO PÚBLICO (signup) NO PAINEL DO SUPABASE            <<<
--   >>> LOGO DEPOIS DE CRIAR O SEU ÚNICO USUÁRIO.                             <<<
--
-- Com signup aberto e "using (true)", qualquer pessoa cria uma conta e lê o
-- banco inteiro. Este é o único furo de segurança real da Fase 0.
--
-- A role anon fica sem política nenhuma: deslogado, toda consulta volta vazia.
--
-- Se um dia o app virar multiusuário: usuario_id uuid default auth.uid() em
-- todas as tabelas e política por dono. Migration grande — só se acontecer.

do $$
declare
  tabela text;
begin
  for tabela in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('drop policy if exists "usuario autenticado" on public.%I', tabela);
    execute format(
      'create policy "usuario autenticado" on public.%I for all to authenticated using (true) with check (true)',
      tabela
    );
  end loop;
end $$;

-- Toda migration que criar tabela nova a partir daqui precisa criar a própria
-- política. O bloco acima roda uma vez só e não alcança o futuro.
