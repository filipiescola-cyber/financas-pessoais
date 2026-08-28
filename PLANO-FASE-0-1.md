# Plano de execução — Fase 0 e Fase 1

> Complementa o `CLAUDE.md`. A spec diz **o que** o app é; este arquivo diz **em que ordem construir** as duas primeiras fases e **quando cada uma está pronta**.
> Referências `§x.y` apontam para o `CLAUDE.md`.

**Meta das duas fases juntas:** ao final da Fase 1 o app está no ar, com login, e você lança um gasto pelo celular em menos de 10 segundos. Nada de gráfico, nada de relatório, nada de importação.

---

## Decisões travadas na Fase 0

Ficam registradas aqui para não serem rediscutidas a cada sessão.

| Assunto | Decisão | Motivo |
|---|---|---|
| Front | **React 18 + Vite + TypeScript + Tailwind** | Bottom sheet, chips dinâmicos, wizard retomável, lista com filtros e (Fase 8) fila offline dão estado suficiente para o framework se pagar. TS protege as regras de fatura e parcelamento. |
| PWA | `vite-plugin-pwa` instalado na Fase 0, **service worker só na Fase 8** | Manifest e ícone custam nada agora; cache offline errado atrapalha o desenvolvimento. |
| Dados no cliente | **TanStack Query** | Saldo é calculado (§13.2): toda escrita precisa invalidar leitura. Fazer isso na mão gera tela desatualizada. |
| Rotas | React Router | — |
| Testes | **Vitest**, só funções puras (§13.4) | Sem teste de interface, conforme spec. |
| Backend | Nenhum. `supabase-js` direto do front | Edge Functions só quando aparecer job agendado (Fase 9). |
| Dinheiro | `numeric(14,2)` no banco, **centavos em inteiro** no cliente | §13.1. PostgREST devolve `numeric` como número JS — converter para centavos na entrada da camada de dados e nunca fazer aritmética em float. |
| Idioma | Tabelas, colunas, variáveis de domínio e comentários em português (§13.6) | — |

---

## FASE 0 — Fundação

Objetivo: repositório, banco com schema completo, RLS ligada, login funcionando e deploy vazio no ar. **Zero funcionalidade de negócio.**

### 0.1 Repositório

Repositório **privado** (§10.1). `.env` no `.gitignore` desde o primeiro commit.

```
/src
  /dominio        # funções puras: dinheiro, datas, parcelas, saldo, fatura
  /dados          # cliente supabase, queries, tipos gerados
  /ui             # componentes reutilizáveis (BottomSheet, Chip, CampoValor…)
  /telas          # uma pasta por módulo (§11)
  /import         # vazio até a Fase 4 (ofx.ts, csv.ts)
/supabase/migrations
/fixtures         # extratos anonimizados, a partir da Fase 4
/testes
```

> **Atenção — OneDrive.** O projeto está dentro de uma pasta sincronizada. `node_modules` sincronizando trava build e vigia de arquivos. Excluir `node_modules` da sincronização do OneDrive **antes** do primeiro `npm install`, ou mover o repositório para fora do OneDrive e confiar o backup ao Git remoto.

### 0.2 Supabase

1. Criar projeto (região São Paulo). Senha forte + 2FA na conta (§10.1).
2. Instalar o Supabase CLI e `supabase link` no repositório.
3. **Nenhuma alteração de schema pelo painel** (§13.6). Tudo por migration versionada.

### 0.3 Migrations — ordem dos arquivos

Todo o schema do §3 entra agora, inclusive as tabelas que só serão usadas lá na frente. Tabela dormente não custa nada; migration destrutiva em banco com dado real custa caro.

