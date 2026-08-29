-- Conserta o que o defeito anterior deixou para trás.
--
-- Antes do gatilho `fatura_volta_a_aberta`, apagar o lançamento do pagamento
-- deixava a fatura marcada como `paga` com `transacao_pagamento_id` nulo. Essas
-- faturas continuam nesse estado até alguém arrumar — e ninguém arruma, porque
-- a tela mostra "Paga" e não oferece caminho.
--
-- Só toca no que é comprovadamente inconsistente: paga E sem pagamento. Fatura
-- paga de verdade tem a transação apontada e não entra aqui.

update faturas
   set status = case
                  when data_fechamento <= (now() at time zone 'America/Sao_Paulo')::date
                  then 'fechada'
                  else 'aberta'
                end
 where status = 'paga'
   and transacao_pagamento_id is null;
