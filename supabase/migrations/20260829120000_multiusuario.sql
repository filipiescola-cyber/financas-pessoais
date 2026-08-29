-- Multiusuário: cada pessoa com os próprios dados (§3, §10.1).
--
-- Até aqui o app era de um CPF só. Nenhuma tabela tinha dono, e a política de
-- segurança dizia apenas `using (true)`: qualquer pessoa autenticada lia o
-- banco inteiro. O que segurava a porta era o cadastro público estar desligado.
--
-- Esta migration é a que a própria migration de RLS antecipou:
--
--   "Se um dia o app virar multiusuário: usuario_id uuid default auth.uid() em
--    todas as tabelas e política por dono. Migration grande — só se acontecer."
--
-- Aconteceu. O modo de falha aqui é uma pessoa ver o extrato da outra, e ele
-- não dá sinal: tudo funciona, só está errado. Por isso cada passo é
-- explícito, e nada depende de o código da aplicação lembrar de filtrar.
--
-- TRÊS TABELAS FICAM GLOBAIS, de propósito: `feriados`, `aliquotas_ir` e
-- `indexadores`. São dado público — o calendário nacional, a tabela do
-- governo, o CDI — iguais para todo mundo. Duplicá-las por pessoa seria
-- guardar a mesma verdade N vezes e deixar N cópias divergirem.

-- ---------------------------------------------------------------- 1. coluna --

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'contas', 'cartoes', 'categorias', 'transacoes', 'faturas', 'recorrencias',
    'orcamentos', 'metas', 'modelos', 'memoria_descricao', 'importacoes',
    'perfis_importacao', 'investimentos', 'movimentacoes_investimento',
    'rendimentos', 'config'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists usuario_id uuid
         references auth.users(id) on delete cascade default auth.uid()',
      tabela
    );
  end loop;
end $$;

-- ------------------------------------------------------------- 2. backfill --
--
-- Tudo que já existe é do único usuário que existe. Se não houvesse nenhum, o
-- `set not null` do passo 3 falharia — e falhar alto é o certo aqui: seguir com
-- linhas sem dono deixaria dado órfão visível para quem entrasse depois.

do $$
declare
  dono uuid;
  tabela text;
begin
  select id into dono from auth.users order by created_at limit 1;

  foreach tabela in array array[
    'contas', 'cartoes', 'categorias', 'transacoes', 'faturas', 'recorrencias',
    'orcamentos', 'metas', 'modelos', 'memoria_descricao', 'importacoes',
    'perfis_importacao', 'investimentos', 'movimentacoes_investimento',
    'rendimentos', 'config'
  ]
  loop
    execute format('update public.%I set usuario_id = $1 where usuario_id is null', tabela)
      using dono;
    execute format('alter table public.%I alter column usuario_id set not null', tabela);
    execute format(
      'create index if not exists %I on public.%I (usuario_id)',
      tabela || '_usuario_id_idx', tabela
    );
  end loop;
end $$;

-- ------------------------------------------- 3. o que colidia entre pessoas --
--
-- Quatro restrições eram globais e viravam conflito na hora: duas pessoas não
-- poderiam ter, cada uma, a sua categoria "Alimentação", a sua conta Empresa,
-- o seu "Uber" na memória de autocomplete, nem o seu estado de onboarding.

drop index if exists categorias_nome_tipo;
create unique index categorias_nome_tipo on categorias (usuario_id, nome, tipo);

drop index if exists contas_uma_empresa_ativa;
create unique index contas_uma_empresa_ativa
  on contas (usuario_id, tipo)
  where tipo = 'empresa' and ativo;

alter table memoria_descricao drop constraint if exists memoria_descricao_descricao_key;
create unique index memoria_descricao_por_usuario
  on memoria_descricao (usuario_id, descricao);

alter table config drop constraint if exists config_pkey;
alter table config add primary key (usuario_id, chave);

-- ------------------------------------------------------------ 4. políticas --
--
-- A troca que dá nome à migration: de "está autenticado" para "é seu".

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'contas', 'cartoes', 'categorias', 'transacoes', 'faturas', 'recorrencias',
    'orcamentos', 'metas', 'modelos', 'memoria_descricao', 'importacoes',
    'perfis_importacao', 'investimentos', 'movimentacoes_investimento',
    'rendimentos', 'config'
  ]
  loop
    execute format('drop policy if exists "usuario autenticado" on public.%I', tabela);
    execute format('drop policy if exists "dono" on public.%I', tabela);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())',
      tabela
    );
  end loop;

  -- As três globais continuam legíveis e graváveis por quem está autenticado.
  -- É uma escolha consciente: atualizar o CDI ou os feriados vale para todos,
  -- porque o valor é o mesmo para todos. Não há dado pessoal nelas.
  foreach tabela in array array['feriados', 'aliquotas_ir', 'indexadores']
  loop
    execute format('drop policy if exists "usuario autenticado" on public.%I', tabela);
    execute format('drop policy if exists "referencia compartilhada" on public.%I', tabela);
    execute format(
      'create policy "referencia compartilhada" on public.%I for all to authenticated
         using (true) with check (true)',
      tabela
    );
  end loop;
