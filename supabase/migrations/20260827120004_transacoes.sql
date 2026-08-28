-- Transações (§3). Tabela central do app.
--
-- Convenções que não podem ser esquecidas:
--   valor negativo = saída, positivo = entrada
--   data_competencia = quando o fato ocorreu; data_caixa = quando o dinheiro se moveu (§2.4)
--   parcelamento e recorrência gravam transações com data FUTURA (§13.2) —
--   toda consulta precisa dizer explicitamente se olha passado, futuro ou os dois.
--
-- fatura_id, recorrencia_id e importacao_id ganham FK nas migrations 005, 006 e 009,
-- porque as tabelas de destino ainda não existem aqui.

create table transacoes (
  id                     uuid primary key default gen_random_uuid(),
  conta_id               uuid not null references contas(id) on delete restrict,
  categoria_id           uuid references categorias(id) on delete restrict,
  descricao              text,
  -- Como veio do extrato. Nunca sobrescrever (§3).
  descricao_original     text,
  valor                  numeric(14,2) not null,
  tipo                   text not null check (tipo in ('receita', 'despesa', 'transferencia')),
  data_competencia       date not null,
  data_caixa             date not null,
  fatura_id              uuid,
  grupo_parcelamento_id  uuid,
  parcela_num            int,
  parcela_total          int,
  recorrencia_id         uuid,
  -- Lançamento espelho da transferência (§2.3).
  transferencia_par_id   uuid references transacoes(id) on delete set null,
  -- ID único vindo do OFX (§6.3). Usado só a partir da Fase 4.
  fitid                  text,
  importacao_id          uuid,
  origem                 text not null default 'manual'
                           check (origem in ('manual', 'importacao', 'recorrencia', 'parcelamento')),
  -- Sobrescreve a natureza da categoria (§2.5).
  natureza               text check (natureza in ('fixa', 'variavel', 'eventual')),
  -- Motivo do movimento para a conta "Empresa" (§2.6).
  motivo_empresa         text check (motivo_empresa in ('investimento', 'giro', 'subsidio', 'devolucao')),
  -- Divisão de transação (§5.5): o pai afeta o saldo, as filhas afetam os relatórios.
  transacao_pai_id       uuid references transacoes(id) on delete cascade,
  -- Sempre null na V1. Gancho da integração futura (§9.5). Não remover (§14).
  pluggy_transaction_id  text unique,
  revisado               boolean not null default false,
  observacao             text,
  created_at             timestamptz not null default now(),

  -- parcela_num e parcela_total andam juntos, e a parcela existe dentro do total.
  constraint transacoes_parcela_par
    check ((parcela_num is null) = (parcela_total is null)),
  constraint transacoes_parcela_valida
    check (parcela_total is null or parcela_num between 1 and parcela_total),
  -- motivo_empresa só faz sentido em transferência (§2.6).
  constraint transacoes_motivo_empresa_so_em_transferencia
    check (motivo_empresa is null or tipo = 'transferencia')
);

-- Índice obrigatório do §3: é o que impede o mesmo extrato importado duas vezes
-- de duplicar lançamento. Entra agora, mesmo sem importação existir.
create unique index transacoes_fitid_unico
  on transacoes (conta_id, fitid)
  where fitid is not null;

-- Índices de trabalho.
create index transacoes_conta_caixa on transacoes (conta_id, data_caixa);
create index transacoes_competencia on transacoes (data_competencia);
create index transacoes_fatura      on transacoes (fatura_id)             where fatura_id is not null;
create index transacoes_grupo       on transacoes (grupo_parcelamento_id) where grupo_parcelamento_id is not null;
create index transacoes_pai         on transacoes (transacao_pai_id)      where transacao_pai_id is not null;
