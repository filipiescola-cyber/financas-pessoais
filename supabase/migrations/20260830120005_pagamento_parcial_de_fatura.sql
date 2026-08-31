-- Pagamento parcial e adiantado de fatura (§2.1).
--
-- `pagarFatura` gravava `status = 'paga'` qualquer que fosse o valor, e
-- `dividasDosCartoes` ignora fatura paga. Pagar R$ 200 de uma fatura de R$ 500
-- fazia os outros R$ 300 sumirem de "o que você deve" — sem erro, sem aviso.
--
-- A raiz é a de sempre: `status` guardava uma resposta que o app já sabe
-- calcular. O que se deve numa fatura é a soma das compras menos a soma dos
-- pagamentos (§13.2), e `paga` deixa de ser algo que se grava por decisão e
-- passa a ser o que sobra quando não falta mais nada.
--
-- Faltava só o vínculo: o pagamento não sabia qual fatura estava quitando.
-- `transacao_pagamento_id` na fatura só cabe UM, e pagamento parcial são
-- vários. A ponta certa é a de muitos: a transação aponta para a fatura.
--
-- `fatura_id` continua significando "esta COMPRA pertence a esta fatura". Não
-- dá para reaproveitá-la: o pagamento entraria na própria fatura que quita e
-- reduziria o total que ele está pagando.

alter table transacoes
  add column fatura_paga_id uuid references faturas(id) on delete set null;

comment on column transacoes.fatura_paga_id is
  'A fatura que este lançamento QUITA. Diferente de fatura_id, que diz a qual '
  'fatura uma compra pertence (§2.1).';

create index transacoes_fatura_paga on transacoes (fatura_paga_id)
  where fatura_paga_id is not null;

-- Os pagamentos que já existem: a fatura sabe quem a pagou, mas o pagamento não
-- sabia a fatura. O vínculo é determinístico e só preenche o que está nulo.
update transacoes t
set fatura_paga_id = f.id
from faturas f
where f.transacao_pagamento_id = t.id
  and t.fatura_paga_id is null;
