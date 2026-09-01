-- Investimento por cotação: ação, cripto, qualquer coisa com preço e quantidade
-- (§7.1, §7.4).
--
-- O app só sabia guardar VALOR. Para renda variável isso virava um número
-- digitado à mão que não dizia de onde veio: não dava para saber quantas ações
-- são, por quanto foram recebidas, nem quanto do valor é ganho.
--
-- O caso que motivou: ação recebida da empresa, cotada em dólar. Duas coisas
-- que o app não sabia fazer, e uma delas não era a que parecia.
--
-- A moeda NÃO é multi-moeda (§8.9 continua valendo). O razão segue inteiro em
-- reais — nenhuma transação em dólar, em lugar nenhum. O dólar vive só na
-- cotação de um ativo: quantidade × preço × câmbio = valor em reais. É
-- conversão de unidade, não uma segunda moeda, e por isso não vaza.
--
-- A que importava mais: RECEBER ação da empresa não é aplicar. Registrado como
-- aporte, o app tiraria de uma conta corrente um dinheiro que ela nunca teve, e
-- o saldo cairia alguns milhares de reais que não existiram. Também não é
-- receita no recebimento: não dá para gastar o que ainda não foi vendido, e
-- contar como renda inflaria "quanto posso gastar" (§8.3, §2.7). Vira dinheiro
-- na VENDA, que é a mesma regra do §7.4 para rendimento.
--
-- Nada de quantidade ou custo é guardado como total (§13.2): os dois saem da
-- soma dos movimentos. Só a última cotação conhecida fica, porque ela é um fato
-- informado, não um cálculo — e vem com a data, para a tela poder dizer o
-- quanto ela está velha (§7.3, §9.6).

alter table investimentos
  add column por_cotacao     boolean not null default false,
  add column moeda           text not null default 'BRL' check (moeda in ('BRL', 'USD')),
  add column preco_unitario  numeric(18,6),
  add column cotacao_moeda   numeric(18,6),
  add column data_cotacao    date;

comment on column investimentos.por_cotacao is
  'O valor vem de quantidade × preço × câmbio, não de um saldo digitado (§7.1).';
comment on column investimentos.preco_unitario is
  'Último preço por unidade conhecido, na moeda do ativo. Informado, não calculado.';
comment on column investimentos.cotacao_moeda is
  'Quantos reais vale uma unidade da moeda. Sempre 1 quando a moeda é BRL.';

alter table movimentacoes_investimento
  drop constraint movimentacoes_investimento_tipo_check;

alter table movimentacoes_investimento
  add constraint movimentacoes_investimento_tipo_check
  check (tipo in ('aporte', 'resgate', 'recebimento'));

alter table movimentacoes_investimento
  add column quantidade      numeric(18,8),
  add column preco_unitario  numeric(18,6),
  add column cotacao_moeda   numeric(18,6);

comment on column movimentacoes_investimento.quantidade is
  'Quantas unidades entraram ou saíram. Nulo em investimento que não tem '
  'unidade, onde só o valor importa.';
comment on column movimentacoes_investimento.preco_unitario is
  'O preço do DIA do movimento. É o custo de aquisição, e sem ele não dá para '
  'dizer quanto do valor é ganho.';