| Arquivo | Conteúdo |
|---|---|
| `…_extensoes.sql` | `pgcrypto` (para `gen_random_uuid()`) |
| `…_contas.sql` | `contas`, `cartoes` |
| `…_categorias.sql` | `categorias` (auto-referência `categoria_pai_id`) |
| `…_transacoes.sql` | `transacoes` + índices (abaixo) |
| `…_faturas.sql` | `faturas` |
| `…_recorrencias.sql` | `recorrencias` |
| `…_atalhos.sql` | `modelos`, `memoria_descricao`, `config` |
| `…_orcamento_metas.sql` | `orcamentos`, `metas` — dormentes até a Fase 7 |
| `…_importacao.sql` | `importacoes`, `perfis_importacao` — dormentes até a Fase 4 |
| `…_investimentos.sql` | `investimentos`, `movimentacoes_investimento`, `indexadores`, `rendimentos`, `aliquotas_ir`, `feriados` — dormentes até a Fase 9 |
| `…_views.sql` | view `saldos_contas` (§0.5) |
| `…_rls.sql` | RLS em todas as tabelas |
| `…_seed.sql` | categorias padrão (§4.3), faixas de `aliquotas_ir` (§7.2), `config` inicial |

Regras ao escrever as migrations:

- `numeric(14,2)` para dinheiro. Nunca `float`, nunca `money`.
- `date` puro onde não há hora relevante (§13.1).
- `CHECK` nos campos de domínio fechado: `contas.tipo`, `transacoes.tipo`, `transacoes.origem`, `transacoes.motivo_empresa`, `categorias.tipo`, `categorias.natureza`, `faturas.status`. Enum nativo do Postgres não — alterar enum depois é chato; `text` + `CHECK` é trivial de evoluir.
- **Índice obrigatório** (§3): `CREATE UNIQUE INDEX ON transacoes (conta_id, fitid) WHERE fitid IS NOT NULL;` — entra agora mesmo, sem importação existir.
- Índices de trabalho: `transacoes (conta_id, data_caixa)`, `transacoes (data_competencia)`, `transacoes (fatura_id)`, `transacoes (grupo_parcelamento_id)`.
- `ON DELETE RESTRICT` nas FKs de `conta_id` e `categoria_id` — o banco reforça o "arquivar, nunca excluir" do §4.8.
- Seed de categorias com `natureza` já preenchida (é ela que decide a projeção do §8.3) e `sistema = true` em **Ajuste de saldo**.

### 0.4 RLS — ponto de atenção

O schema do §3 **não tem coluna de usuário** em nenhuma tabela: o app é de um CPF só. Consequência prática: as policies não podem filtrar por dono, só por autenticação.

Decisão: policy por papel, em todas as tabelas —

```sql
alter table contas enable row level security;
create policy "usuario autenticado" on contas
  for all to authenticated using (true) with check (true);
```

Isso só é seguro com uma condição que **não pode ser esquecida**:

> **Desligar o cadastro público (signup) no painel do Supabase logo depois de criar o seu único usuário.**

Com signup aberto e `using (true)`, qualquer pessoa cria uma conta e lê o banco inteiro. É o único furo de segurança real desta fase. Se um dia o app virar multiusuário, aí entra `usuario_id uuid default auth.uid()` em todas as tabelas — migration grande, mas só se acontecer.

Conferir também que a role `anon` **não tem policy nenhuma**: deslogado, toda consulta volta vazia.

### 0.5 View de saldo

Saldo é calculado, nunca armazenado (§13.2). Criar já na fundação para nenhuma tela ser tentada a somar na mão:

```sql
create view saldos_contas as
select c.id as conta_id,
       c.saldo_inicial + coalesce(sum(t.valor) filter (where t.data_caixa <= current_date), 0) as saldo_atual
from contas c
left join transacoes t on t.conta_id = c.id
group by c.id;
```

"Hoje" no cliente é sempre calculado em `America/Sao_Paulo` (§13.1) — nunca `new Date()` cru para comparar com `date` do banco.

### 0.6 Auth

- E-mail + senha, um usuário só. Criar a conta, **desligar o signup** (0.4).
- Sessão persistente longa: é um app pessoal de uso diário, exigir login toda semana é atrito.
- Tela de login mínima e uma rota protegida. Nada além disso nesta fase.

### 0.7 Deploy Netlify

- Build `vite build`, publish `dist`.
- Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da Netlify. Nenhuma chave no repositório (§10.1).
- Redirect de SPA: `/*  /index.html  200`.

### 0.8 Critério de aceite da Fase 0

