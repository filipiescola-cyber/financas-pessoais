-- Índices para as consultas que apareceram depois das Fases 3 a 9.
--
-- Todos são CREATE INDEX: nada é apagado, nada é alterado. Rodar isto em banco
-- com dado real é seguro, mas a regra do §13.6 continua valendo — exportar
-- antes de qualquer migration.
--
-- Por que cada um existe:

-- Geração de recorrências (§5.2) e o alerta de recorrência que não aconteceu
-- (§8.6) filtram por recorrencia_id. Sem índice, cada abertura do app varre a
-- tabela inteira de transações.
create index if not exists transacoes_recorrencia
  on transacoes (recorrencia_id)
  where recorrencia_id is not null;

-- A projeção (§8.2) pergunta "o que já está lançado para o futuro" filtrando só
-- por data_caixa. O índice existente é (conta_id, data_caixa) e não serve para
-- uma consulta que não menciona a conta.
create index if not exists transacoes_caixa
  on transacoes (data_caixa);

-- A conciliação da importação (§6.4) busca lançamentos manuais ainda sem fitid
-- dentro de uma janela de datas. O índice parcial cobre exatamente esse caso e
-- fica pequeno, porque o que já veio de extrato não entra nele.
create index if not exists transacoes_sem_fitid
  on transacoes (conta_id, data_caixa)
  where fitid is null;

-- O backfill de fatura (§2.1) procura transações de cartão sem fatura vinculada.
create index if not exists transacoes_sem_fatura
  on transacoes (conta_id)
  where fatura_id is null;

-- O fechamento de fatura na abertura do app filtra por status e data.
create index if not exists faturas_abertas
  on faturas (status, data_fechamento);

-- O relatório e o orçamento agrupam por categoria dentro de um mês.
create index if not exists transacoes_categoria_competencia
  on transacoes (categoria_id, data_competencia)
  where categoria_id is not null;
