-- Saldo é calculado, nunca armazenado (§13.2).
-- A view existe desde a fundação para que nenhuma tela seja tentada a somar na mão.
--
-- Três decisões embutidas aqui, todas do §13.2 e do §5.5:
--   1. só entra o passado: data_caixa <= hoje. Parcela e recorrência futuras já
--      estão no banco e NÃO podem contar no saldo de hoje;
--   2. "hoje" é America/Sao_Paulo, não UTC — o servidor do Supabase roda em UTC
--      e current_date viraria o dia cedo demais (§13.1);
--   3. transação filha de divisão (§5.5) fica de fora: o saldo é afetado uma vez
--      só, pelo valor do pai. As filhas servem aos relatórios por categoria.

create view saldos_contas
with (security_invoker = on) as
select
  c.id   as conta_id,
  c.nome as conta_nome,
  c.tipo as conta_tipo,
  c.ativo,
  c.saldo_inicial
    + coalesce(sum(t.valor) filter (
        where t.data_caixa <= (now() at time zone 'America/Sao_Paulo')::date
      ), 0) as saldo_atual
from contas c
left join transacoes t
  on t.conta_id = c.id
 and t.transacao_pai_id is null
group by c.id, c.nome, c.tipo, c.ativo, c.saldo_inicial;

comment on view saldos_contas is
  'Saldo calculado por conta (§13.2). security_invoker = on para que a RLS das '
  'tabelas de origem continue valendo — sem isso a view rodaria como dona e '
  'furaria a política.';
