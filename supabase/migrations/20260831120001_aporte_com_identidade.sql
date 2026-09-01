-- Cada aporte com identidade própria, e a aplicação sabendo onde mora (§7).
--
-- Três defeitos que só aparecem com mais de uma conta de investimento e mais de
-- um aporte na mesma aplicação:
--
-- 1. A transferência do aporte ia SEMPRE para a primeira conta do tipo
--    `investimento` criada. Quem tem C6 Invest e E Trade via todo aporte cair
--    no C6, independente de onde o dinheiro realmente foi. A aplicação não
--    sabia onde morava, então o código escolhia por ela — e escolhia errado.
--
-- 2. Aporte novo herdava o percentual da aplicação. Aplicar em outubro num RDB
--    a 105% quando o primeiro aporte foi a 120% dava um rendimento inventado:
--    o app rendia os R$ 100 novos à taxa velha. Não é o caso comum, mas o
--    número errado não avisa que é raro.
--
-- 3. Não havia como ver os aportes. O saldo era um número só, e conferir com o
--    extrato do banco exigia lembrar de cabeça o que tinha entrado quando.
--
-- As duas colunas de override são NULAS por padrão: sem elas, o aporte segue o
-- papel da aplicação, que continua sendo o caso normal.

alter table investimentos
  add column conta_id uuid references contas(id) on delete set null;

comment on column investimentos.conta_id is
  'A conta de investimento onde a aplicação mora. Destino das transferências de '
  'aporte — antes era sempre a primeira conta do tipo criada.';

alter table movimentacoes_investimento
  add column percentual_indexador numeric(10,4),
  add column vencimento date;

comment on column movimentacoes_investimento.percentual_indexador is
  'Percentual do indexador DESTE aporte, quando difere do da aplicação. Nulo '
  'segue o papel — que é o caso normal.';
comment on column movimentacoes_investimento.vencimento is
  'Vencimento deste aporte, quando difere do da aplicação.';
