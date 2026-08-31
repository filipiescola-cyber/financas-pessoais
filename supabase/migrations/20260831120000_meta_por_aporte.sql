-- Meta deixa de ser "o saldo daquela conta" (§8.8).
--
-- O vínculo com conta contava o saldo INTEIRO como progresso. Só funciona se a
-- conta for dedicada à meta — e conta corrente nunca é. Na prática o app dizia
-- que a viagem estava 80% financiada porque o salário tinha acabado de cair.
--
-- Duas fontes, porque são dois jeitos reais de guardar dinheiro:
--
--   APORTE — você separa e registra. "Guardei R$ 200 este mês." É o caso de
--   quem mantém o dinheiro misturado e controla por decisão, não por conta.
--
--   INVESTIMENTOS — o dinheiro está numa aplicação (ou mais) reservada para
--   aquilo. Aqui o saldo inteiro CONTA mesmo, e conta certo, porque a aplicação
--   é dedicada por natureza. É o que a conta corrente nunca foi.
--
-- `valor_atual` sai: com aporte ele é a soma dos aportes, com investimento é a
-- soma dos saldos. Guardar o total seria o mesmo fato em dois lugares (§13.2) —
-- e desta vez com um agravante: editar um aporte antigo deixaria o total certo
-- e o histórico mentindo, ou o contrário.

create table aportes_meta (
  id         uuid primary key default gen_random_uuid(),
  meta_id    uuid not null references metas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id),
  valor      numeric(14,2) not null,
  data       date not null,
  -- Liga com a transferência, quando o aporte moveu dinheiro de verdade.
  transacao_id uuid references transacoes(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table aportes_meta is
  'O que foi separado para a meta, aporte a aporte. O progresso é a soma disto '
  '— nunca um total guardado à parte (§13.2).';

alter table aportes_meta enable row level security;

create policy "cada um vê o que é seu" on aportes_meta
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create index aportes_meta_por_meta on aportes_meta (meta_id, data);

-- Quais aplicações contam para a meta. Tabela de ligação e não uma coluna
-- porque uma meta pode estar espalhada em mais de uma aplicação — e costuma
-- estar, quando se aporta todo mês num RDB novo.
create table metas_investimentos (
  meta_id         uuid not null references metas(id) on delete cascade,
  investimento_id uuid not null references investimentos(id) on delete cascade,
  usuario_id      uuid not null default auth.uid() references auth.users(id),
  primary key (meta_id, investimento_id)
);

alter table metas_investimentos enable row level security;

create policy "cada um vê o que é seu" on metas_investimentos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

alter table metas
  add column fonte text not null default 'aporte'
    check (fonte in ('aporte', 'investimentos'));

comment on column metas.fonte is
  'aporte: o progresso é a soma dos aportes. investimentos: é a soma dos saldos vinculados.';

-- O que já foi digitado como "valor atual" vira o primeiro aporte: é
-- exatamente o que ele significava — dinheiro que a pessoa disse ter separado.
insert into aportes_meta (meta_id, valor, data, usuario_id)
select id, valor_atual, current_date, usuario_id
from metas
where valor_atual > 0;

alter table metas drop column valor_atual;

-- O vínculo com conta sai junto. Meta apontada para conta corrente nascia
-- mentindo, e manter a coluna deixaria a mentira a um clique de distância.
alter table metas drop column conta_id;