- [ ] `supabase db reset` reconstrói o banco do zero, sem erro, incluindo o seed.
- [ ] URL de produção abre a tela de login.
- [ ] Login com o usuário único funciona; logout volta para o login.
- [ ] Logado, um `select` em `contas` retorna lista vazia sem erro.
- [ ] Deslogado (chave `anon`), o mesmo `select` retorna **zero linhas**.
- [ ] Signup público desligado, confirmado tentando criar uma conta.
- [ ] Categorias padrão presentes, com `natureza` preenchida.
- [ ] `vitest` roda (mesmo sem teste ainda).

---

## FASE 1 — Cadastro + lançamento rápido

Objetivo da spec: **ao fim desta fase o app já é usável no dia a dia.** Se lançar continuar chato aqui, nada do que vier depois salva o projeto (§12).

A ordem abaixo é de dependência: cada bloco usa o anterior.

### 1.1 Núcleo de domínio (funções puras, com teste)

Escrever isto **antes das telas**. É o único código onde erro é silencioso e caro (§13.4).

| Módulo | Responsabilidade | Testes obrigatórios |
|---|---|---|
| `dominio/dinheiro.ts` | centavos ↔ numeric, formatação `pt-BR`, parser "caixa registradora" (`1250` → R$ 12,50) | `1250` → 1250 centavos; `5` → R$ 0,05; colar "R$ 1.234,56" |
| `dominio/datas.ts` | "hoje" em `America/Sao_Paulo`, primeiro e último dia do mês, somar meses com dia inválido | 31/jan + 1 mês → 28 ou 29/fev; virada de ano |
| `dominio/parcelas.ts` | dividir valor em N parcelas, resto na **última** (§13.1) | R$ 100 em 3x → 33,33 / 33,33 / 33,34; **soma sempre igual ao total** |
| `dominio/saldo.ts` | saldo por conta; consolidado **excluindo `empresa` e `divida`** (§4.6) | transação futura não entra no saldo de hoje |
| `dominio/natureza.ts` | natureza efetiva = `transacao.natureza ?? categoria.natureza` (§2.5) | sobrescrita na transação vence |

### 1.2 Camada de dados

- `supabase gen types typescript` → tipos gerados, versionados no repositório.
- Um módulo por tabela em `/src/dados`, com conversão de dinheiro para centavos na fronteira.
- Chaves de query do TanStack por entidade + mês, para invalidação previsível.

### 1.3 Contas (§4)

- CRUD de `contas` dos tipos `corrente`, `poupanca`, `carteira`, `empresa`, `investimento`.
- **Carteira** criada automaticamente no onboarding, só com o valor em dinheiro físico (§4.4).
- **Conta Empresa**: no máximo uma. Na interface, **nunca rotular como "Saldo"** — usar "A empresa te deve R$ X". Sem verde. Não entra no consolidado (§2.6).
- **Arquivar, nunca excluir** (§4.8): conta com transação só permite `ativo = false`. Arquivada some dos seletores, continua nos relatórios.
- Fora desta fase: `divida` (§4.7) — o tipo existe no `CHECK`, a tela não.

### 1.4 Cartões (§4.2)

- Cadastro: nome, limite, `dia_fechamento`, `dia_vencimento` — os dois dias **obrigatórios**.
- **Prévia legível na tela de cadastro**, exigida pela spec: "Compras de 05/set a 04/out entram na fatura que vence em 10/out."
- Cartão adicional ou virtual reaproveita o mesmo cartão, não cria conta nova.

> **Decisão de escopo — faturas ficam na Fase 2.** A geração das 12 faturas futuras (§4.2) depende do cálculo de fatura de referência, que é o coração da Fase 2 (fechamento dia 31, vencimento anterior ao fechamento, virada de ano). Antecipar aqui é antecipar a fase difícil inteira.
>
> **Consequência:** transação de cartão lançada na Fase 1 grava `fatura_id = null`. Ela aparece normalmente na lista e no gasto por categoria; só não está agrupada em fatura.
>
> **Mitigação obrigatória, primeira tarefa da Fase 2:** script de backfill que preenche `fatura_id` de todas as transações de cartão a partir de `data_competencia` + dias do cartão. É determinístico e não depende de nada além do que já está gravado. **Exportar em JSON antes de rodar** (§13.6).
>
> A prévia legível do cadastro já usa a mesma função de cálculo — vale escrevê-la aqui, testada (§13.4), e só usá-la para gerar faturas na Fase 2.

