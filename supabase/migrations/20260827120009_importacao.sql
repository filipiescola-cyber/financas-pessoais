-- Importação de extratos (§3, §6). Tabelas dormentes até a Fase 4.
-- Nenhum layout de banco é hardcodado: o mapa de colunas de CSV mora em
-- perfis_importacao, configurável pelo usuário (§6.2, §14).

create table importacoes (
  id                    uuid primary key default gen_random_uuid(),
  conta_id              uuid not null references contas(id) on delete restrict,
  nome_arquivo          text not null,
  formato               text not null check (formato in ('ofx', 'csv')),
  periodo_inicio        date,
  periodo_fim           date,
  total_linhas          int not null default 0,
  importadas            int not null default 0,
  ignoradas_duplicadas  int not null default 0,
  -- Casadas com lançamento manual já existente (§6.4).
  conciliadas           int not null default 0,
  importado_em          timestamptz not null default now()
);

alter table transacoes
  add constraint transacoes_importacao_fk
  foreign key (importacao_id) references importacoes(id) on delete set null;

create table perfis_importacao (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  conta_id         uuid references contas(id) on delete set null,
  formato          text not null check (formato in ('ofx', 'csv')),
  delimitador      text,
  linhas_cabecalho int not null default 1,
  col_data         int,
  col_descricao    int,
  col_valor        int,
  -- Alguns bancos usam colunas separadas para entrada e saída.
  col_valor_saida  int,
  formato_data     text,
  decimal_virgula  boolean not null default true,
  -- Extrato de cartão costuma vir com o sinal trocado.
  inverter_sinal   boolean not null default false
);
