-- Faturas de cartão (§3, §2.1).
-- A tabela nasce na Fase 0; o preenchimento é da Fase 2.
-- Na Fase 1 transação de cartão grava fatura_id = null e é resolvida pelo
-- backfill que abre a Fase 2 (ver PLANO-FASE-0-1.md, 1.4).

create table faturas (
  id                     uuid primary key default gen_random_uuid(),
  cartao_id              uuid not null references cartoes(conta_id) on delete restrict,
  mes_referencia         date not null,
  data_fechamento        date not null,
  data_vencimento        date not null,
  valor_total            numeric(14,2) not null default 0,
  status                 text not null default 'aberta'
                           check (status in ('aberta', 'fechada', 'paga')),
  -- Pagamento de fatura é TRANSFERÊNCIA, nunca despesa (§2.1, §14).
  transacao_pagamento_id uuid references transacoes(id) on delete set null,

  unique (cartao_id, mes_referencia)
);

alter table transacoes
  add constraint transacoes_fatura_fk
  foreign key (fatura_id) references faturas(id) on delete set null;