### 1.5 Categorias (§4.3)

O seed já veio na Fase 0. Aqui entra só a tela: listar, criar, renomear, arquivar, editar natureza e cor. "Ajuste de saldo" (`sistema = true`) não pode ser excluída.

### 1.6 Onboarding (§4.1) — **só o caminho manual**

**Data de corte: dia 1º do mês corrente**, não hoje.

Wizard, uma pergunta por tela, na ordem da spec: carteira → contas (saldo do dia 1º) → cartões → fatura aberta → parcelamentos em andamento → despesas fixas → fontes de renda → empresa (opcional) → categorias (já prontas, só revisar).

- **Retomável:** gravar o progresso em `config`, chave `onboarding_status`. Banner discreto no dashboard com o que falta.
- Passos 4 e 5 podem ser adiados, **com aviso explícito** de que a projeção fica incompleta.
- Passo 5 (parcelamentos em andamento) é o mais importante do onboarding: gera as parcelas restantes como transações futuras com `grupo_parcelamento_id`, `parcela_num` / `parcela_total` e `origem = 'parcelamento'`. Na Fase 1 elas saem com `fatura_id = null` e são resolvidas pelo backfill de 1.4.
- Passo 6: despesa fixa vira `recorrencia`. Nesta fase só o **cadastro** — a geração automática no dia certo é Fase 3 (§5.2). Deixar isso claro na tela, senão o usuário espera um lançamento que não vem.
- Passo 7 (§4.5): perguntar pelas **fontes**, nunca "você é CLT?". Sempre valor **líquido**. Fonte fixa vira `recorrencia` de receita. Fonte variável pede as duas sementes ("mês típico" / "mês ruim"), gravadas em `config` para o §8. Perguntar sobre 13º e férias.
- **Meta: menos de 10 minutos** pelo caminho manual. Cronometrar de verdade.
- A ramificação "extrato" **não existe** nesta fase (§4.1) — nem botão desabilitado, nem "em breve".

### 1.7 Lançamento rápido (§5) — o coração da fase

Se algum item abaixo for cortado por tempo, é a fase inteira que perde o sentido.

- **FAB fixo, visível em todas as telas.** Abre **bottom sheet**, nunca página nova (§14).
- Ordem dos campos por frequência de uso:
  1. **Valor** — foco automático, teclado numérico, digitação estilo caixa registradora. O usuário nunca digita vírgula, ponto ou "R$".
  2. **Categoria** — chips das **8 mais usadas nos últimos 30 dias**, por frequência real; link "ver todas".
  3. **Conta / cartão** — pré-selecionada a última usada; com 4 contas ou menos, chips em vez de dropdown.
  4. **Data** — default hoje, chips "Hoje" e "Ontem", calendário para o resto.
  5. **Descrição** — **opcional**.
- **Tipo:** default despesa, toggle discreto.
- **"Salvar e novo":** salva e reabre a folha limpa **mantendo conta e data**.
- **Sem diálogo de confirmação.** Salvar direto, com **undo** por alguns segundos (§5.4).
- **Parcelar em Nx** no próprio formulário: gera as N transações de uma vez (§2.2), usando `dominio/parcelas`.
- **Transferência entre contas** (§2.3): dois lançamentos ligados por `transferencia_par_id`. Nunca conta como receita nem como despesa. Inclui o caso Empresa (§2.6), que pede `motivo_empresa` (`investimento` / `giro` / `subsidio` / `devolucao`).
- Gravar `memoria_descricao` a cada lançamento com descrição — a leitura (autocomplete) é Fase 3, mas **a memória tem que começar a encher agora**, senão o recurso nasce inútil no mês 3.
- Fora desta fase (são Fase 3, §5.2): modelos, autocomplete, recorrência automática, duplicar, lote.

**Meta dura: 3 toques e menos de 10 segundos** para uma despesa comum. Cronometrar com o celular na mão. Estourou, é bug.

### 1.8 Lista de transações

