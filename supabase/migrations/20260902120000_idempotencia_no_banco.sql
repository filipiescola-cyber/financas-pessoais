-- A idempotência do §13.3 passa a ser garantida pelo BANCO.
--
-- O §13.3 manda: "toda rotina disparada na abertura tem que ser idempotente e
-- retroativa. Se o usuário ficar 10 dias sem abrir, ao voltar tudo se acerta
-- sem duplicar nada." O app cumpria isso lendo o que já existe e só inserindo o
-- que falta — e essa leitura NÃO é atômica.
--
-- Entre o "já existe?" e o "então insere" cabe outra execução inteira. Duas
-- abas abertas ao mesmo tempo, o celular e o computador na mesma manhã, ou um
-- clique em "lançar agora" enquanto a rotina de abertura ainda corre: as duas
-- leem que não existe nada, as duas inserem, e o mês fica com a cobrança
-- duplicada. É intermitente por natureza — depende de dois relógios se
-- cruzarem —, que é exatamente como o defeito foi relatado.
--
-- A mesma lição do §3 vale aqui: "o default existe para o código da aplicação
-- não precisar passar o dono em lugar nenhum: esquecer de filtrar deixa de ser
-- possível, porque quem filtra é o banco." Quem garante que não duplica também
-- devia ser o banco.
--
-- Não é substituto da checagem no código, é a rede embaixo dela: a checagem
-- continua evitando a ida ao banco no caso comum, e o índice fecha a janela.

-- ---------------------------------------------------------------------------
-- 1. Onde vai parar o que esta migration remover.
--
-- "Arquivar, nunca excluir" (§4.8). A limpeza abaixo é necessária — sem ela o
-- índice não nasce —, mas apagar linha de transação num banco com dado real é
-- a operação que o §13.6 manda fazer só depois de exportar. Guardando a linha
-- inteira em jsonb, a migration deixa de ser destrutiva: dá para olhar o que
-- saiu, e dá para trazer de volta.
--
-- O caso que justifica isto: se o usuário editou uma das duplicatas — corrigiu
-- o valor da cobrança, por exemplo — e a regra abaixo escolheu a outra, a
-- edição dele estaria perdida. Aqui não está.
-- ---------------------------------------------------------------------------

create table if not exists transacoes_removidas_por_duplicidade (
  id            uuid primary key,
  usuario_id    uuid not null default auth.uid(),
  removida_em   timestamptz not null default now(),
  motivo        text not null,
  -- A linha inteira, como estava. Um `insert into transacoes select ...` a
  -- partir daqui devolve o lançamento sem perder nenhum campo.
  linha         jsonb not null
);

alter table transacoes_removidas_por_duplicidade enable row level security;

drop policy if exists dono_das_removidas on transacoes_removidas_por_duplicidade;
create policy dono_das_removidas on transacoes_removidas_por_duplicidade
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

comment on table transacoes_removidas_por_duplicidade is
  'O que a migration da idempotência removeu, linha inteira em jsonb (§4.8). '
  'Existe para a limpeza não ser irreversível.';

-- ---------------------------------------------------------------------------
-- 2. As duplicatas que já existem.
--
-- Precisam sair antes, senão o índice não nasce. Fica a mais ANTIGA de cada
-- par: é a que a primeira execução criou, a que já apareceu nos relatórios e a
-- que qualquer outra tabela porventura referencia. As demais são o rastro da
-- corrida — linhas idênticas que ninguém pediu.
-- ---------------------------------------------------------------------------

create temporary table sobrando_recorrencia on commit drop as
  select id
  from (
    select
      id,
      row_number() over (
        partition by recorrencia_id, data_competencia
        order by created_at, id
      ) as posicao
    from transacoes
    where recorrencia_id is not null
  ) ordenadas
  where posicao > 1;

insert into transacoes_removidas_por_duplicidade (id, usuario_id, motivo, linha)
select t.id, t.usuario_id, 'ocorrencia de recorrencia duplicada', to_jsonb(t)
from transacoes t
join sobrando_recorrencia s on s.id = t.id
on conflict (id) do nothing;

delete from transacoes where id in (select id from sobrando_recorrencia);

-- Parcela de dívida grava DUAS linhas (§4.7): a transferência da amortização e
-- a despesa dos juros. O par que identifica a ocorrência inclui o tipo — sem
-- ele, a rede pegaria a segunda linha legítima como se fosse duplicata.
create temporary table sobrando_divida on commit drop as
  select id
  from (
    select
      id,
      row_number() over (
        partition by divida_id, divida_parcela, tipo
        order by created_at, id
      ) as posicao
    from transacoes
    where divida_id is not null and divida_parcela is not null
  ) ordenadas
  where posicao > 1;

insert into transacoes_removidas_por_duplicidade (id, usuario_id, motivo, linha)
select t.id, t.usuario_id, 'parcela de divida duplicada', to_jsonb(t)
from transacoes t
join sobrando_divida s on s.id = t.id
on conflict (id) do nothing;

delete from transacoes where id in (select id from sobrando_divida);

-- ---------------------------------------------------------------------------
-- 3. Os índices.
--
-- Parciais porque a esmagadora maioria das transações é avulsa: `recorrencia_id`
-- e `divida_parcela` são nulos nelas, e nulo não colide com nulo no Postgres —
-- mas o índice parcial também não carrega essas linhas, o que o mantém pequeno.
--
-- Não precisam de `usuario_id`: recorrência e dívida já pertencem a uma pessoa
-- só, então dois usuários nunca disputam a mesma chave.
-- ---------------------------------------------------------------------------

create unique index if not exists transacoes_ocorrencia_de_recorrencia
  on transacoes (recorrencia_id, data_competencia)
  where recorrencia_id is not null;

comment on index transacoes_ocorrencia_de_recorrencia is
  'Idempotência do §13.3: uma ocorrência por recorrência por competência. '
  'A checagem no código continua valendo; este índice fecha a janela entre '
  'ler e inserir, que é por onde a cobrança duplicada entrava.';

create unique index if not exists transacoes_parcela_de_divida
  on transacoes (divida_id, divida_parcela, tipo)
  where divida_id is not null and divida_parcela is not null;

comment on index transacoes_parcela_de_divida is
  'Idempotência do §13.3 para a dívida (§4.7). O tipo entra na chave porque '
  'cada parcela grava duas linhas: amortização (transferência) e juros '
  '(despesa).';
