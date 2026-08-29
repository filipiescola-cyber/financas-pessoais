-- Subconta: organização da lista, não do dinheiro (§4).
--
-- Caixinha do Nubank, cofrinho do Mercado Pago, reserva do Inter. São contas de
-- verdade, com saldo próprio, mas moram dentro de outra — e listadas lado a
-- lado com as principais elas viram sete linhas sem hierarquia nenhuma.
--
-- O QUE ISTO **NÃO** MUDA: o saldo. Cada conta continua com o seu, e o
-- consolidado continua somando todas (§13.2). Dinheiro na caixinha é dinheiro
-- separado do da conta corrente — se o pai passasse a "conter" o saldo do
-- filho, ou a soma dobraria, ou o saldo da conta corrente mentiria. Isto aqui
-- é hierarquia de exibição, e só.

alter table contas
  add column conta_pai_id uuid references contas(id) on delete restrict;

create index contas_conta_pai_id_idx on contas (conta_pai_id)
  where conta_pai_id is not null;

comment on column contas.conta_pai_id is
  'Conta principal desta subconta (§4). Só afeta como a lista é exibida: o '
  'saldo de cada conta continua sendo o dela, e o consolidado soma as duas.';

-- Um nível só, e o banco é quem garante.
--
-- Sem isto, uma subconta de subconta some da tela: a lista desenha pai e filho,
-- e o neto não tem onde aparecer. Erro que não dá erro — a conta existe, o
-- saldo entra na soma, e ninguém a vê.
create or replace function subconta_de_um_nivel_so()
returns trigger
language plpgsql
as $$
begin
  if new.conta_pai_id is null then
    return new;
  end if;

  if new.conta_pai_id = new.id then
    raise exception 'Uma conta não pode ser subconta dela mesma.';
  end if;

  if exists (select 1 from contas where id = new.conta_pai_id and conta_pai_id is not null) then
    raise exception 'A conta principal escolhida já é uma subconta. A lista mostra um nível só.';
  end if;

  if exists (select 1 from contas where conta_pai_id = new.id) then
    raise exception 'Esta conta já tem subcontas, então não pode virar subconta de outra.';
  end if;

  return new;
end;
$$;

drop trigger if exists contas_um_nivel on contas;

create trigger contas_um_nivel
before insert or update of conta_pai_id on contas
for each row
execute function subconta_de_um_nivel_so();
