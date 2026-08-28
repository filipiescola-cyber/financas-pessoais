-- Orçamento e metas (§3). Tabelas dormentes até a Fase 7.
-- Existem desde já para não exigir migration em banco com dado real.

create table orcamentos (
  id              uuid primary key default gen_random_uuid(),
  mes_referencia  date not null,
  categoria_id    uuid not null references categorias(id) on delete restrict,
  valor_planejado numeric(14,2) not null,

  unique (mes_referencia, categoria_id)
);

create table metas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  valor_alvo  numeric(14,2) not null,
  valor_atual numeric(14,2) not null default 0,
  prazo       date,
  conta_id    uuid references contas(id) on delete set null
);
