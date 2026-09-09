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
-- 1. As duplicatas que já existem.
--
-- Precisam sair antes, senão o índice não nasce. Fica a mais ANTIGA de cada
-- par: é a que a primeira execução criou, a que já apareceu nos relatórios e a
-- que qualquer outra tabela porventura referencia. As demais são o rastro da
-- corrida — linhas idênticas que ninguém pediu.
-- ---------------------------------------------------------------------------

with ordenadas as (
  select
    id,
    row_number() over (
      partition by recorrencia_id, data_competencia
      order by created_at, id
    ) as posicao
  from transacoes
  where recorrencia_id is not null
)
delete from transacoes
where id in (select id from ordenadas where posicao > 1);

-- Parcela de dívida grava DUAS linhas (§4.7): a transferência da amortização e
-- a despesa dos juros. O par que identifica a ocorrência inclui o tipo — sem
-- ele, a rede pegaria a segunda linha legítima como se fosse duplicata.
with ordenadas as (
  select
    id,
    row_number() over (
      partition by divida_id, divida_parcela, tipo
      order by created_at, id
    ) as posicao
  from transacoes
  where divida_id is not null and divida_parcela is not null
)
delete from transacoes
where id in (select id from ordenadas where posicao > 1);

-- ---------------------------------------------------------------------------
-- 2. Os índices.
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
