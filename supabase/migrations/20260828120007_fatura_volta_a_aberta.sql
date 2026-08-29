-- Apagar o pagamento reabre a fatura (§2.1).
--
-- O ponto que estava solto: `faturas.transacao_pagamento_id` é
-- `on delete set null`, então apagar o lançamento do pagamento soltava a
-- referência — e deixava a fatura marcada como `paga`, com pagamento nenhum.
--
-- O estado resultante mente para as duas direções. A tela de faturas mostra
-- "Paga" e oferece um "desfazer pagamento" que não acha o que desfazer; a
-- lista de lançamentos tira a fatura do saldo previsto por achá-la quitada, e
-- o saldo fica alto demais.
--
-- Vale como gatilho e não como código de tela porque a exclusão vem de vários
-- lugares — excluir um lançamento, excluir um parcelamento, o "recomeçar do
-- zero" — e a regra não pode depender de cada um deles lembrar dela.

create or replace function reabrir_fatura_ao_apagar_pagamento()
returns trigger
language plpgsql
as $$
begin
  update faturas
     set transacao_pagamento_id = null,
         -- Volta ao estado que a data manda, não sempre para 'aberta': fatura
         -- de três meses atrás reabriria como se ainda aceitasse compra.
         status = case
                    when data_fechamento <= (now() at time zone 'America/Sao_Paulo')::date
                    then 'fechada'
                    else 'aberta'
                  end
   where transacao_pagamento_id = old.id;

  return old;
end;
$$;

comment on function reabrir_fatura_ao_apagar_pagamento() is
  'Devolve a fatura ao estado não paga quando o lançamento do pagamento é '
  'apagado. Sem isto ela fica "paga" sem pagamento (§2.1).';

drop trigger if exists fatura_volta_a_aberta on transacoes;

create trigger fatura_volta_a_aberta
before delete on transacoes
for each row
execute function reabrir_fatura_ao_apagar_pagamento();
