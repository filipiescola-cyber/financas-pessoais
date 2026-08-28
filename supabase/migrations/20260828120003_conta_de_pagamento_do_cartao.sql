-- De qual conta a fatura deste cartão costuma ser paga (§2.1).
--
-- Pagamento de fatura é transferência, e toda transferência precisa de uma
-- conta de origem. Sem este campo a tela de pagamento não tinha como saber
-- qual conta oferecer e marcava a primeira da lista — uma escolha arbitrária,
-- e com mais de uma conta corrente um erro fácil de cometer e chato de
-- desfazer, porque são dois lançamentos espelhados.
--
-- Opcional de propósito: quem paga cada mês de um lugar diferente continua
-- escolhendo na hora. O campo é um padrão, não uma regra — a conta de origem
-- de cada pagamento continua sendo a que ficou gravada na transferência.

alter table cartoes
  add column conta_pagamento_id uuid references contas(id) on delete set null;

-- Um cartão não paga a si mesmo. `is distinct from` porque comparação com
-- null em check devolveria null, e null não reprova a restrição.
alter table cartoes
  add constraint cartoes_conta_pagamento_nao_e_o_cartao
  check (conta_pagamento_id is distinct from conta_id);

create index cartoes_conta_pagamento_id_idx
  on cartoes (conta_pagamento_id)
  where conta_pagamento_id is not null;

comment on column cartoes.conta_pagamento_id is
  'Conta de onde a fatura costuma ser paga (§2.1). Padrão da tela de pagamento, '
  'nunca fonte de verdade: a origem real de cada pagamento é a da transferência.';
