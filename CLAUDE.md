# Finanças Pessoais — Especificação do Projeto

> Arquivo de contexto para o Claude Code. Manter na raiz do repositório.

## 1. Contexto

App **pessoal** de gestão financeira. Nasceu para um único CPF e passou a
suportar mais de uma pessoa — cada uma com os próprios dados, isolados no banco
por dono (§3, §10.1). Continua sendo um app *pessoal*: o que mudou é caber mais
de uma pessoa na mesma instalação, não as finanças de duas pessoas se
misturarem. Não há dado compartilhado entre contas.
Projeto **totalmente separado** do sistema de gestão do negócio (MEI). Não compartilha banco de dados, não compartilha deploy, não compartilha repositório.

**Motivo da separação:** finanças de pessoa física e de pessoa jurídica precisam ficar apartadas. Misturar as duas em um mesmo banco cria confusão contábil e dificulta o pró-labore.

**Entrada de dados: manual, com importação de extrato como acelerador.** Não existe integração bancária por API na V1. O usuário lança as transações e, quando quiser, importa um arquivo OFX ou CSV baixado do próprio banco para preencher o grosso de uma vez (§6). A prioridade número um do projeto é **reduzir o atrito do lançamento** (§5) — um app de finanças manual morre por preguiça de digitar, não por falta de funcionalidade.

Os campos `pluggy_account_id` e `pluggy_transaction_id` permanecem no schema como `nullable` desde o início, para permitir integração futura sem migration destrutiva. Ver §9.5.

### Stack

| Camada | Tecnologia |
|---|---|
| Front | PWA (HTML/CSS/JS ou React — decidir na fase 0) |
| Backend / dados | Supabase (Postgres + Auth + Row Level Security) |
| Jobs | Supabase Edge Functions (Deno) |
| Deploy | Netlify |
| Dados bancários | Manual + importação OFX/CSV (§6). Pluggy como extensão opcional (§9.5) |
| Parser de extrato | 100% client-side — o arquivo não precisa subir para servidor |

---

## 2. Regras de negócio críticas

Estas regras são o coração do app. Errar qualquer uma delas quebra os relatórios.

### 2.1 Cartão de crédito e fatura

- Uma compra no cartão **não é uma saída de caixa no dia da compra**. É uma despesa que entra numa fatura.
- Toda transação de cartão tem `data_competencia` (quando a despesa aconteceu) e pertence a uma `fatura` (mês em que será cobrada).
- A fatura de referência é definida pelo `dia_fechamento` do cartão: compra após o fechamento entra na fatura do mês seguinte.
- **Pagamento de fatura é transferência, não despesa.** A despesa já foi contabilizada nas compras. Contar as duas coisas = despesa dobrada. Este é o erro mais comum em apps de finanças.

### 2.2 Parcelamento

- Compra parcelada em N vezes gera **N transações**, uma por fatura futura, cada uma com o valor da parcela.
- Todas compartilham o mesmo `grupo_parcelamento_id` e carregam `parcela_num` / `parcela_total`.
- **Com entrada manual, o parcelamento é declarado, não detectado.** O usuário informa "12x" no formulário e o app gera as 12 linhas nas faturas futuras. Sem heurística, sem adivinhação — é uma das grandes vantagens do modo manual.
- Editar ou excluir um parcelamento deve oferecer: só esta parcela / esta e as futuras / todas.

### 2.3 Transferências entre contas próprias

- Geram **dois lançamentos ligados** (saída em uma conta, entrada em outra).
- Nunca contam como receita nem como despesa nos relatórios. Só movem saldo.

### 2.4 Competência x caixa

- `data_competencia` — quando o fato econômico ocorreu.
- `data_caixa` — quando o dinheiro efetivamente saiu ou entrou.
- Relatórios de gasto por categoria usam **competência**. Fluxo de caixa e saldo usam **caixa**.

### 2.5 Natureza: fixa, variável e eventual

Toda despesa tem uma `natureza`, herdada da categoria e sobrescrevível na transação:

- **fixa** — valor e recorrência previsíveis. Aluguel, internet, plano de saúde, assinaturas, financiamento.
- **variavel** — acontece todo mês, mas o valor muda. Mercado, combustível, alimentação fora, lazer.
- **eventual** — não é mensal. IPVA, IPTU, seguro anual, manutenção, presentes, viagem.

Por que separar:

- A soma das **fixas** é o custo de vida mínimo: quanto precisa entrar todo mês para nada atrasar. Para MEI, é o piso do pró-labore.
- As **variáveis** são onde dá para cortar. Relatório de corte de gasto só faz sentido sobre elas.
- As **eventuais** precisam de **provisão mensal**: despesa anual dividida por 12, reservada todo mês. Sem isso o IPVA de janeiro sempre parece um desastre.

O Dashboard mostra os três blocos separados. **Nunca um total único de despesa** — o número consolidado esconde exatamente a informação que interessa.

**Receita também tem natureza:**

- **fixa** — salário, mesmo valor todo mês.
- **variavel** — pró-labore, freela. Recorrente, valor oscila.
- **eventual** — venda de bem, reembolso, restituição, presente. Ver §2.7.

Só `fixa` e `variavel` entram na projeção de renda (§8.3). Receita `eventual` entra no caixa e fica de fora da conta.

### 2.6 Dinheiro que vai para a empresa (PF x MEI)

Este app é pessoal e **continua sem nenhuma conexão** com o sistema de gestão do MEI. Mas dinheiro pessoal entra e sai da empresa o tempo todo, e isso precisa aparecer em algum lugar.

**Solução: uma conta do tipo `empresa`, não um módulo.** É a velha conta corrente de sócio da contabilidade.

- Comprou filamento com o cartão pessoal → **transferência** da conta pessoal para a conta "Empresa". Não é despesa pessoal.
- Empresa devolveu o dinheiro → transferência da "Empresa" de volta para a conta corrente.
- Pró-labore → receita normal na categoria "Pró-labore". Isso é renda pessoal de verdade e conta como tal.

**O saldo da conta "Empresa" é a resposta à pergunta:** quanto do seu dinheiro está parado dentro do negócio.

**Por que não é despesa:** se aporte contasse como despesa pessoal, o custo de vida mínimo (§2.5) inflaria e o número perderia a serventia. Comprar filamento não é você gastando — é você movendo patrimônio de um bolso para outro.

#### Sinal do saldo — cuidado com o rótulo

Pela convenção acima, aporte **aumenta** o saldo da conta "Empresa". No começo ela fica **positiva**, não negativa. Positivo aqui significa "a empresa te deve isso".

Isso é uma armadilha de interface. Um número subindo, pintado de verde, lê-se como boa notícia — quando significa o contrário. Regras:

- **Nunca rotular como "Saldo".** Usar "A empresa te deve R$ X" ou "Você tem R$ X parados no negócio".
- Não usar verde. Neutro por padrão; âmbar quando estiver subindo há três meses seguidos.
- É recebível, não caixa. Se entrar no patrimônio, entra em linha própria, separada de investimentos.

Saldo **negativo** significa que você retirou mais do que aportou. Na prática, quase sempre é erro de lançamento — pró-labore marcado como devolução. Mostrar aviso quando ocorrer.

#### Pró-labore não toca esta conta

Distinção que quase todo mundo erra:

- **Devolução de aporte** — a empresa paga de volta o que você emprestou. **Reduz** o saldo da conta "Empresa".
- **Pró-labore** — pagamento pelo seu trabalho. É receita, cai direto na conta corrente e **não reduz** o saldo da conta "Empresa". A dívida continua lá.

Misturar os dois faz você achar que recuperou o aporte quando só recebeu salário.

#### Dividir por motivo

Um número único não distingue "comprei uma impressora" de "estou sangrando". Todo movimento para a conta "Empresa" carrega um `motivo_empresa`:

| Motivo | O que é | Como ler |
|---|---|---|
| `investimento` | Impressora, ferramenta, equipamento | Normal e esperado. Amortiza ao longo de meses. |
| `giro` | Filamento, embalagem, insumo | Deveria voltar em semanas, via vendas. Se não volta, o giro travou. |
| `subsidio` | Você pagando conta operacional que a empresa não cobre | **O perigoso.** Recorrente significa que o negócio não se paga. |
| `devolucao` | Empresa devolvendo dinheiro | Reduz o saldo. |

O dashboard mostra o acumulado **por motivo**, não só o total.

#### Curva saudável

