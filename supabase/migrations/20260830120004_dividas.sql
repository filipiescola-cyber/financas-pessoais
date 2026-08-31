-- Financiamentos e empréstimos (§4.7).
--
-- Guarda os PARÂMETROS do contrato, nunca o saldo devedor. O saldo é a tabela
-- de amortização mais quantas parcelas já foram pagas — calculado, como todo
-- saldo neste app (§13.2). Armazená-lo criaria a armadilha de sempre: o mesmo
-- fato em dois lugares, com um deles ficando para trás na primeira vez que
-- alguém corrigisse o número de parcelas pagas.
--
-- Isto é um desvio consciente do §4.7, que mandava modelar como conta do tipo
-- `divida` com saldo que diminui a cada transferência. A disciplina de saldo
-- calculado provou-se mais forte no resto do app, e aqui ela cabe perfeita: o
-- saldo devedor é função exata de (valor, taxa, prazo, sistema, pagas).
--
-- O sistema importa e não é detalhe: num financiamento imobiliário de 30 anos,
-- tratar a parcela inteira como abatimento erra o saldo devedor em centenas de
-- milhares de reais — e erra para menos, dizendo que você está quase quitando
-- quando ainda falta metade.

create table dividas (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null default auth.uid() references auth.users(id),
  nome             text not null,
  instituicao      text,
  cor              text,
  -- O valor FINANCIADO, não o valor do bem: entrada não entra aqui.
  valor_financiado numeric(14,2) not null check (valor_financiado > 0),
  -- Taxa de juros MENSAL, em decimal: 0.0075 = 0,75% a.m.
  taxa_mensal      numeric(12,8) not null default 0 check (taxa_mensal >= 0),
  parcelas         int not null check (parcelas between 1 and 600),
  -- price: parcela fixa (crédito pessoal, carro). sac: parcela decrescente,
  -- padrão do financiamento imobiliário.
  sistema          text not null default 'price' check (sistema in ('price', 'sac')),
  primeira_parcela date not null,
  -- Quantas já foram pagas quando a dívida entrou no app, e vai subindo.
  parcelas_pagas   int not null default 0 check (parcelas_pagas >= 0),
  -- A recorrência que lança a parcela todo mês, quando existe.
  recorrencia_id   uuid references recorrencias(id) on delete set null,
  ativo            boolean not null default true,
  quitada_em       date,
  created_at       timestamptz not null default now(),

  check (parcelas_pagas <= parcelas)
);

comment on column dividas.taxa_mensal is
  'Mensal e em decimal. 12% ao ano NÃO é 1% ao mês: a conversão é (1+a)^(1/12)-1.';
comment on column dividas.parcelas_pagas is
  'Fonte do saldo devedor junto com a tabela de amortização. O saldo em si nunca é gravado (§13.2).';

alter table dividas enable row level security;

create policy "cada um vê o que é seu" on dividas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
