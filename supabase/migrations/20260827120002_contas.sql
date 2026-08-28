-- Contas e cartões (§3, §4).
-- Dinheiro sempre em numeric(14,2). Nunca float (§13.1).
-- Domínio fechado com CHECK em text, nunca enum nativo: alterar enum depois é caro.

create table contas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  tipo              text not null check (tipo in (
                      'corrente', 'poupanca', 'carteira', 'cartao_credito',
                      'investimento', 'empresa', 'divida')),
  instituicao       text,
  saldo_inicial     numeric(14,2) not null default 0,
  -- Último saldo real conferido no extrato (§5.3). NÃO é o saldo do app (§13.2).
  saldo_conferido   numeric(14,2),
  data_conferencia  date,
  -- Sempre null na V1. Gancho da integração futura (§9.5). Não remover (§14).
  pluggy_account_id text,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Só pode existir uma conta "Empresa" ativa (§4.6).
create unique index contas_uma_empresa_ativa
  on contas (tipo)
  where tipo = 'empresa' and ativo;

comment on column contas.saldo_conferido is
  'Número digitado pelo usuário a partir do extrato (§5.3). Nunca usar como fonte de saldo.';
comment on column contas.pluggy_account_id is
  'Sempre null na V1. Gancho para integração futura (§9.5). Não remover.';

-- Complementa contas do tipo cartao_credito.
create table cartoes (
  conta_id       uuid primary key references contas(id) on delete restrict,
  limite         numeric(14,2),
  -- Obrigatórios: sem eles a fatura não fecha e o §2.1 quebra (§4.2).
  dia_fechamento int not null check (dia_fechamento between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31)
);