- **Meses 1–6:** o saldo sobe. Esperado — equipamento e estoque inicial saem antes de qualquer retorno chegar.
- **Depois:** o `giro` deve começar a girar de fato (sai e volta) e o total tende a estabilizar.
- **Sinal ruim:** `subsidio` aparecendo todo mês, ou o total ainda subindo na mesma velocidade depois de um ano. Aí não é fase de investimento — é a empresa sendo bancada pelo bolso pessoal em regime permanente.

O valor do número não é o nível, é a **inclinação**.

**Na importação (§6):** compra da empresa feita no cartão pessoal aparece no extrato pessoal. Precisa virar transferência para "Empresa", nunca despesa. Criar modelos (§5.2) para os fornecedores recorrentes e deixar a memória de autocomplete aprender.

#### Regra de decisão: onde registrar o quê

O fato mora no sistema de quem é o fato. **A única coisa que aparece nos dois é dinheiro atravessando a fronteira entre os bolsos.**

| Aconteceu | Registra onde |
|---|---|
| Vendeu produto do catálogo | Só no Gestão |
| Comprou insumo com dinheiro da empresa | Só no Gestão |
| Comprou insumo com cartão pessoal | Gestão (despesa) **e** aqui (transferência para "Empresa") |
| Vendeu item pessoal, dinheiro na conta pessoal | Só aqui — receita `eventual` (§2.7) |
| Vendeu item pessoal, dinheiro na conta da empresa | Só aqui — entrada na conta "Empresa" |
| Empresa te pagou pró-labore | Só aqui — receita, não reduz a conta "Empresa" |
| Empresa devolveu aporte | Só aqui — transferência saindo da "Empresa" |
| Mercado, aluguel, lazer | Só aqui |
| Compra mista (parte pessoal, parte empresa) | Aqui, dividida (§5.5); a parte da empresa também no Gestão |

São só três eventos que cruzam a fronteira: **aporte, devolução e retirada.** Todo o resto vive em um lugar só, e é por isso que os dois sistemas podem continuar desconectados sem perder informação.

**Lançamento duplo é intencional:** a mesma compra é despesa no sistema do MEI e transferência aqui. Os dois sistemas continuam separados de propósito — cada um responde a uma pergunta diferente.

### 2.7 Entradas que não são renda

Nem todo dinheiro que entra é receita recorrente. Tratar tudo igual estraga a projeção do §8.

**Venda de bem pessoal.** Videogame antigo, um PC, uma bicicleta. Não é renda — é converter patrimônio em dinheiro. Você tinha um objeto que valia R$ 2.000, agora tem R$ 2.000 em caixa. O saldo sobe, o patrimônio não muda.

- Categoria "Venda de bem pessoal", natureza `eventual`.
- **Nunca entra no cálculo de renda projetada** (§8.3). Uma venda de R$ 3.000 caindo dentro da janela de 6 meses distorce a mediana e faz o app dizer que você pode gastar mais do que pode.
- Se o item foi vendido em partes ao longo de dois ou três meses, o efeito é pior: viram várias entradas altas seguidas, que parecem tendência e não são.
- Marcar no bloco de eventuais do dashboard, para você lembrar de onde veio o mês bom.

**Se a venda passou pela conta da empresa.** Caso comum para quem já vende em marketplace: você anuncia um item pessoal pela conta do negócio e o dinheiro cai lá. Não é receita da empresa nem entrada na sua conta pessoal — é a empresa segurando dinheiro seu. Lançar como entrada na conta "Empresa" (§2.6), aumentando o que ela te deve. Quando transferir para a conta pessoal, é devolução.

**Reembolso.** Alguém te pagou de volta, ou houve estorno. Não é receita: é a despesa original tendo sido menor do que pareceu.

- Preferir **vincular ao lançamento original**, reduzindo a despesa efetiva. Se você pagou R$ 200 num rodízio e recebeu R$ 100 de volta, seu gasto com lazer foi R$ 100 — não R$ 200 de despesa com R$ 100 de receita.
- Usar a categoria "Reembolso" como receita só quando não der para localizar a despesa original.

**Restituição de IR, prêmio, presente em dinheiro.** Receita `eventual`. Mesma regra: entra no caixa, fica fora da projeção de renda.

---

## 3. Modelo de dados (Postgres / Supabase)

```sql
-- CONTAS
contas (
  id uuid pk,
  nome text,
  tipo text,               -- corrente | poupanca | carteira | cartao_credito | investimento | empresa | divida
  instituicao text,
  saldo_inicial numeric,
  saldo_conferido numeric, -- último saldo real conferido no banco (§5.3)
  data_conferencia date,
  pluggy_account_id text,  -- sempre null na V1; gancho para integração futura
  ativo boolean default true,
  created_at timestamptz
)

-- CARTOES (complementa contas do tipo cartao_credito)
cartoes (
  conta_id uuid fk -> contas,
  limite numeric,
  dia_fechamento int,
  dia_vencimento int
)

-- CATEGORIAS (hierárquicas: pai > filha)
categorias (
  id uuid pk,
  nome text,
  tipo text,               -- receita | despesa
  categoria_pai_id uuid null,
  cor text,
  icone text,
  natureza text null,      -- fixa | variavel | eventual (§2.5), vale para receita e despesa
  sistema boolean default false  -- true = não pode ser excluída
)

-- TRANSACOES
transacoes (
  id uuid pk,
  conta_id uuid fk,
  categoria_id uuid fk null,
  descricao text,                -- editável pelo usuário
  descricao_original text,       -- como veio do extrato, nunca sobrescrever
  valor numeric,                 -- negativo = saída, positivo = entrada
  tipo text,                     -- receita | despesa | transferencia
  data_competencia date,
  data_caixa date,
  fatura_id uuid null,
  grupo_parcelamento_id uuid null,
  parcela_num int null,
  parcela_total int null,
  recorrencia_id uuid null,
  transferencia_par_id uuid null, -- aponta para o lançamento espelho
  fitid text null,                -- ID único vindo do OFX (§6.3)
  importacao_id uuid null,        -- lote de importação que gerou o registro
  origem text default 'manual',   -- manual | importacao | recorrencia | parcelamento
  natureza text null,             -- sobrescreve a natureza da categoria (§2.5)
  motivo_empresa text null,       -- investimento | giro | subsidio | devolucao (§2.6)
  transacao_pai_id uuid null,     -- divisão de transação (§5.5)
  pluggy_transaction_id text unique, -- sempre null na V1
  revisado boolean default false,
  observacao text
)

-- FATURAS
faturas (
  id uuid pk,
  cartao_id uuid fk,
  mes_referencia date,
  data_fechamento date,
  data_vencimento date,
  valor_total numeric,
  status text,             -- aberta | fechada | paga
  transacao_pagamento_id uuid null
)

-- RECORRENCIAS (assinaturas, aluguel, salário)
recorrencias (
  id uuid pk, descricao text, valor_previsto numeric,
  categoria_id uuid, conta_id uuid,
  frequencia text,         -- mensal | semanal | anual
  dia int, ativo boolean
)

-- ORCAMENTOS (teto por categoria por mês)
orcamentos (
  id uuid pk, mes_referencia date,
  categoria_id uuid fk, valor_planejado numeric
)

-- METAS (reserva de emergência, viagem, equipamento)
metas (
  id uuid pk, nome text, valor_alvo numeric,
  valor_atual numeric, prazo date, conta_id uuid null
)

-- MODELOS (lançamentos favoritos de um toque — §5.2)
modelos (
  id uuid pk,
  nome text,                 -- "Almoço", "Uber", "Gasolina"
  valor_padrao numeric null, -- null = pergunta o valor
  categoria_id uuid fk,
  conta_id uuid fk,
  tipo text,
  icone text,
  ordem int
)

-- MEMORIA DE AUTOCOMPLETE (aprende com o que já foi lançado)
memoria_descricao (
  id uuid pk,
  descricao text unique,
  categoria_id uuid fk,
  conta_id uuid fk,
  vezes_usada int,
  ultimo_uso timestamptz
)

-- IMPORTACOES (lote de extrato importado — §6)
importacoes (
  id uuid pk,
  conta_id uuid fk,
  nome_arquivo text,
  formato text,            -- ofx | csv
  periodo_inicio date,
  periodo_fim date,
  total_linhas int,
  importadas int,
  ignoradas_duplicadas int,
  conciliadas int,         -- casadas com lançamento manual existente
  importado_em timestamptz
)

-- PERFIS DE IMPORTACAO (mapa de colunas de CSV por banco — §6.2)
perfis_importacao (
  id uuid pk,
  nome text,                -- "Nubank cartão", "Inter conta corrente"
  conta_id uuid fk null,
  formato text,             -- ofx | csv
  delimitador text,         -- , ou ;
  linhas_cabecalho int,
  col_data int,
  col_descricao int,
  col_valor int,
  col_valor_saida int null, -- alguns bancos usam colunas separadas
  formato_data text,        -- dd/MM/yyyy | yyyy-MM-dd
  decimal_virgula boolean,
  inverter_sinal boolean    -- extrato de cartão costuma vir com sinal trocado
)

-- CONFIG (chave-valor: status do onboarding, preferências)
config (
  chave text pk,
  valor jsonb
)

-- INVESTIMENTOS (§7)
investimentos (
  id uuid pk,
  nome text,                    -- "CDB Inter 110% CDI"
  instituicao text,
  tipo text,                    -- cdb | tesouro | lci | lca | poupanca | fundo | acoes | cripto | outro
  indexador text null,          -- CDI | SELIC | IPCA | PREFIXADO
  percentual_indexador numeric, -- 110 = 110% do CDI
  taxa_prefixada numeric null,  -- % a.a. quando prefixado
  data_aplicacao date,
  valor_aplicado numeric,
  vencimento date null,
  liquidez_diaria boolean,
  isento_ir boolean,            -- LCI, LCA, CRI, CRA, poupança
  calculo_automatico boolean,   -- false para renda variável
  saldo_manual numeric null,    -- renda variável: usuário atualiza na mão
  saldo_conferido numeric null,
  data_conferencia date,
  ativo boolean default true
)

-- APORTES E RESGATES
movimentacoes_investimento (
  id uuid pk,
  investimento_id uuid fk,
  tipo text,               -- aporte | resgate
  valor numeric,
  data date,
  transacao_id uuid null   -- liga com a transferência na conta corrente
)

-- INDEXADORES (atualizado manualmente pelo usuário)
indexadores (
  id uuid pk,
  nome text,               -- CDI | SELIC | IPCA
  taxa_anual numeric,
  vigente_desde date
)

-- RENDIMENTO DIARIO CALCULADO (§7.1)
rendimentos (
  id uuid pk,
  investimento_id uuid fk,
  data date,
  saldo_bruto numeric,
  rendimento_dia numeric,
  rendimento_acumulado numeric,
  unique (investimento_id, data)
)

-- ALIQUOTAS DE IR (configuravel, nunca hardcoded — §7.2)
aliquotas_ir (
  id uuid pk,
  dias_min int,
  dias_max int null,
  aliquota numeric
)

-- FERIADOS NACIONAIS (dias sem rendimento — §7.1)
feriados (
  data date pk,
  descricao text
)
```

