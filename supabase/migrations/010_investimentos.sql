-- Investimentos (§3, §7). Tabelas dormentes até a Fase 9.
-- Alíquota de IR nunca é hardcodada no código (§7.2, §14): mora em aliquotas_ir.

create table investimentos (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  instituicao           text,
  tipo                  text not null check (tipo in (
                          'cdb', 'tesouro', 'lci', 'lca', 'poupanca',
                          'fundo', 'acoes', 'cripto', 'outro')),
  indexador             text check (indexador in ('CDI', 'SELIC', 'IPCA', 'PREFIXADO')),
  -- 110 = 110% do CDI.
  percentual_indexador  numeric(10,4),
  taxa_prefixada        numeric(10,4),
  data_aplicacao        date not null,
  valor_aplicado        numeric(14,2) not null,
  vencimento            date,
  liquidez_diaria       boolean not null default false,
  -- LCI, LCA, CRI, CRA, poupança.
  isento_ir             boolean not null default false,
  -- false para renda variável: o usuário atualiza o saldo na mão (§7.1).
  calculo_automatico    boolean not null default true,
  saldo_manual          numeric(14,2),
  saldo_conferido       numeric(14,2),
  data_conferencia      date,
  ativo                 boolean not null default true
);

create table movimentacoes_investimento (
  id              uuid primary key default gen_random_uuid(),
  investimento_id uuid not null references investimentos(id) on delete restrict,
  tipo            text not null check (tipo in ('aporte', 'resgate')),
  valor           numeric(14,2) not null,
  data            date not null,
  -- Liga com a transferência na conta corrente. Aporte NÃO é despesa (§14).
  transacao_id    uuid references transacoes(id) on delete set null
);

create table indexadores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (nome in ('CDI', 'SELIC', 'IPCA')),
  taxa_anual    numeric(10,4) not null,
  vigente_desde date not null,

  unique (nome, vigente_desde)
);

create table rendimentos (
  id                    uuid primary key default gen_random_uuid(),
  investimento_id       uuid not null references investimentos(id) on delete cascade,
  data                  date not null,
  saldo_bruto           numeric(14,2) not null,
  rendimento_dia        numeric(14,2) not null,
  rendimento_acumulado  numeric(14,2) not null,

  unique (investimento_id, data)
);

create table aliquotas_ir (
  id        uuid primary key default gen_random_uuid(),
  dias_min  int not null,
  dias_max  int,
  aliquota  numeric(6,4) not null
);

-- Dias sem rendimento (§7.1). Populado via BrasilAPI a partir da Fase 9 (§9.2).
create table feriados (
  data      date primary key,
  descricao text
);
