-- Seed inicial (§4.3, §7.2).
-- Idempotente: pode rodar de novo sem duplicar nada.
--
-- A natureza vem preenchida de fábrica porque é ela que decide o que entra na
-- projeção de renda (§2.7, §8.3) e o que aparece em cada bloco do dashboard
-- (§2.5). Categoria sem natureza é categoria que some do relatório certo.

-- ---------------------------------------------------------------- despesas --
insert into categorias (nome, tipo, natureza, cor, sistema) values
  ('Alimentação',        'despesa', 'variavel', '#F97316', false),
  ('Mercado',            'despesa', 'variavel', '#84CC16', false),
  ('Transporte',         'despesa', 'variavel', '#0EA5E9', false),
  ('Moradia',            'despesa', 'fixa',     '#8B5CF6', false),
  ('Contas',             'despesa', 'fixa',     '#6366F1', false),
  ('Saúde',              'despesa', 'fixa',     '#EF4444', false),
  ('Educação',           'despesa', 'fixa',     '#14B8A6', false),
  ('Lazer',              'despesa', 'variavel', '#EC4899', false),
  ('Assinaturas',        'despesa', 'fixa',     '#A855F7', false),
  ('Vestuário',          'despesa', 'eventual', '#F43F5E', false),
  ('Cuidados pessoais',  'despesa', 'variavel', '#D946EF', false),
  ('Pets',               'despesa', 'variavel', '#EAB308', false),
  ('Presentes',          'despesa', 'eventual', '#FB7185', false),
  ('Impostos e taxas',   'despesa', 'eventual', '#64748B', false),
  -- Aporte em investimento é transferência, não despesa (§14). A categoria
  -- existe só para a minoria dos casos em que a taxa é despesa de verdade;
  -- por isso fica sem natureza.
  ('Investimentos',      'despesa', null,       '#22C55E', false),
  -- Categoria de sistema: usada pela conferência de saldo (§5.3). Não excluir.
  ('Ajuste de saldo',    'despesa', 'eventual', '#94A3B8', true),
  ('Outros',             'despesa', 'variavel', '#9CA3AF', false)
on conflict (nome, tipo) do nothing;

-- ---------------------------------------------------------------- receitas --
-- Só fixa e variável entram na projeção de renda. Eventual entra no caixa e
-- fica de fora da conta (§2.7).
insert into categorias (nome, tipo, natureza, cor, sistema) values
  ('Salário',                'receita', 'fixa',     '#16A34A', false),
  -- Para MEI, a renda pessoal é a RETIRADA, nunca a venda (§4.5).
  ('Pró-labore',             'receita', 'variavel', '#15803D', false),
  ('Distribuição de lucro',  'receita', 'variavel', '#4D7C0F', false),
  ('Rendimentos',            'receita', 'eventual', '#0D9488', false),
  -- Não é renda: é patrimônio virando caixa (§2.7).
  ('Venda de bem pessoal',   'receita', 'eventual', '#0891B2', false),
  -- Preferir vincular à despesa original em vez de lançar como receita (§2.7).
  ('Reembolso',              'receita', 'eventual', '#2563EB', false),
  ('Restituição de IR',      'receita', 'eventual', '#7C3AED', false),
  ('Outros',                 'receita', 'eventual', '#9CA3AF', false)
on conflict (nome, tipo) do nothing;

-- --------------------------------------------------- alíquotas de IR (§7.2) --
-- Tabela regressiva de renda fixa. Fica no banco, nunca no código (§14).
insert into aliquotas_ir (dias_min, dias_max, aliquota)
select v.dias_min, v.dias_max, v.aliquota
from (values
  (0,   180,  0.225),
  (181, 360,  0.200),
  (361, 720,  0.175),
  (721, null, 0.150)
) as v(dias_min, dias_max, aliquota)
where not exists (select 1 from aliquotas_ir);

-- ------------------------------------------------------------ config (§4.1) --
-- Onboarding retomável: o wizard grava aqui o passo em que parou.
insert into config (chave, valor) values
  ('onboarding_status', '{"concluido": false, "passo_atual": 1, "passos_pulados": []}'::jsonb)
on conflict (chave) do nothing;