**RLS:** ativa em todas as tabelas, filtrando **por dono**. A `anon key` do
Supabase é pública por natureza — sem RLS, qualquer um com a URL lê tudo.

**`usuario_id uuid not null default auth.uid()`** em toda tabela de dado
pessoal, com política `using (usuario_id = auth.uid())`. O default existe para
o código da aplicação não precisar passar o dono em lugar nenhum: esquecer de
filtrar deixa de ser possível, porque quem filtra é o banco.

Três tabelas ficam **globais** de propósito — `feriados`, `aliquotas_ir` e
`indexadores`. São o calendário nacional, a tabela do governo e o CDI: iguais
para todo mundo. Duplicá-las por pessoa seria guardar a mesma verdade N vezes e
deixar N cópias divergirem.

**Restrição única precisa incluir o dono.** Sem isso, duas pessoas não podem ter
cada uma a sua categoria "Alimentação", a sua conta Empresa, o seu "Uber" na
memória de autocomplete — nem o seu próprio estado de onboarding, porque
`config` tem `chave` na chave primária.

**View e função precisam de `security invoker`.** É o ponto onde um vazamento
passa despercebido: view criada sem `security_invoker = on` roda com as
permissões de quem a criou e devolve os dados de todo mundo, sem erro nenhum.

**Índice obrigatório:** `UNIQUE (conta_id, fitid) WHERE fitid IS NOT NULL`. É o que impede o mesmo extrato importado duas vezes de duplicar lançamento.

---

## 4. Cadastro de contas e cartões

### 4.1 Onboarding (primeiro acesso)

**A data de corte é o dia 1º do mês corrente, não hoje.** Começar no meio do mês produz um primeiro relatório pela metade, que parece quebrado justamente quando o hábito ainda é frágil. Começar no dia 1º e preencher os dias já passados — na mão ou por importação (§6) — entrega um mês fechado de verdade já na primeira virada.

Wizard curto, uma pergunta por tela:

1. **Carteira** — criada automaticamente. O usuário só informa quanto tem em dinheiro físico. Sem extrato, sem importação (4.4).
2. **Contas bancárias** — cadastro e, para cada conta, a escolha de **como preencher**:
   - **Manual** — informa o saldo do dia 1º e lança na mão o que já passou no mês, se quiser.
   - **Extrato** — informa o saldo do dia 1º e sobe o OFX ou CSV do mês (§6). O app importa e categoriza o que reconhecer.

   Os dois caminhos coexistem: uma conta por extrato, outra na mão. A escolha é por conta, não global.
3. **Cartões** — nome, limite, dia de fechamento, dia de vencimento (4.2).
4. **Fatura aberta** — o valor já acumulado na fatura atual. Sem isso o app acha que o mês está barato e o dashboard mente.
5. **Parcelamentos em andamento** — descrição, valor da parcela, quantas já pagou, quantas faltam. O app gera as parcelas restantes nas faturas futuras. **É o passo mais importante do onboarding:** sem ele, os próximos meses aparecem artificialmente baratos e a projeção não serve para nada.
6. **Despesas fixas** — cadastrar como recorrências (§5.2): aluguel, internet, assinaturas, plano de saúde. Resolve de saída a maior parte dos lançamentos do mês seguinte.
7. **Fontes de renda** — de onde vem o dinheiro, líquido, fixa ou variável (4.5). É o que permite a projeção do §8 funcionar já no primeiro mês.
8. **Empresa** (opcional) — para MEI ou autônomo, criar a conta do tipo `empresa` (§2.6).
9. **Categorias** — conjunto padrão pronto (4.3), editável depois.

Meta: menos de 10 minutos pelo caminho manual.

**Retomável.** Gravar o progresso em `config` (chave `onboarding_status`). O usuário pode parar no passo 3 e voltar depois; um banner discreto no dashboard lembra do que falta. Os passos 4 e 5 podem ser adiados, mas o app deve avisar que a projeção fica incompleta até serem preenchidos.

**Ordem de construção:** o caminho "extrato" depende da importação, que só fica pronta na Fase 4 (§9). Na Fase 1 o wizard nasce **só com o caminho manual**; a ramificação do extrato é acoplada na Fase 4. Não antecipar a importação para a Fase 1 — ela é grande e atrasaria o app ficar utilizável.

**Não importar histórico longo.** Um ou dois meses bastam. Puxar um ano parece boa ideia e não é: consome tempo, exige categorizar centenas de linhas antigas e polui a memória de autocomplete com descrições que não se usa mais.

### 4.2 Cadastro de cartão — regras

- `dia_fechamento` e `dia_vencimento` são obrigatórios. Sem eles a fatura não fecha e o §2.1 quebra.
- Se o vencimento for menor que o fechamento, o vencimento cai no mês seguinte. Tratar no cálculo, não pedir para o usuário resolver.
- Meses com menos dias: fechamento no dia 31 vira o último dia do mês.
- Ao salvar o cartão, gerar automaticamente as faturas dos próximos 12 meses com status `aberta`.
- Mostrar prévia legível na tela: "Compras de 05/set a 04/out entram na fatura que vence em 10/out." Corta erro de cadastro pela metade.
- Cartão adicional ou virtual da mesma conta: mesmo `cartao_id`, não criar conta nova.

### 4.3 Categorias padrão

Já vir populado, editável.

**Despesa:** Alimentação, Mercado, Transporte, Moradia, Contas (água/luz/internet), Saúde, Educação, Lazer, Assinaturas, Vestuário, Cuidados pessoais, Pets, Presentes, Impostos e taxas, Investimentos, Ajuste de saldo, Outros.

**Receita:** Salário (fixa), Pró-labore (variavel), Distribuição de lucro (variavel), Rendimentos (eventual), Venda de bem pessoal (eventual), Reembolso (eventual), Restituição de IR (eventual), Outros.

A natureza de cada uma vem preenchida no seed. É ela que decide o que entra na projeção de renda (§2.7).