end $$;

-- -------------------------------------------- 5. categorias de quem chegar --
--
-- O seed do §4.3 rodou uma vez, numa migration, e virou propriedade do primeiro
-- usuário. Quem entrar depois precisa das suas — senão abre o app sem categoria
-- nenhuma e não consegue nem lançar.
--
-- Gatilho e não chamada da aplicação: se dependesse de a tela lembrar, um
-- caminho de entrada esquecido deixaria alguém com o app vazio. `security
-- definer` porque roda no cadastro, antes de existir sessão para o RLS ler.

create or replace function semear_categorias_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into categorias (usuario_id, nome, tipo, natureza, cor, icone, sistema) values
    (new.id, 'Alimentação',       'despesa', 'variavel', '#F97316', 'talheres',   false),
    (new.id, 'Mercado',           'despesa', 'variavel', '#84CC16', 'carrinho',   false),
    (new.id, 'Transporte',        'despesa', 'variavel', '#0EA5E9', 'carro',      false),
    (new.id, 'Moradia',           'despesa', 'fixa',     '#8B5CF6', 'casa',       false),
    (new.id, 'Contas',            'despesa', 'fixa',     '#6366F1', 'lampada',    false),
    (new.id, 'Saúde',             'despesa', 'fixa',     '#EF4444', 'coracao',    false),
    (new.id, 'Educação',          'despesa', 'fixa',     '#14B8A6', 'escola',     false),
    (new.id, 'Lazer',             'despesa', 'variavel', '#EC4899', 'controle',   false),
    (new.id, 'Assinaturas',       'despesa', 'fixa',     '#A855F7', 'filme',      false),
    (new.id, 'Vestuário',         'despesa', 'eventual', '#F43F5E', 'camiseta',   false),
    (new.id, 'Cuidados pessoais', 'despesa', 'variavel', '#D946EF', 'tesoura',    false),
    (new.id, 'Pets',              'despesa', 'variavel', '#EAB308', 'pata',       false),
    (new.id, 'Presentes',         'despesa', 'eventual', '#FB7185', 'presente',   false),
    (new.id, 'Impostos e taxas',  'despesa', 'eventual', '#64748B', 'documento',  false),
    -- Sem natureza de propósito: aporte é transferência, não despesa (§14).
    (new.id, 'Investimentos',     'despesa', null,       '#22C55E', 'grafico',    false),
    -- De sistema: usada pela conferência de saldo (§5.3). Não pode ser excluída.
    (new.id, 'Ajuste de saldo',   'despesa', 'eventual', '#94A3B8', 'ferramenta', true),
    (new.id, 'Outros',            'despesa', 'variavel', '#9CA3AF', 'circulo',    false),

    (new.id, 'Salário',               'receita', 'fixa',     '#16A34A', 'carteira',   false),
    -- Para MEI, a renda pessoal é a RETIRADA, nunca a venda (§4.5).
    (new.id, 'Pró-labore',            'receita', 'variavel', '#15803D', 'maleta',     false),
    (new.id, 'Distribuição de lucro', 'receita', 'variavel', '#4D7C0F', 'percentual', false),
    (new.id, 'Rendimentos',           'receita', 'eventual', '#0D9488', 'grafico',    false),
    -- Não é renda: é patrimônio virando caixa (§2.7).
    (new.id, 'Venda de bem pessoal',  'receita', 'eventual', '#0891B2', 'etiqueta',   false),
    (new.id, 'Reembolso',             'receita', 'eventual', '#2563EB', 'devolver',   false),
    (new.id, 'Restituição de IR',     'receita', 'eventual', '#7C3AED', 'recibo',     false),
    (new.id, 'Outros',                'receita', 'eventual', '#9CA3AF', 'circulo',    false)
  on conflict (usuario_id, nome, tipo) do nothing;

  return new;
end;
$$;

comment on function semear_categorias_do_usuario() is
  'Dá a cada usuário novo o conjunto padrão de categorias do §4.3. Sem isto ele '
  'abre o app sem categoria nenhuma e não consegue nem lançar.';

drop trigger if exists ao_criar_usuario on auth.users;

create trigger ao_criar_usuario
after insert on auth.users
for each row
execute function semear_categorias_do_usuario();
