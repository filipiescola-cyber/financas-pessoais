-- Prazo e dia útil nas recorrências (§5.2).
--
-- Dois buracos do cadastro de recorrência:
--
--   1. Não havia como dizer que ela acaba. Financiamento de 36x, curso de 12x e
--      consórcio ficavam pesando na projeção para sempre, e cabia ao usuário
--      lembrar de arquivar a recorrência no mês exato da última parcela.
--
--   2. Só existia "todo dia N". Salário e boleto de empresa quase sempre caem
--      no N-ésimo DIA ÚTIL, que muda de data todo mês. Quem recebe no 5º dia
--      útil cadastrava "dia 7" e via a previsão errar sempre que o 7 caísse num
--      fim de semana ou num feriado.
--
-- `termina_em` guarda a DATA da última ocorrência, nunca a contagem de
-- parcelas: "36x" e "até dez/2028" são o mesmo fato dito de dois jeitos, e
-- guardar os dois deixaria um deles ficar para trás. A contagem se recalcula a
-- partir da data quando a tela quiser mostrá-la assim.

alter table recorrencias
  add column regra_do_dia text not null default 'fixo'
    check (regra_do_dia in ('fixo', 'dia_util', 'dia_util_do_fim')),
  add column termina_em date;

-- Com regra de dia útil o `dia` deixa de ser data e passa a ser ORDINAL: "o 5º",
-- não "o dia 5". Um mês tem no máximo 23 dias úteis, então ordinal acima disso
-- é erro de digitação, não intenção.
alter table recorrencias
  add constraint recorrencias_ordinal_util
  check (regra_do_dia = 'fixo' or dia between 1 and 23);

comment on column recorrencias.regra_do_dia is
  'fixo: `dia` é a data do mês. dia_util / dia_util_do_fim: `dia` é ordinal, contado do começo ou do fim.';
comment on column recorrencias.termina_em is
  'Data da última ocorrência. Nulo quando a recorrência não tem prazo.';
