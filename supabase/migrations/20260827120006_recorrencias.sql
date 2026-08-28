-- Recorrências (§3, §5.2).
-- Cadastro entra na Fase 1 (despesas fixas e fontes de renda do onboarding, §4.1).
-- A geração automática do lançamento no dia certo é da Fase 3.

create table recorrencias (
  id             uuid primary key default gen_random_uuid(),
  descricao      text not null,
  -- null quando o valor varia mês a mês: o lançamento entra com revisado = false (§5.2).
  valor_previsto numeric(14,2),
  categoria_id   uuid references categorias(id) on delete restrict,
  conta_id       uuid not null references contas(id) on delete restrict,
  -- Acréscimo ao §3: fonte de renda fixa vira recorrência de receita (§4.5).
  tipo           text not null default 'despesa' check (tipo in ('receita', 'despesa')),
  natureza       text check (natureza in ('fixa', 'variavel', 'eventual')),
  frequencia     text not null check (frequencia in ('mensal', 'semanal', 'anual')),
  dia            int not null check (dia between 1 and 31),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table transacoes
  add constraint transacoes_recorrencia_fk
  foreign key (recorrencia_id) references recorrencias(id) on delete set null;
