-- Categorias hierárquicas (§3, §4.3).
-- A natureza (§2.5) mora aqui e é sobrescrevível na transação.
-- É ela que decide o que entra na projeção de renda (§2.7, §8.3).

create table categorias (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  tipo             text not null check (tipo in ('receita', 'despesa')),
  categoria_pai_id uuid references categorias(id) on delete restrict,
  cor              text,
  icone            text,
  natureza         text check (natureza in ('fixa', 'variavel', 'eventual')),
  -- true = categoria de sistema, não pode ser excluída (§4.3).
  sistema          boolean not null default false,
  -- Acréscimo ao §3: categoria com histórico se arquiva, não se exclui (§4.8, §14).
  ativo            boolean not null default true
);

-- Permite seed idempotente e evita categoria duplicada.
create unique index categorias_nome_tipo on categorias (nome, tipo);
