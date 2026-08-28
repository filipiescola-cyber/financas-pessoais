-- Encerramento de conta (§4.8).
--
-- Conta com histórico nunca é apagada: apagar quebraria os relatórios dos
-- meses fechados, que é justamente o que o app existe para preservar. O que
-- faltava era o outro lado — dizer que a conta ACABOU, e quando.
--
-- "Arquivada" e "encerrada" não são a mesma coisa e a diferença importa na
-- leitura do histórico: arquivada é uma conta que você tirou da frente e pode
-- trazer de volta; encerrada é uma conta que não existe mais no mundo real,
-- com data. Sem a data, um saldo antigo fica sem explicação — parece dinheiro
-- que sumiu, quando na verdade foi transferido no dia em que a conta fechou.

alter table contas
  add column encerrada_em date;

-- Conta encerrada está necessariamente fora de circulação. O contrário não
-- vale: arquivar sem encerrar continua permitido, é só tirar da frente.
alter table contas
  add constraint contas_encerrada_esta_inativa
  check (encerrada_em is null or ativo = false);

comment on column contas.encerrada_em is
  'Data em que a conta deixou de existir no mundo real (§4.8). Null em conta '
  'apenas arquivada. Nunca apaga histórico: os lançamentos continuam todos lá.';
