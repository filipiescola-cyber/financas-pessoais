-- O lançamento da parcela sabe de que dívida veio (§4.7).
--
-- "Paguei mais uma" grava duas linhas e anda o contador. "Desfazer" voltava só
-- o contador: as duas linhas ficavam para trás, e o mesmo dinheiro passava a
-- existir como saldo devedor E como lançamento na conta.
--
-- É a mesma família de defeito que já apareceu na fatura paga sem pagamento e
-- no aporte que sumia sozinho — o fato em dois lugares, com um deles ficando
-- para trás. A resposta é a mesma: dar ao lançamento a ponta que faltava.

alter table transacoes
  add column divida_id uuid references dividas(id) on delete set null,
  add column divida_parcela int;

comment on column transacoes.divida_id is
  'A dívida cuja parcela este lançamento paga. Amortização e juros da mesma parcela compartilham divida_id e divida_parcela.';

create index transacoes_divida on transacoes (divida_id, divida_parcela)
  where divida_id is not null;
