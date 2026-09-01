-- Recorrência gradativa (§5.2).
--
-- Nem toda recorrência repete o mesmo número. A parcela de uma obra sobe todo
-- mês, uma dívida negociada desce, um aluguel com reajuste programado degrau a
-- degrau. Até aqui só havia dois estados: valor fixo, que mentia depois do
-- segundo mês, ou valor nulo ("varia"), que não projeta nada — e a projeção do
-- §8 é justamente o que essas contas mais atrapalham quando ficam de fora.
--
-- Um incremento fixo por mês não descreve o mundo inteiro, e não é para isso
-- que ele existe: ele cobre o caso em que a pessoa SABE o passo. Onde o passo
-- não é conhecido, `valor_previsto` nulo continua sendo a resposta honesta.
--
-- O valor continua CALCULADO, nunca guardado por ocorrência (§13.2): é função
-- de (base, incremento, quantos meses desde o início). Guardar a série inteira
-- criaria N cópias para divergirem na primeira correção da base.

alter table recorrencias
  add column incremento numeric(14,2) not null default 0;

comment on column recorrencias.incremento is
  'Quanto o valor muda a cada mês, a partir de `valor_previsto`. Negativo '
  'desce. Zero é a recorrência comum, de valor fixo (§5.2).';
