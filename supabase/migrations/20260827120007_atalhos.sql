-- Atalhos de lançamento e configuração (§3, §5.2).
-- modelos e a LEITURA da memória de autocomplete são da Fase 3.
-- A ESCRITA em memoria_descricao começa já na Fase 1: se a memória não encher
-- desde o primeiro lançamento, o autocomplete nasce inútil no mês 3.

create table modelos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  -- null = pergunta o valor no momento do lançamento.
  valor_padrao  numeric(14,2),
  categoria_id  uuid references categorias(id) on delete restrict,
  conta_id      uuid references contas(id) on delete restrict,
  tipo          text not null default 'despesa' check (tipo in ('receita', 'despesa')),
  icone         text,
  ordem         int not null default 0
);

create table memoria_descricao (
  id           uuid primary key default gen_random_uuid(),
  descricao    text not null unique,
  categoria_id uuid references categorias(id) on delete set null,
  conta_id     uuid references contas(id) on delete set null,
  vezes_usada  int not null default 1,
  ultimo_uso   timestamptz not null default now()
);

create index memoria_descricao_frequencia on memoria_descricao (vezes_usada desc, ultimo_uso desc);

-- Chave-valor. Guarda onboarding_status (§4.1), sementes de renda variável (§4.5)
-- e ultima_execucao das rotinas de abertura (§13.3).
create table config (
  chave text primary key,
  valor jsonb not null
);