A categoria **"Ajuste de saldo"** é de sistema (`sistema = true`) e não pode ser excluída — é usada em §5.3.

### 4.4 Carteira (dinheiro físico)

Conta especial, criada por padrão no onboarding. Não tem extrato, não importa nada, não concilia com nada.

- É a conta que mais derrapa, e tudo bem. Não vale caçar cada R$ 5 de café.
- Fluxo realista: saque entra como transferência da conta corrente para a carteira; gastos grandes em dinheiro são lançados; o resto se resolve na **contagem mensal** — o usuário conta o que tem no bolso e o app cria o ajuste (§5.3).
- Se a carteira viver bagunçada, é sinal de que o usuário quase não usa dinheiro físico. Nesse caso, zerar e arquivar é mais honesto do que fingir controle.

### 4.5 Fontes de renda

Perguntar no onboarding. Sem isso a projeção (§8) nasce sem o componente mais importante e só começa a servir depois de meses de histórico.

**Não perguntar "você é CLT?".** É binário demais e erra nos casos mais comuns: CLT com MEI por fora, autônomo com um cliente fixo, MEI que tira pró-labore. Perguntar pelas **fontes**, que podem ser várias.

Para cada fonte:

| Campo | Observação |
|---|---|
| Descrição | "Salário", "Pró-labore", "Freela de design" |
| Natureza | `fixa` (mesmo valor todo mês) ou `variavel` |
| Valor líquido | **Líquido, nunca bruto.** O que cai na conta. Salário bruto não serve para fluxo de caixa. |
| Conta de destino | Onde o dinheiro entra |
| Dia do recebimento | Só para fonte fixa |

**Fonte fixa vira `recorrencia` de receita.** Nenhuma tabela nova, e já entra na projeção do §8 desde o primeiro dia.

**Fonte variável** não tem valor para cadastrar. Mas no mês 1 não existe histórico, e sem número nenhum a projeção não roda. Pedir duas estimativas:

- "Num mês típico, quanto entra?" → semente do cenário provável
- "Num mês ruim, quanto entra?" → semente do cenário pessimista

São sementes, não verdade. A partir de 3 meses de histórico o app troca pela mediana real (§8.3) e deixa explícito na tela qual está usando: "estimativa informada por você" ou "mediana de 6 meses".

**13º e férias.** Para fonte fixa, perguntar se recebe. São meses com entrada extra, e uma projeção de 12 meses que os ignora erra feio exatamente em novembro e dezembro. Quase nenhum app trata, e é barato: uma flag e dois lançamentos futuros.

**Cuidado no caso MEI.** Receita de venda é da empresa, não sua. Sua fonte de renda pessoal é o que você **retira** — pró-labore ou distribuição de lucro. Cadastrar "vendas do marketplace" como renda pessoal infla a sua receita e não traz junto as despesas correspondentes, que vivem no outro sistema. A fonte aqui é a retirada, e ela é variável porque depende de como o negócio foi no mês.

### 4.6 Conta "Empresa"

Conta do tipo `empresa`, opcional, criada no onboarding para quem tem MEI ou trabalha por conta própria. Regras de uso em §2.6.

- Não entra no saldo consolidado de "quanto eu tenho para gastar" — é dinheiro emprestado ao negócio, não disponível.
- Aparece em bloco próprio no dashboard, com a variação do saldo nos últimos meses.
- Só pode existir uma por usuário. Se tiver mais de uma empresa, aí sim vale uma conta por empresa.

### 4.7 Dívidas e financiamentos

Financiamento, empréstimo, crediário fora do cartão. Tabela `dividas` própria, guardando os **parâmetros do contrato**.

- Cadastro: valor financiado, número de parcelas, taxa, sistema de amortização, data da primeira, quantas já foram pagas.
- **Com juros, sempre.** Cada parcela se divide em amortização e juros. Tratar a parcela inteira como abatimento erra o saldo devedor em centenas de milhares de reais num financiamento de 30 anos — e erra para menos, dizendo que você está quase quitando quando ainda falta metade.
- Dois sistemas, porque os dois são usados no Brasil: **Price** (parcela constante — crédito pessoal, carro, consignado) e **SAC** (amortização constante, parcela decrescente — padrão do imobiliário, paga menos juros no total).
- A taxa quase nunca está à mão. Aceitar os dois caminhos: quem sabe a taxa informa a taxa; quem sabe a parcela informa a parcela e o app deduz a taxa por bisseção.
- Mostrar **quanto falta** e **em que mês acaba**. A data do fim é a informação que ninguém sabe de cabeça.
- Entra na projeção do §8 como despesa fixa até a última parcela, via recorrência com prazo (§5.2) criada junto no cadastro. No SAC ela entra sem valor previsto, porque a parcela muda todo mês.
- Com mais de uma dívida, ordenar por **taxa de juros**, nunca por valor. A mais cara primeiro.

**Desvio consciente da versão anterior desta seção**, que mandava modelar como conta do tipo `divida` com saldo reduzido por transferências. O saldo devedor é função exata de (valor, taxa, prazo, sistema, parcelas pagas) — então ele é **calculado, nunca armazenado** (§13.2). Guardá-lo numa conta criaria o mesmo fato em dois lugares, e o segundo ficaria para trás na primeira correção do número de parcelas pagas. O tipo `divida` de conta continua existindo para dívida sem contrato conhecido.

### 4.8 Arquivar, nunca excluir

Conta ou cartão com transação vinculada **não pode ser excluído**, só arquivado (`ativo = false`). Excluir apagaria histórico e quebraria relatórios de meses fechados. Item arquivado some dos seletores mas continua nos relatórios antigos.

---

## 5. Lançamento manual — atrito zero

Esta é a seção mais importante do documento. Um app de finanças manual é abandonado quando lançar dá trabalho. **Meta dura: lançamento comum em 3 toques e menos de 10 segundos.** Qualquer fluxo que estoure isso é bug de UX, não escolha de design.

### 5.1 Tela de lançamento rápido

- Botão flutuante (FAB) fixo, visível em **todas** as telas.
- Abre como **bottom sheet**, nunca página nova. O usuário não perde o contexto e não navega.
- Campos ordenados por frequência de uso, não por lógica de banco de dados.

**Ordem e comportamento dos campos:**

1. **Valor** — foco automático, teclado numérico já aberto. Digitação estilo caixa registradora: digitar `1250` vira `R$ 12,50`. O usuário nunca digita vírgula, ponto ou "R$".
2. **Categoria** — chips das 8 mais usadas nos últimos 30 dias, ordenadas por frequência real. Link "ver todas" abre a lista completa.
3. **Conta / cartão** — pré-selecionada a última usada. Com 4 contas ou menos, mostrar como chips em vez de dropdown.
4. **Data** — default hoje. Chips "Hoje" e "Ontem" cobrem quase tudo; calendário para o resto.
5. **Descrição** — **opcional**. Autocomplete puxando de `memoria_descricao`.

**Tipo (receita / despesa):** default despesa, toggle discreto. Mais de 90% dos lançamentos são despesa — não fazer o usuário escolher toda vez.

**Botão "Salvar e novo":** salva e reabre a folha limpa, **mantendo conta e data**. É o que permite lançar o dia inteiro de uma sentada.

### 5.2 Atalhos que matam o atrito

| Recurso | O que faz |
|---|---|
| **Modelos** | Lançamentos favoritos (tabela `modelos`). "Almoço", "Uber", "Gasolina" — um toque preenche categoria, conta e tipo; só falta o valor. Ficam como chips no topo da folha. |
| **Autocomplete que aprende** | Ao digitar uma descrição já usada, sugerir a categoria e a conta da última vez. Alimenta e lê `memoria_descricao`. |
| **Recorrências** | Aluguel, assinaturas, internet, entrada fixa. Geram o lançamento sozinhas no dia certo. Valor fixo entra confirmado; valor variável entra como `revisado = false` para o usuário só ajustar o número. |
| **Duplicar** | Qualquer transação da lista pode ser duplicada com a data de hoje. Dois toques. |
| **Parcelar em Nx** | Campo no próprio formulário. Gera as N transações nas faturas futuras de uma vez (§2.2). |
| **Lançamento em lote** | Tela de tabela (valor / categoria / data) para quando o usuário ficar dias sem lançar e precisar colocar 10–15 de uma vez. |

Juntos, modelos + autocomplete + recorrências eliminam a maior parte da digitação. Sobra só o gasto avulso do dia.

### 5.3 Conferência de saldo

