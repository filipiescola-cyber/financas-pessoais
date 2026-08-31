-- Investimento vira POSIÇÃO: vários aportes, vários resgates (§7.1).
--
-- O modelo antigo tratava um investimento como uma aplicação única — uma data,
-- um valor. Não é assim que se usa: quem guarda para o carro aporta de novo no
-- mês seguinte, e quem precisa de R$ 200 resgata R$ 200, não a posição inteira.
--
-- Duas consequências do modelo antigo, ambas visíveis no uso:
--
--   Aportar exigia criar um segundo investimento com o mesmo nome. A carteira
--   enchia de "RDB Carro" repetidos, e o agrupamento por instituição somava
--   linhas que são a mesma aplicação.
--
--   O resgate parcial já era aceito pela tela e pela tabela de movimentações,
--   mas o CÁLCULO ignorava a tabela inteira: ele lia `valor_aplicado`. O
--   dinheiro caía na conta e continuava valendo dentro do investimento. O mesmo
--   real em dois lugares — a família de bug que o §13.2 existe para evitar.
--
-- A correção é fazer das movimentações a fonte da verdade do principal. Toda
-- aplicação que ainda não tem aporte registrado ganha o seu, com a data e o
-- valor originais: é o mesmo fato, dito na tabela que passa a mandar.
--
-- `valor_aplicado` e `data_aplicacao` continuam na tabela como o registro da
-- PRIMEIRA aplicação — histórico, não saldo. Quem quiser o principal de hoje
-- soma os movimentos.

insert into movimentacoes_investimento (investimento_id, tipo, valor, data, usuario_id)
select i.id, 'aporte', i.valor_aplicado, i.data_aplicacao, i.usuario_id
from investimentos i
where not exists (
  select 1
  from movimentacoes_investimento m
  where m.investimento_id = i.id and m.tipo = 'aporte'
);

comment on table movimentacoes_investimento is
  'Fonte da verdade do principal aplicado (§7.1). Cada aporte rende a partir da '
  'sua própria data; resgate reduz as parcelas proporcionalmente.';

comment on column investimentos.valor_aplicado is
  'A PRIMEIRA aplicação, como registro histórico. O principal de hoje sai da '
  'soma dos movimentos, nunca daqui (§13.2).';

create index if not exists movimentacoes_investimento_por_aplicacao
  on movimentacoes_investimento (investimento_id, data);
