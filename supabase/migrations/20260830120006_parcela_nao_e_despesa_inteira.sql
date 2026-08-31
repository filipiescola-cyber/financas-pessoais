-- A parcela de uma dívida não é despesa inteira (§2.1, §4.7, §14).
--
-- A dívida criava uma recorrência que lançava a parcela como DESPESA. Parte
-- dela não é: a amortização repaga um gasto que já foi contado quando a compra
-- aconteceu. Contar de novo dobra o mês — é o mesmo defeito que o §14 proíbe
-- para pagamento de fatura, aparecendo por outra porta.
--
-- Só os JUROS são custo novo. E a divisão entre juros e amortização muda a cada
-- parcela: no Price a amortização cresce mês a mês. Uma recorrência de valor
-- fixo não tem como expressar isso — ela é a ferramenta errada para a parcela
-- de um financiamento, e nenhuma correção de valor a conserta.
--
-- Quem sabe a divisão é a tabela de amortização. Então quem lança a parcela
-- passa a ser a ação "paguei mais uma", que grava DUAS linhas: transferência
-- da amortização (sai da conta, não é despesa) e despesa dos juros (custo novo,
-- categorizável). A dívida guarda de onde a parcela sai.

alter table dividas
  add column conta_id uuid references contas(id) on delete set null,
  add column categoria_juros_id uuid references categorias(id) on delete set null;

-- Herda a conta da recorrência que existia, para as dívidas já cadastradas.
update dividas d
set conta_id = r.conta_id
from recorrencias r
where d.recorrencia_id = r.id and d.conta_id is null;

-- As recorrências criadas por dívida param de gerar: quem lança agora é a
-- própria dívida. Arquivar, nunca excluir (§4.8) — o que já foi gerado fica.
update recorrencias set ativo = false
where id in (select recorrencia_id from dividas where recorrencia_id is not null);

alter table dividas drop column recorrencia_id;

comment on column dividas.conta_id is
  'De onde a parcela sai. Sendo um cartão, ela cai nas próximas faturas.';
comment on column dividas.categoria_juros_id is
  'Categoria da parte de JUROS da parcela. A amortização não tem categoria: não é despesa.';
