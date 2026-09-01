-- Rotativo do cartão (§2.1, §4.7).
--
-- Não pagar a fatura inteira não é uma fatura menor: é um empréstimo, e o mais
-- caro do varejo brasileiro. Até aqui o app tratava o resto como "fatura em
-- aberto" sem juros — dizia que a dívida era o valor que sobrou, quando no mês
-- seguinte ela chega maior. Errava para MENOS, que é o pior lado: fazia o
-- rotativo parecer uma forma barata de adiar.
--
-- Rolar é UM evento com três linhas, e elas precisam poder ser desfeitas
-- juntas: a que quita a fatura de origem, o principal que reaparece na fatura
-- seguinte e os juros. Sem a marca abaixo, desfazer apagaria uma e deixaria as
-- outras — que é como um saldo devedor vira ficção.
--
-- O principal que rola NÃO é despesa nova: já foi contado quando a compra
-- aconteceu (§4.7). Só os juros são custo novo, e é por isso que só eles vão
-- como `despesa`.

alter table transacoes
  add column rotativo_de_fatura_id uuid references faturas(id) on delete set null;

comment on column transacoes.rotativo_de_fatura_id is
  'A fatura que rolou para cá. Marca as linhas que nasceram de um rotativo, '
  'para que desfazer apague o evento inteiro (§2.1).';

create index transacoes_por_rotativo
  on transacoes (rotativo_de_fatura_id)
  where rotativo_de_fatura_id is not null;
