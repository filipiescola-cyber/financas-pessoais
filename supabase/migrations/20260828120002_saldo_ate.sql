-- Saldo acumulado até uma data (§13.2).
--
-- Existe para a linha de saldo diário na lista de lançamentos. Sem ela, a tela
-- precisaria baixar todas as transações desde o começo do histórico só para
-- descobrir de quanto o mês parte — uma consulta que cresce para sempre.
--
-- `security invoker` (o padrão) é proposital: a função roda com as permissões
-- de quem chama, então a RLS continua valendo. Uma função `security definer`
-- aqui furaria a política sem deixar rastro.

create or replace function saldo_ate(p_data date, p_conta uuid default null)
returns numeric
language sql
stable
as $$
  with elegiveis as (
    select id, saldo_inicial
    from contas
    where ativo
      and (
        -- Uma conta específica, ou o consolidado.
        p_conta is not null and id = p_conta
        or
        -- Mesma regra do §2.6: Empresa é recebível, dívida é saldo devedor e
        -- cartão é fatura — nenhum dos três é dinheiro disponível.
        p_conta is null and tipo not in ('empresa', 'divida', 'cartao_credito')
      )
  )
  select
    coalesce((select sum(saldo_inicial) from elegiveis), 0)
    + coalesce((
        select sum(t.valor)
        from transacoes t
        join elegiveis e on e.id = t.conta_id
        where t.data_caixa <= p_data
          -- Filha de divisão não soma: o pai já moveu o saldo (§5.5).
          and t.transacao_pai_id is null
      ), 0);
$$;

comment on function saldo_ate(date, uuid) is
  'Saldo acumulado até a data, por data_caixa. Sem conta informada, devolve o '
  'consolidado com as mesmas exclusões do §2.6.';
