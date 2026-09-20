-- A faixa de orçamento de cada categoria (§8.6).
--
-- Natureza (fixa/variável/eventual) responde "dá para prever?"; faixa responde
-- "para que serve?". São perguntas diferentes e cruzam: aluguel é fixo e
-- essencial, Netflix é fixa e estilo de vida. Sem a segunda, os três cenários
-- da tela de Orçamento são números soltos — dizem 50/30/20 sem conseguir dizer
-- em quanto VOCÊ está.
--
-- Só despesa recebe faixa. Receita não se divide em essencial e supérfluo.

alter table categorias
  add column faixa text check (faixa in ('essenciais', 'estilo_de_vida', 'futuro'));

comment on column categorias.faixa is
  'Faixa do orçamento: essenciais, estilo_de_vida ou futuro. Nula enquanto ninguém classificou (§8.6).';

-- Um palpite inicial pelos nomes do seed padrão, para a tela nascer útil em vez
-- de nascer vazia. É só um ponto de partida: um toque em Categorias muda
-- qualquer uma, e quem tem nome diferente fica sem faixa até decidir.
update categorias set faixa = 'essenciais'
where tipo = 'despesa'
  and faixa is null
  and nome in (
    'Moradia', 'Contas', 'Mercado', 'Alimentação', 'Transporte',
    'Saúde', 'Educação', 'Pets', 'Impostos e taxas'
  );

update categorias set faixa = 'estilo_de_vida'
where tipo = 'despesa'
  and faixa is null
  and nome in (
    'Lazer', 'Assinaturas', 'Vestuário', 'Presentes', 'Cuidados pessoais'
  );

update categorias set faixa = 'futuro'
where tipo = 'despesa'
  and faixa is null
  and nome in (
    'Investimentos', 'Renegociação de dívidas', 'Juros', 'Reserva'
  );