Sem integração bancária o saldo do app derrapa com o tempo. Antídoto obrigatório:

- Tela de conferência: o usuário digita o saldo real do extrato, o app mostra a diferença.
- Se houver diferença, oferecer criar um lançamento na categoria "Ajuste de saldo" — nunca corrigir o saldo silenciosamente por trás.
- Gravar em `saldo_conferido` / `data_conferencia`.
- Lembrete no dia 1 de cada mês.

### 5.4 Antipadrões de UX

- Página cheia com 8 campos obrigatórios para lançar R$ 12 de pão.
- Dropdown com 40 categorias sem ordenação por uso.
- Obrigar descrição.
- Fazer o usuário formatar o valor na mão.
- Confirmação ("deseja salvar?") em lançamento simples. Salvar direto, com undo.

### 5.5 Divisão de transação

Uma compra, mais de uma categoria. No seu cenário o caso clássico é o mercado onde metade é comida e metade é embalagem da empresa.

- A transação vira "pai" e ganha filhas com valor e categoria próprios. A soma das filhas tem que bater com o pai.
- O saldo da conta é afetado **uma vez só**, pelo valor do pai.
- Relatórios por categoria usam as filhas; extrato e conciliação (§6.4) usam o pai.
- É também como se separa a parte "Empresa" (§2.6) de uma compra mista.

---

## 6. Importação de extratos (OFX / CSV)

Melhor custo-benefício do projeto: elimina a maior parte da digitação sem custo, sem API e sem entregar credencial bancária a ninguém. O usuário baixa o arquivo no app do banco e joga no importador.

### 6.1 OFX é o formato preferencial

OFX é um padrão de arquivo usado pelos bancos para exportar movimentação financeira, suportado pela maior parte dos bancos brasileiros — normalmente pela opção "Salvar" ou "Exportar" na tela de extrato do internet banking. Bancos grandes e digitais costumam oferecer; alguns entregam o arquivo por e-mail em vez de download direto.

**Antes de codar:** confirmar no app de cada banco usado quais formatos ele entrega hoje (OFX, CSV, PDF) e se a exportação cobre conta corrente, fatura de cartão, ou as duas. Isso varia por banco e por tipo de conta, e muda com o tempo. O importador precisa suportar **OFX e CSV** justamente para não depender dessa resposta.

Limitações comuns a tratar: janela de exportação curta (vários bancos só liberam os últimos 60 dias), tamanho máximo de arquivo, e lançamentos do dia atual ainda não consolidados.

### 6.2 CSV precisa de perfil configurável

Cada banco monta o CSV do seu jeito. **Não hardcodar layout.** O usuário mapeia as colunas uma vez por banco e o perfil fica salvo em `perfis_importacao`.

A tela de mapeamento mostra as primeiras 5 linhas do arquivo e o usuário aponta qual coluna é data, descrição e valor. Detectar automaticamente quando o cabeçalho permitir ("data", "valor", "descrição") e deixar o usuário corrigir.

Cuidados: delimitador `;` é comum no Brasil; decimal com vírgula; encoding Latin-1 em bancos antigos; extrato de cartão frequentemente traz despesa como valor positivo (daí o `inverter_sinal`).

### 6.3 Deduplicação

- **OFX:** cada transação traz um `FITID`, identificador único gerado pelo banco. Gravar em `transacoes.fitid` e usar o índice `UNIQUE (conta_id, fitid)`. Importar o mesmo arquivo duas vezes não duplica nada. É de graça e é confiável — usar sempre que existir.
- **CSV:** normalmente não tem ID. Gerar hash de `conta_id + data + valor + descricao_original` e gravar no mesmo campo `fitid`. Não é perfeito (dois cafés iguais no mesmo dia colidem), então nesse caso **avisar na tela** em vez de descartar silenciosamente.

### 6.4 Conciliação com lançamentos manuais

Ponto crítico. O usuário já lançou coisas na mão e o extrato traz as mesmas transações. Sem tratamento, tudo duplica.

Regra de casamento: mesmo `conta_id`, mesmo valor, data dentro de ±3 dias, e transação ainda sem `fitid`.

- **Casou** → não cria transação nova. Preenche `fitid` e `descricao_original` na transação manual existente e marca como conciliada.
- **Não casou** → entra como transação nova, `revisado = false`.
- **Casou com mais de uma** → manda para revisão manual. Nunca escolher sozinho.

### 6.5 Fluxo da tela

1. Selecionar a conta ou cartão de destino. **Sempre explícito** — importar na conta errada é o erro mais comum e o mais chato de desfazer.
2. Upload do arquivo. Parse client-side.
3. Preview em tabela, cada linha marcada: nova / duplicada / conciliada com lançamento manual.
4. Categorização automática consultando `memoria_descricao`. Sem match, fica sem categoria — **nunca chutar**.
5. Usuário desmarca o que não quer, ajusta categorias, confirma.
6. Inserção em transação única no banco. Registro do lote em `importacoes`.
7. **Desfazer importação:** botão que apaga todas as transações de um `importacao_id`. Obrigatório — vai ser usado.

### 6.6 Extrato de cartão

Importar fatura de cartão é diferente de importar conta corrente:

- As transações precisam ser vinculadas à `fatura` correta pelo `dia_fechamento` (§2.1).
- A linha de pagamento da fatura anterior, se vier no arquivo, **não é despesa** — é a transferência do §2.1. Detectar e tratar, ou no mínimo sinalizar no preview.
- Parcelas costumam vir descritas como "PARC 03/12" ou "3/12". Detectar o padrão e sugerir vincular ao `grupo_parcelamento_id` existente, se houver.

---

## 7. Investimentos

Aba própria. O usuário cadastra a aplicação com valor inicial e taxa, e o app calcula o rendimento dia a dia.

### 7.1 Cálculo do rendimento diário

Renda fixa no Brasil usa a convenção de **252 dias úteis por ano**. Rendimento só corre em dia útil — sábado, domingo e feriado não rendem.

```
fator_dia  = (1 + taxa_anual) ^ (1/252) - 1
saldo_novo = saldo_anterior * (1 + fator_dia)
```

- **Prefixado:** `taxa_anual` é a taxa contratada, fixa até o vencimento.
- **% do CDI:** `taxa_anual` = CDI vigente × `percentual_indexador`. O CDI acompanha a Selic e muda a cada reunião do Copom (8 por ano). O usuário atualiza `indexadores` e o app passa a usar a taxa nova **dali para frente** — nunca recalcular o passado.
- **Poupança:** regra própria, credita só na data de aniversário mensal. Tratar como caso separado ou deixar fora da V1.
- **Renda variável** (ações, FII, cripto): não tem fórmula, depende de cotação. `calculo_automatico = false` e o usuário atualiza `saldo_manual`. Não tentar buscar cotação na V1.

Precisa de calendário de feriados nacionais (tabela `feriados`; a lista da ANBIMA é a referência de mercado). Sem ele o cálculo erra cerca de 10 dias por ano.

### 7.2 Bruto x líquido

Mostrar os dois. O bruto anima, o líquido é o que o usuário realmente recebe.

Tabela regressiva de IR, incidente **só sobre o rendimento**, não sobre o principal:

| Prazo da aplicação | Alíquota |
|---|---|
| até 180 dias | 22,5% |
| 181 a 360 dias | 20% |
| 361 a 720 dias | 17,5% |
| acima de 720 dias | 15% |

- **Isentos para pessoa física:** LCI, LCA, CRI, CRA e poupança. Usar a flag `isento_ir`.
- **IOF:** incide sobre o rendimento em resgates antes de 30 dias, começando em 96% no primeiro dia e caindo a zero a partir do 30º. Aplicar apenas em simulação de resgate antecipado.
- **Fundos de investimento:** têm come-cotas semestral (maio e novembro). Se for cadastrar fundo, tratar; senão, deixar fora da V1.
- Regra tributária muda. Alíquotas ficam na tabela `aliquotas_ir`, **nunca hardcoded**.

### 7.3 Conferência obrigatória

O valor calculado é **estimativa**, não verdade. O número real é o do banco ou da corretora. Mesmo mecanismo das contas (§5.3): campo de saldo conferido, comparação e diferença tratada de forma explícita. Sem isso o usuário passa meses acreditando num número inventado.

### 7.4 Ligação com o caixa

- **Aporte** = transferência da conta corrente para o investimento. **Não é despesa** (§2.3).
- **Resgate** = transferência de volta.
- Rendimento **não realizado** não entra no relatório de receita do mês. Aparece só no patrimônio. Só vira receita (categoria "Rendimentos") quando resgatado.

