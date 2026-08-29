-- O lançamento do aporte não pode sumir sozinho (§7.4).
--
-- `movimentacoes_investimento.transacao_id` era `on delete set null`. Apagar o
-- lançamento do aporte pela lista devolvia o dinheiro para a conta e deixava a
-- aplicação de pé — o mesmo valor passava a existir nos dois lugares ao mesmo
-- tempo, e nada na tela dizia isso.
--
-- É a mesma família do defeito da fatura paga sem pagamento, e a resposta aqui
-- é outra: em vez de consertar depois, o banco recusa antes. A fatura precisava
-- reabrir porque "não paga" é um estado válido; aplicação sem o aporte que a
-- financiou não é estado nenhum. O caminho para desfazer é Resgatar, que
-- devolve o dinheiro e encerra a aplicação junto.
--
-- O "recomeçar do zero" continua funcionando: ele já apaga as movimentações
-- antes das transações, justamente por causa desta dependência.

alter table movimentacoes_investimento
  drop constraint if exists movimentacoes_investimento_transacao_id_fkey;

alter table movimentacoes_investimento
  add constraint movimentacoes_investimento_transacao_id_fkey
  foreign key (transacao_id) references transacoes(id) on delete restrict;
