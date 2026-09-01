-- Fechamento mensal, com memória (§8.7, §10.2).
--
-- "Ritual de 10 minutos, uma vez por mês. Sem esse ritual o app vira projeto
-- abandonado no mês 4." E era exatamente o que estava acontecendo com a tela:
-- os passos marcados viviam só na memória do navegador. Fechar o app apagava
-- tudo, e voltar no dia seguinte para terminar significava começar de novo.
--
-- Um ritual que esquece o que já foi feito não é ritual — é um formulário que
-- se recusa a ser preenchido em duas sentadas. E sem registro nenhum não havia
-- como responder a pergunta mais simples do ritual: quais meses eu já fechei?
--
-- Só o que NÃO dá para calcular fica guardado (§13.2). "Não há lançamento sem
-- categoria" e "todas as contas foram conferidas" continuam derivados dos
-- dados, e por isso não podem ficar desatualizados. O que se guarda aqui é a
-- única coisa que os dados não sabem: que uma PESSOA olhou e deu por feito.

create table fechamentos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null default auth.uid() references auth.users(id),
  -- Primeiro dia do mês que foi fechado.
  mes_referencia date not null,
  -- Os passos marcados à mão. Os automáticos não entram: eles se recalculam.
  passos         text[] not null default '{}',
  concluido_em   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Um fechamento por mês, por pessoa. A restrição inclui o dono porque sem
  -- isso duas pessoas não poderiam fechar o mesmo mês (§3).
  unique (usuario_id, mes_referencia)
);

comment on table fechamentos is
  'O que já foi feito no ritual de cada mês (§8.7). Guarda só o que não dá '
  'para calcular: que uma pessoa olhou e deu por feito.';

alter table fechamentos enable row level security;

create policy "cada um ve o que e seu" on fechamentos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create index fechamentos_por_mes on fechamentos (usuario_id, mes_referencia desc);