---

## 8. Fluxo de caixa projetado e alertas

### 8.1 Por que isso é o centro do app

Para quem tem renda fixa, "posso comprar?" se responde olhando o saldo. Para quem tem renda variável — MEI, autônomo, vendedor de marketplace — o saldo de hoje não responde nada. A pergunta certa é: **como fica o saldo nos próximos meses se eu fizer isso?**

O app já tem todos os ingredientes espalhados. Falta juntá-los.

### 8.2 Como projetar

Para cada mês futuro, horizonte de 12 meses:

```
saldo_final = saldo_inicial
            + receitas_previstas
            - despesas_fixas         (recorrências, §5.2)
            - parcelas_das_faturas   (já lançadas, §2.2)
            - provisoes_eventuais    (anual / 12, §2.5)
            - media_variaveis        (histórico)
```

Cada componente tem uma confiança diferente, e isso precisa aparecer na tela:

| Componente | Confiança | Fonte |
|---|---|---|
| Parcelas de fatura | **Alta** — já é fato consumado | Transações futuras já gravadas |
| Despesas fixas | Alta | Recorrências cadastradas |
| Provisões eventuais | Média | Valor anual dividido por 12 |
| Variáveis | Baixa | Mediana dos últimos 6 meses |
| Receita | Baixa, se irregular | Ver 8.3 |

Uma projeção que finge precisão é pior do que projeção nenhuma.

### 8.3 Renda irregular

Com renda variável, **usar mediana, nunca média**. Um mês excepcional distorce a média e infla a projeção justamente para quem menos pode errar.

Projetar três cenários:

- **Pessimista** — pior mês dos últimos 12
- **Provável** — mediana dos últimos 6
- **Otimista** — melhor mês dos últimos 12

Decisão de compra se toma olhando o cenário **pessimista**, não o provável. O app deve deixar isso explícito na tela do simulador.

**Antes de existir histórico:** nos primeiros meses o app usa as estimativas dadas no onboarding (§4.5) e troca pela mediana real a partir de 3 meses. Mostrar sempre qual está em uso, para o usuário saber o peso do número que está olhando.

**Filtrar receita eventual.** A mediana considera apenas receita de natureza `fixa` e `variavel`. Venda de bem, reembolso e restituição ficam fora (§2.7) — são as entradas que mais distorcem a projeção justamente por serem altas e isoladas.

### 8.4 Simulador de impacto de compra

O recurso mais útil do app inteiro. Antes de confirmar uma compra — principalmente parcelada — mostrar o que ela faz com o futuro.

**Entrada:** valor, à vista ou N parcelas, conta ou cartão.

**Saída, nesta ordem de destaque:**

1. **O pior mês.** "Seu pior mês passa de R$ 1.240 para R$ 180, em março." É esse número que muda comportamento — não o total gasto.
2. **Se algum mês fica negativo:** qual e por quanto.
3. **Compromisso mensal depois da compra.** "Você passa de R$ 640 para R$ 740 por mês comprometidos, até março de 2027."
4. Impacto no orçamento da categoria neste mês.

**Regras:**

- **Não moralizar.** Nada de "tem certeza?", nada de emoji triste, nada de comparação com o mês passado. Mostrar o número e sair da frente. A decisão é do usuário.
- Acessível **fora** do fluxo de compra, como calculadora avulsa. É assim que vai ser mais usado: dentro da loja, antes de comprar.
- Simulação não grava nada.

### 8.5 Compromisso mensal já assumido

Número próprio no dashboard: soma das parcelas já lançadas para cada mês futuro.

"12x sem juros" parece gratuito. Não é — é renda futura já gasta. Mostrar até quando o compromisso se estende e **em que mês ele acaba**. A data em que a folga volta é informação motivadora e ninguém sabe de cabeça.

### 8.6 Alertas

Poucos e acionáveis. Alerta que dispara demais é silenciado, e junto com ele some o alerta que importava.

**Vale alertar:**

- Mês projetado ficando negativo, com a maior antecedência possível.
- Categoria de orçamento passando de 80% antes do dia 20.
- Fatura fechando em 3 dias com valor acima da média.
- Recorrência esperada que não aconteceu — conta esquecida ou cobrança que sumiu.
- Despesa eventual chegando em 45 dias com provisão incompleta: "IPVA em fevereiro: R$ 1.800, provisionado R$ 900".
- Conta "Empresa" subindo há três meses seguidos (§2.6).

**Não alertar:**

- Gasto individual, por maior que seja. É julgamento, não informação.
- Comparação com "pessoas como você".
- Sequências, streaks, medalhas.
- Nada diário. Semanal no máximo; mensal de preferência.

### 8.7 Fechamento mensal

Ritual de 10 minutos, uma vez por mês, com lembrete no dia 1º. É o que mantém o app vivo depois que o entusiasmo inicial passa.

Uma tela guiada: conferir saldos (§5.3), revisar transações sem categoria, ver o resumo do mês fechado, ajustar orçamento e provisões do mês novo.

Sem esse ritual o app vira projeto abandonado no mês 4. Provavelmente é a funcionalidade que mais decide se o projeto valeu a pena.

### 8.8 Patrimônio líquido e reserva de emergência

**Patrimônio** = contas + investimentos − dívidas. A conta "Empresa" entra em linha separada, marcada como recebível (§2.6), nunca somada como caixa.

Gráfico de evolução mensal. É a tela mais motivadora do app e sai quase de graça — os dados já estão todos lá.

**Reserva de emergência medida em meses, não em reais.** "Você tem R$ 8.000" não diz nada. "Você tem 3,2 meses de custo fixo coberto" diz tudo.

O denominador é a soma das despesas **fixas** (§2.5), não a despesa total: em emergência real as variáveis são a primeira coisa que se corta.

Para renda variável, a referência usual é 6 meses em vez de 3, justamente porque a receita pode sumir por um período inteiro.

### 8.9 Fora de escopo, de propósito

Parecem boas ideias e não valem o custo aqui:

- Compartilhar as MESMAS finanças entre duas pessoas (conta conjunta, casal com
  orçamento comum). Multiusuário existe (§3), mas cada conta é uma ilha: não há
  dado visível entre elas, e criar isso mudaria todas as perguntas do app.
- Multi-moeda.
- Cotação de ativos em tempo real.
- Anexar nota fiscal por foto — atrito alto, uso baixo, vira pasta de fotos esquecidas.
- Relatório para IRPF. O dado nunca vai estar completo o bastante para se confiar nele numa declaração.
- Gamificação, streaks, medalhas.
- Categorização por IA. A memória de descrição (§5.2) resolve o mesmo problema com regra simples, previsível e depurável.

---

## 9. APIs e integrações

Todas gratuitas e sem chave, salvo indicação. **Nenhuma é obrigatória** — o app tem que funcionar com todas fora do ar.

### 9.1 Banco Central — indexadores automáticos

Resolve o problema deixado em aberto no §7: atualizar CDI e Selic na mão a cada Copom.

