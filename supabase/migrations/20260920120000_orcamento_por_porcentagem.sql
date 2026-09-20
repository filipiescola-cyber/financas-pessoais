-- Teto do orçamento como porcentagem da renda fixa (§8.6).
--
-- Teto em reais envelhece: a renda muda e os trinta tetos continuam nos valores
-- de quando foram digitados, cada um errado por uma fração diferente. Em
-- porcentagem, o teto vira uma decisão — "Lazer vale 10% do que entra" — e o
-- valor em reais é consequência, recalculado na leitura como todo número
-- derivado do app (§13.2).
--
-- A linha guarda UM dos dois, nunca os dois. É o `check` abaixo que garante
-- isso, e não a boa vontade do código: guardar a porcentagem E o valor na mesma
-- linha é exatamente o defeito que este app já pagou caro várias vezes — os
-- dois existem, um deles envelhece, e nada avisa qual.

-- Teto zerado nunca deveria ter sido gravado (o app apaga a linha), mas o
-- `check` abaixo não passa por cima de um sobrevivente. Zero é ausência de
-- teto: apagar é o que ele sempre quis dizer.
delete from orcamentos where valor_planejado <= 0;

alter table orcamentos
  add column percentual_da_renda numeric(6,3);

comment on column orcamentos.percentual_da_renda is
  'Quando preenchida, o teto é esta porcentagem da renda fixa do mês e valor_planejado fica zerado (§8.6).';

alter table orcamentos
  add constraint orcamento_com_um_teto_so check (
    (percentual_da_renda is null and valor_planejado > 0)
    or (
      percentual_da_renda > 0
      and percentual_da_renda <= 100
      and valor_planejado = 0
    )
  );
