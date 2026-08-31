-- Data de início e ocorrência pulada nas recorrências (§5.2, §13.3).
--
-- Dois buracos que apareceram no uso:
--
-- 1. Não havia como dizer QUANDO a recorrência começa. A geração usava
--    `created_at`, então uma assinatura que só começa em novembro passava a
--    gerar lançamento a partir de hoje, e nada podia começar no futuro.
--
-- 2. Apagar um lançamento gerado era inútil. A idempotência do §13.3 se apoia
--    na existência da transação: sem ela, a próxima abertura do app conclui que
--    a ocorrência falta e a cria de novo. O usuário apagava, o lançamento
--    voltava, e a única saída era arquivar a recorrência inteira — perdendo os
--    outros meses junto.
--
-- A correção do segundo NÃO é bloquear a exclusão: é registrar que aquela
-- ocorrência foi dispensada de propósito. O mês em que o freela não veio, ou o
-- aluguel que foi perdoado, são fatos — e a recorrência continua valendo para
-- todos os outros meses.

alter table recorrencias
  add column comeca_em date not null default current_date;

-- Quem já existia começou quando foi cadastrado: é o que a geração usava.
update recorrencias set comeca_em = created_at::date;

comment on column recorrencias.comeca_em is
  'Primeiro dia em que a recorrência vale. Pode ser no futuro (§5.2).';

create table ocorrencias_puladas (
  recorrencia_id   uuid not null references recorrencias(id) on delete cascade,
  -- A mesma chave natural da geração (§13.3): recorrência mais competência.
  data_competencia date not null,
  usuario_id       uuid not null default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  primary key (recorrencia_id, data_competencia)
);

comment on table ocorrencias_puladas is
  'Ocorrências que o usuário apagou de propósito. A geração automática as ignora, '
  'em vez de recriá-las na abertura seguinte.';

alter table ocorrencias_puladas enable row level security;

create policy "cada um vê o que é seu" on ocorrencias_puladas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create index ocorrencias_puladas_competencia on ocorrencias_puladas (data_competencia);