API SGS (Sistema Gerenciador de Séries Temporais), pública, sem chave:

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados/ultimos/{N}?formato=json
```

| Série | Código |
|---|---|
| Selic diária | 11 |
| CDI diário | 12 |
| Selic meta | 432 |
| IPCA | 433 |
| Selic acumulada no mês, anualizada base 252 | 4189 |

**Atenção:** desde março de 2025 o volume de retorno é limitado e o uso de filtros virou obrigatório; consulta por período é limitada a 10 anos. Sempre mandar `dataInicial` e `dataFinal`, ou usar `/ultimos/{N}`.

Uso: Edge Function diária busca o CDI e grava em `indexadores`. O cálculo do §7.1 passa de estimativa a exato.

### 9.2 BrasilAPI — feriados, taxas e bancos

Pública, sem chave. Resolve o calendário de feriados exigido pelo §7.1.

```
GET https://brasilapi.com.br/api/feriados/v1/{ano}   -> feriados nacionais
GET https://brasilapi.com.br/api/taxas/v1            -> Selic, CDI, IPCA vigentes
GET https://brasilapi.com.br/api/banks/v1            -> bancos com código e ISPB
```

- **Feriados:** popular a tabela `feriados` uma vez por ano. Sem isso o rendimento erra cerca de 10 dias por ano.
- **Taxas:** alternativa mais simples ao BCB quando só interessa o valor vigente.
- **Bancos:** preencher a lista de instituições no cadastro de contas em vez de digitar na mão.

Existe MCP comunitário de BrasilAPI — pode ajudar na hora de escrever a integração no Claude Code.

### 9.3 Cotações de renda variável

Fecha o buraco do §7.1 (ações, FII e cripto sem cotação).

- **brapi.dev** — ações, FIIs e cripto brasileiros. Plano gratuito com limite de requisições, exige chave.
- **AwesomeAPI** — moedas e cripto, gratuita.

Confirmar limite e política do plano gratuito antes de depender. Se falhar, o `saldo_manual` do §7 continua como fallback e o app não quebra.

### 9.4 Claude API — leitura de fatura em PDF

O único uso de IA que vale aqui. Alguns cartões só entregam fatura em PDF, sem OFX nem CSV, e nesse caso a §6 não ajuda.

Fluxo: usuário sobe o PDF, uma Edge Function manda para a API da Anthropic pedindo JSON estruturado (data, descrição, valor, parcela), e o resultado cai na **mesma tela de preview e conciliação do §6.5**. Nada entra direto no banco.

- Única etapa paga do projeto, e é por uso, não assinatura.
- **Nunca pular o preview.** Extração de PDF erra, e erro em valor financeiro é caro.
- Continua valendo o §8.9: não usar IA para categorizar. A memória de descrição resolve com regra previsível e depurável.

### 9.5 Pluggy — integração bancária (futuro, opcional)

Não implementar antes do app estar consolidado. Registrado para que a decisão futura não exija redesenho.

**Viabilidade:** o fluxo "Meu Pluggy" é gratuito por tempo indeterminado para uso pessoal, sem limite de contas, desde que todas sejam do próprio titular. Uso comercial exige plano pago (Dados a partir de R$ 2.500/mês).

**Configuração (uma vez):** conectar os bancos em `meu.pluggy.ai`; criar uma aplicação em `dashboard.pluggy.ai`; copiar `Client ID` e `Client Secret`; escolher o conector **MeuPluggy** e autorizar. Repetir a autorização sempre que conectar um banco novo.

**Regras:**

- O `Client Secret` **nunca** vai para o front. Edge Function com o secret em variável de ambiente.
- Deduplicação por `pluggy_transaction_id`, com `UPSERT ... ON CONFLICT DO NOTHING`.
- Sincronização idempotente: rodar 10x produz o mesmo estado.
- Importado entra com `revisado = false` e fica fora dos relatórios até confirmação.
- A Pluggy publica MCP e Agent Skills em `docs.pluggy.ai/docs/mcp`. Instalar no Claude Code antes de escrever a integração.

**Vantagem de já ter feito a Fase 4:** a conciliação (§6.4) é a mesma. A API vira só mais uma fonte alimentando um pipeline que já existe e já foi testado.

### 9.6 Regras para qualquer integração

- **Nenhuma API é caminho crítico.** Se todas caírem, o app continua funcionando com dado manual. Sem exceção.
- **Cache agressivo.** Feriado muda uma vez por ano; CDI, algumas vezes. Não bater na API a cada abertura de tela.
- **Chamada via Edge Function**, não pelo front: evita CORS, esconde chave quando houver e permite cache central.
- **Falha silenciosa e visível ao mesmo tempo:** o app não trava, mas mostra "CDI atualizado em 12/08" para o usuário saber que o dado está velho.
- Guardar o valor usado no cálculo junto com a data. Se a API revisar o número depois, seu histórico não muda sozinho.

---

## 10. Segurança, backup e continuidade

É a sua vida financeira inteira dentro de um app que você mesmo escreveu. Esta seção não é opcional.

### 10.1 Segurança

- RLS ativa em todas as tabelas, **por dono** (§3). A `anon key` do Supabase é
  pública por natureza — sem RLS, qualquer um com a URL lê tudo.
- **Cadastro público (signup) desligado no painel.** Com multiusuário, deixá-lo
  aberto não vaza dado — conta nova vê um app vazio — mas deixa qualquer um que
  descubra a URL criar acesso. Desligado, entra só quem for criado no painel:
  *Authentication → Users → Add user*, com *Auto Confirm User* marcado, já que
  não há envio de e-mail configurado.
- Senha forte e 2FA na conta do Supabase. É a chave-mestra de tudo.
- **Não gravar o que não é necessário:** número completo de cartão, número de conta, senha de banco. O app não precisa de nada disso. Apelido do cartão basta.
- Secrets em variável de ambiente do Supabase. Nada de chave no repositório, mesmo privado.
- Repositório **público**, por decisão consciente: o GitHub Pages exige plano
  pago para publicar de repositório privado. É seguro porque o que está no
  repositório é só código — a chave publicável do Supabase não dá acesso a nada
  sem sessão, e a `service_role` nunca sai do painel. O `.env` está no
  `.gitignore` desde o primeiro commit.

### 10.2 Backup e exportação

- **Export completo em JSON**, um botão, baixa tudo. É o seguro contra você mesmo quebrar o schema numa migration.
- **Export em CSV por tabela**, para abrir no Excel ou migrar para outro app um dia.
- Backup automático mensal, disparado no fechamento (§8.7).
- **Testar o restore pelo menos uma vez.** Backup nunca restaurado não é backup, é esperança.

### 10.3 O risco do plano gratuito

Projetos gratuitos do Supabase são pausados após período de inatividade, e cotas de plano gratuito mudam com o tempo. Na prática:

- Confirmar a política vigente antes de confiar anos de histórico a ela.
- Uso diário já evita pausa por inatividade, mas o export do §10.2 é a rede de segurança real.
- Se o projeto pegar, migrar para o plano pago custa pouco perto de perder o histórico.

### 10.4 Modo privado

Botão que borra todos os valores da tela. Ônibus, trabalho, alguém do lado. Custa dez linhas de CSS e é das funcionalidades mais usadas em app de finanças.

---

## 11. Módulos

| Módulo | Conteúdo |
|---|---|
| **Lançamento rápido** | Bottom sheet acessível de qualquer tela — o módulo mais usado do app (§5) |
| **Dashboard** | Saldo consolidado, gasto do mês x orçamento, fatura aberta, próximos vencimentos |
| **Transações** | Lista com filtro, edição, duplicar, lançamento em lote |
| **Importação** | Upload de OFX/CSV, preview, conciliação, histórico de lotes, desfazer (§6) |
| **Cartões** | Fatura por mês, parcelamentos em aberto, projeção dos próximos meses |
| **Orçamento** | Teto por categoria, comparativo planejado x realizado |
| **Relatórios** | Gasto por categoria, evolução mensal, receita x despesa |
| **Fluxo de caixa** | Projeção de 12 meses, três cenários, compromisso assumido (§8) |
| **Simulador** | Impacto de uma compra no futuro — também como calculadora avulsa (§8.4) |
| **Metas** | Objetivos de poupança com progresso |
| **Patrimônio** | Evolução do patrimônio líquido e reserva em meses de custo fixo (§8.8) |
| **Dívidas** | Financiamentos e empréstimos, saldo devedor, mês de quitação (§4.7) |
| **Investimentos** | Aplicações, rendimento diário, bruto x líquido, patrimônio (§7) |
| **Contas** | Cadastro, saldos, carteira, conta Empresa, arquivamento, conferência (§5.3) |
| **Config** | Categorias, modelos, recorrências, perfis de importação, backup/export |

---

## 12. Fases de implementação

Construir nesta ordem. Cada fase precisa funcionar sozinha antes da próxima.

> **Nota de escopo.** Este documento descreve o app completo — não confunda o mapa com o cronograma. **As fases 0 a 3 são o app.** Da Fase 4 em diante é tudo melhoria em cima de algo que já funciona e já está em uso diário. Parando na Fase 3 você tem um app de finanças pessoais funcional, que é mais do que a maioria dos projetos assim chega a ter. O maior risco aqui não é técnico: é abandonar na metade porque o escopo assustou.

**Fase 0 — Fundação**
Repositório, Supabase, schema, RLS, auth, deploy vazio na Netlify.

**Fase 1 — Cadastro + lançamento rápido**
Onboarding **só no caminho manual** (§4.1), contas, carteira, conta Empresa, cartões, categorias padrão, transações. A folha de lançamento rápido (§5.1) entra **aqui**, não depois. Incluir também o export completo em JSON (§10.2): é a rede de segurança de toda migration futura. Ao fim desta fase o app já deve ser usável no dia a dia — se lançar continuar chato nesta fase, nada do que vier depois salva o projeto.

**Fase 2 — Cartão e fatura**
Fechamento, vencimento, agrupamento em fatura, parcelamento declarado, pagamento como transferência. É a fase tecnicamente mais difícil. Não pular, não adiar.

**Fase 3 — Atalhos de atrito**
Modelos, autocomplete com memória, recorrências automáticas, duplicar, lançamento em lote (§5.2). É o que sustenta o hábito no mês 3.

**Fase 4 — Importação de extratos**
Inclui acoplar a ramificação "extrato" no wizard de onboarding (§4.1). Começar **só por OFX de conta corrente** — é o caso mais simples e o que já tem `FITID` pronto para deduplicar. CSV com perfil configurável e fatura de cartão vêm depois, como sub-etapas. A conciliação (§6.4) precisa estar pronta antes de liberar a importação para uso real, senão o histórico duplica.

**Fase 5 — Dashboard e relatórios**
Gráficos e consolidações em cima de dados que já existem.

**Fase 6 — Fluxo de caixa projetado e simulador**
Projeção de 12 meses, cenários, simulador de impacto de compra, alertas (§8). Depende de ter 2–3 meses de histórico para a mediana das variáveis fazer sentido — mas parcelas e fixas já projetam bem desde o primeiro mês.

**Fase 7 — Orçamento, metas e conferência de saldo**
Tetos por categoria, progresso de metas, tela de conferência (§5.3).

**Fase 8 — PWA offline**
Service worker, lançamento sem internet com fila de sincronização. Boa parte dos gastos acontece na rua.

**Fase 9 — Investimentos**
Cadastro de aplicações, cálculo diário, bruto x líquido, patrimônio (§7). Integrar BCB e BrasilAPI (§9.1, §9.2) para indexadores e feriados — sem elas o cálculo é chute. Resolver o calendário de feriados antes de começar o cálculo.

**Fase 10 (opcional, futuro) — Integração Pluggy**
Só depois de o app estar consolidado. Ver §9.5.

---

## 13. Convenções

### 13.1 Dinheiro e datas

- Valores monetários em `numeric`, nunca `float`. Exibir com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas em `date` puro quando não houver hora relevante. Timezone `America/Sao_Paulo` em todo cálculo de "hoje".
- **Arredondamento de parcela:** dividir com 2 casas e jogar a diferença na **última** parcela. R$ 100 em 3x vira 33,33 + 33,33 + 33,34. A soma das parcelas tem que bater com o total, sempre. Mesma regra na divisão de transação (§5.5).
- Nunca arredondar em cascata. Arredondar na gravação **ou** na exibição — nunca nos dois.

### 13.2 Saldo e transações futuras

Provavelmente o ponto mais fácil de errar do projeto inteiro. Parcelamento (§2.2) e recorrência (§5.2) gravam **transações com data futura**. Elas já existem no banco hoje.

Consequência: toda consulta precisa dizer explicitamente se olha passado, futuro ou os dois.

| Pergunta | Filtro |
|---|---|
| Saldo atual da conta | `data_caixa <= hoje` |
| Gasto do mês por categoria | `data_competencia` no mês; se for o mês corrente, `<= hoje` |
| Fatura do mês | todas as transações da fatura, inclusive futuras |
| Projeção (§8) | só o futuro, `> hoje` |
| Patrimônio (§8.8) | `<= hoje` |

**Saldo é calculado, não armazenado:** `saldo_inicial + soma das transações até hoje`. Guardar saldo em coluna cria dessincronização na primeira edição de transação antiga. Se a performance apertar com milhares de linhas, usar view materializada ou pré-agregado mensal — nunca um campo atualizado na mão.

`saldo_conferido` **não é** o saldo do app. É o número que o usuário digitou do extrato, guardado só para comparação (§5.3). Nunca usar como fonte de saldo.

### 13.3 Jobs: quem dispara o quê

O app é um PWA sem servidor próprio. **Nada roda sozinho** a menos que alguém dispare.

| Rotina | Quem dispara | Como |
|---|---|---|
| Gerar recorrências do mês | Abertura do app | Verificar pendências desde a última execução e gerar retroativamente |
| Fechar fatura na data | Abertura do app | Fechar todas as faturas com `data_fechamento` já passada |
| Atualizar CDI e feriados (§9) | Edge Function agendada, ou abertura com cache | Não é urgente, pode falhar sem quebrar nada |
| Backup mensal (§10.2) | Fechamento mensal (§8.7) | Manual, com lembrete |

**Regra:** toda rotina disparada na abertura tem que ser **idempotente e retroativa**. Se o usuário ficar 10 dias sem abrir, ao voltar tudo se acerta sem duplicar nada. Guardar `ultima_execucao` em `config`.

### 13.4 Testes

Testar as funções puras onde erro é silencioso — e erro silencioso em número financeiro é o pior modo de falha deste app:

- Cálculo da fatura de referência (§2.1). Casos de borda: fechamento dia 31, vencimento anterior ao fechamento, virada de ano.
- Geração de parcelas (§2.2). A soma tem que bater com o total.
- Projeção de fluxo de caixa (§8.2).
- Rendimento diário (§7.1). Dias úteis, feriados, mudança de taxa no meio do período.
- Parsers de OFX e CSV (§6), com arquivos reais anonimizados em `/fixtures`.

Não precisa de teste de interface. Precisa de teste de tudo que produz número.

### 13.5 Estados vazios

O app nasce vazio e a primeira semana inteira é estado vazio. Cada tela precisa de uma versão para "ainda não tem dado":

- Dashboard sem histórico: mostrar o que já dá (saldo, fixas cadastradas, fatura) e esconder o resto, em vez de exibir gráfico zerado.
- Projeção com menos de 3 meses: usar as sementes do onboarding e dizer isso na tela (§8.3).
- Relatórios: "precisa de pelo menos um mês fechado", não um gráfico vazio.
- **Nunca mostrar R$ 0,00 onde a resposta certa é "ainda não sei".**

### 13.6 Código e versionamento

- Nomes de tabelas, colunas e variáveis de domínio em português. Código e comentários técnicos em português.
- Migrations versionadas em `/supabase/migrations`. Nada de alterar schema pelo painel sem gerar migration.
- **Exportar (§10.2) antes de rodar qualquer migration destrutiva** em banco com dado real.
- Parsers de extrato isolados em módulos próprios (`/src/import/ofx.js`, `/src/import/csv.js`).
- Commits pequenos e frequentes. Uma feature por branch.

---

## 14. O que NÃO fazer

- Não contar pagamento de fatura como despesa.
- Não misturar dados do MEI aqui.
- Não tornar obrigatório nenhum campo além de valor, categoria e conta.
- Não abrir página nova para lançar. Bottom sheet, sempre.
- Não fazer o usuário digitar vírgula, "R$" ou escolher o tipo quando o default já resolve.
- Não excluir conta, cartão ou categoria com histórico. Arquivar.
- Não hardcodar layout de CSV de banco nenhum.
- Não importar sem tela de preview e sem botão de desfazer.
- Não liberar importação antes da conciliação (§6.4) funcionar.
- Não remover `pluggy_transaction_id` nem `pluggy_account_id` do schema — são o gancho da integração futura e não custam nada estando vazios.
- Não somar fixa, variável e eventual num total único de despesa no dashboard.
- Não pular o cadastro de parcelamentos em andamento no onboarding.
- Não importar mais de um ou dois meses de histórico no começo.
- Não tratar rendimento calculado como saldo real — é estimativa até ser conferido.
- Não hardcodar alíquota de IR no código.
- Não contar aporte em investimento como despesa.
- Não lançar compra da empresa como despesa pessoal — é transferência (§2.6).
- Não somar a conta "Empresa" no saldo disponível para gastar.
- Não rotular o saldo da conta "Empresa" como "Saldo", nem pintar de verde.
- Não deixar pró-labore reduzir o saldo da conta "Empresa" — não é devolução de aporte.
- Não conectar este app ao sistema de gestão do MEI. A separação é proposital.
- Não usar média para projetar renda irregular. Mediana.
- Não moralizar no simulador de compra. Mostrar o número e calar.
- Não criar alerta diário de coisa nenhuma.
- Não deixar nenhuma API virar caminho crítico do app.
- Não guardar número de cartão, número de conta ou senha de banco.
- Não perguntar salário bruto. Só líquido serve para fluxo de caixa.
- Não deixar receita eventual entrar no cálculo de renda projetada.
- Não lançar reembolso como receita quando dá para vincular à despesa original.
- Não cadastrar receita de venda da empresa como renda pessoal — a sua renda é a retirada.
- Não confiar em backup que você nunca restaurou.
- Não construir relatório bonito antes do lançamento estar rápido.
