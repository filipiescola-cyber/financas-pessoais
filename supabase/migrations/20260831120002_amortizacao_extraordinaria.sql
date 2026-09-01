-- Amortização extraordinária (§4.7).
--
-- Só dava para pagar a próxima parcela. Quem recebe um dinheiro e abate as
-- ÚLTIMAS não tinha como registrar — e é justamente a operação que mais muda o
-- resultado de um financiamento longo, porque juros correm sobre tempo.
--
-- Ela quebra a premissa do saldo devedor atual: "o contrato mais quantas
-- parcelas foram pagas" deixa de descrever a dívida no instante em que se paga
-- um extra. Por isso é registrada como EVENTO, e a tabela passa a ser
-- calculada em segmentos — até a amortização vale o contrato, dali em diante
-- vale um contrato novo com o saldo que sobrou. O saldo continua calculado,
-- nunca guardado (§13.2).
--
-- `parcelas_reduzidas` vem do BANCO, não de uma conta nossa: cada instituição
-- arredonda de um jeito, e recalcular por fora daria um cronograma que não bate
-- com o extrato — que é o que este app não pode fazer.

create table amortizacoes_divida (
  id                  uuid primary key default gen_random_uuid(),
  divida_id           uuid not null references dividas(id) on delete cascade,
  usuario_id          uuid not null default auth.uid() references auth.users(id),
  valor               numeric(14,2) not null check (valor > 0),
  data                date not null,
  -- Depois de qual parcela ela entrou. Define onde o contrato é refeito.
  apos_parcela        int not null check (apos_parcela >= 0),
  modo                text not null check (modo in ('prazo', 'parcela')),
  -- Quantas parcelas sumiram, no modo prazo. Zero no modo parcela.
  parcelas_reduzidas  int not null default 0 check (parcelas_reduzidas >= 0),
  transacao_id        uuid references transacoes(id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table amortizacoes_divida is
  'Pagamentos extras, fora da parcela. A tabela de amortização é recalculada a '
  'partir de cada um (§4.7).';
comment on column amortizacoes_divida.modo is
  'prazo: a parcela fica e o financiamento acaba antes — economiza mais juros. '
  'parcela: o prazo fica e a parcela cai.';

alter table amortizacoes_divida enable row level security;

create policy "cada um ve o que e seu" on amortizacoes_divida
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create index amortizacoes_divida_por_divida
  on amortizacoes_divida (divida_id, apos_parcela);