Filtro por mês, conta e categoria. Edição e exclusão com undo. Marcar `revisado`. Transferência aparece identificada como transferência, não como receita ou despesa. Editar ou excluir parcelamento oferece: **só esta / esta e as futuras / todas** (§2.2).

### 1.9 Tela de contas e saldos

Saldo de cada conta pela view `saldos_contas` (`data_caixa <= hoje`). Consolidado **sem** Empresa e sem dívida. Bloco separado para a Empresa, com o rótulo e as cores do §2.6.

### 1.10 Export JSON (§10.2) — não é opcional

Um botão, baixa **todas** as tabelas em JSON. A spec coloca isto na Fase 1 de propósito: é a rede de segurança de toda migration futura, inclusive o backfill de 1.4.

**Testar o restore uma vez**, de verdade, num projeto Supabase descartável. Backup nunca restaurado não é backup (§10.2).

### 1.11 Estados vazios (§13.5)

O app nasce vazio e a primeira semana inteira é estado vazio. Cada tela precisa da sua versão. **Nunca mostrar R$ 0,00 onde a resposta certa é "ainda não sei".**

### 1.12 Modo privado (§10.4) — opcional, barato

Botão que borra os valores da tela. Dez linhas de CSS. Se sobrar meia hora, entra.

### 1.13 Critério de aceite da Fase 1

Funcional:

- [ ] Onboarding completo pelo caminho manual em **menos de 10 minutos**, cronometrado.
- [ ] Fechar o app no passo 3 e reabrir retoma de onde parou.
- [ ] Despesa comum lançada em **≤ 3 toques e ≤ 10 segundos**, cronometrado no celular.
- [ ] "Salvar e novo" permite lançar 10 gastos seguidos sem sair da folha.
- [ ] Compra em 12x gera 12 transações e **a soma bate com o total** (teste automatizado).
- [ ] Transferência gera dois lançamentos ligados e não aparece em receita nem em despesa.
- [ ] Aporte na Empresa aparece como transferência, **não** como despesa, e o consolidado não inclui a Empresa.
- [ ] Nenhuma tela chama o saldo da Empresa de "Saldo", nenhuma pinta de verde.
- [ ] Conta com transação não pode ser excluída, só arquivada.
- [ ] Export JSON baixa todas as tabelas, e o restore foi testado uma vez.
- [ ] Nenhuma tela mostra gráfico zerado ou R$ 0,00 no lugar de "ainda não sei".

Testes verdes (§13.4): dinheiro, datas, parcelas, saldo, natureza.

**Gate para a Fase 2 — o único que importa:** usar o app **7 dias seguidos** para lançar tudo de verdade. Se em algum dia a preguiça venceu, o problema está em 1.7 e é lá que se volta, não na Fase 2.

---

## Riscos conhecidos destas duas fases

| Risco | Mitigação |
|---|---|
| `using (true)` com signup aberto expõe o banco inteiro | Desligar o signup logo após criar o usuário (0.4). Conferir na entrega da Fase 0. |
| Transações de cartão com `fatura_id = null` acumulando | Backfill determinístico como primeira tarefa da Fase 2, com export JSON antes (1.4). |
| `numeric` virando float no JavaScript | Converter para centavos na camada de dados; aritmética só em inteiro (1.1). |
| Comparar `date` do banco com `new Date()` do navegador | Toda noção de "hoje" passa por `dominio/datas`, em `America/Sao_Paulo`. |
| `node_modules` sincronizando no OneDrive | Excluir da sincronização antes do primeiro `npm install` (0.1). |
| Escopo vazando: dashboard, gráfico, importação | Nada de §6, §7 e §8 aqui. A Fase 1 termina em lançamento rápido + export. |
| Arredondamento em cascata | Arredondar na gravação **ou** na exibição, nunca nos dois (§13.1). |

## O que explicitamente NÃO entra

Faturas e fechamento (Fase 2) · modelos, autocomplete, recorrência automática, duplicar, lote (Fase 3) · importação OFX/CSV e a ramificação "extrato" do onboarding (Fase 4) · dashboard e relatórios (Fase 5) · projeção e simulador (Fase 6) · orçamento, metas e conferência de saldo (Fase 7) · service worker e offline (Fase 8) · investimentos e APIs externas (Fase 9).
