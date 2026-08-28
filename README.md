# Finanças Pessoais

App pessoal de gestão financeira. Especificação completa em [CLAUDE.md](CLAUDE.md);
plano das duas primeiras fases em [PLANO-FASE-0-1.md](PLANO-FASE-0-1.md).

**Estado atual: Fase 1 construída, aguardando o gate de uso.** O app já é usável no
dia a dia: onboarding, contas, cartões, categorias, lançamento rápido, lista de
lançamentos, edição, export e modo privado.

O que fecha a fase não é código, é uso: **7 dias seguidos lançando tudo de
verdade** (§12). Se em algum dia a preguiça vencer, o problema está na folha de
lançamento e é lá que se volta — não na Fase 2.

Pendências que dependem de você, não do código:

- cronometrar o lançamento comum: a meta é 3 toques e menos de 10 segundos (§5)
- testar o restore do export JSON pelo menos uma vez (§10.2)
- tirar o site da proteção de acesso da Netlify, se quiser usá-lo no celular sem
  logar duas vezes

| | |
|---|---|
| Produção | https://filipiescola-cyber.github.io/financas-pessoais/ |
| Supabase | projeto `dfybnjgwlsnshzufmobm`, região São Paulo |
| Repositório | github.com/filipiescola-cyber/financas-pessoais (**público**) |

> **Desvio consciente do §10.1**, que pede repositório privado. O GitHub Pages
> só publica de repositório privado com plano pago, e a escolha foi abrir o
> código em vez de pagar. Consequência prática: a spec, as migrations e o
> histórico ficam visíveis. Nenhuma credencial vaza — `.env` sempre esteve no
> `.gitignore` e o histórico foi varrido antes de abrir — mas a estrutura
> financeira do projeto passa a ser pública.
>
> **O que isso obriga:** nunca commitar valor real, extrato ou export. O
> `.gitignore` já cobre `backups/`, e o export do §10.2 baixa direto para o seu
> computador, sem passar pelo repositório.

---

## Passos manuais da Fase 0

Já executados. Ficam registrados para reconstruir o ambiente do zero se preciso.

### 1. Tirar `node_modules` da sincronização do OneDrive

O projeto está dentro de uma pasta do OneDrive. Sincronizar `node_modules` deixa
o build lento e trava o vigia de arquivos do Vite.

No Explorador de Arquivos, clique com o botão direito em `node_modules` →
**Sempre manter neste dispositivo** desmarcado, ou use as configurações do
OneDrive para não sincronizar a pasta. Alternativa mais limpa: mover o
repositório para fora do OneDrive e deixar o backup por conta do Git remoto.

### 2. Criar o projeto no Supabase

Região São Paulo. Senha forte e **2FA na conta** — ela é a chave-mestra de tudo (§10.1).

Depois, no repositório:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

As migrations estão em `supabase/migrations`, com prefixo de timestamp, na ordem em que devem ser aplicadas.
**Nunca alterar schema pelo painel** — tudo por migration versionada (§13.6).

### 3. Criar o usuário e DESLIGAR o cadastro público

Este é o item de segurança crítico da fase.

1. No painel do Supabase, **Authentication → Users → Add user**: crie o seu único
   usuário com e-mail e senha.
2. Em seguida, **Authentication → Sign In / Providers → Email**: desligue
   **Allow new users to sign up**.

O schema não tem coluna de dono (o app é de um CPF só), então a política de RLS é
"qualquer usuário autenticado vê tudo". Com o signup aberto, qualquer pessoa cria
uma conta e lê o banco inteiro. Detalhes em `supabase/migrations/…_rls.sql`.

### 4. Rodar localmente

```bash
cp .env.example .env
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (painel → Project Settings
→ API). Só a **anon key** — a `service_role` ignora a RLS e nunca vai para o front.

```bash
npm run dev
```

### 5. Deploy no GitHub Pages

O workflow em `.github/workflows/deploy.yml` publica a cada push na `main`.
Para ligar, uma vez só:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret**, dois:
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

O endereço fica `https://SEU-USUARIO.github.io/financas-pessoais/`. O caminho
com subpasta está fixado em `vite.config.ts` na constante `BASE` — mudar o nome
do repositório exige mudar lá também.

O Pages não tem regra de reescrita como a Netlify tinha, então o workflow copia
o `index.html` para `404.html`: é o que faz recarregar a página em `/contas`
continuar funcionando.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run teste` | Testes das funções puras (§13.4) |
| `npm run tipos` | Regenera `src/dados/tipos-gerados.ts` a partir do banco linkado |

## Estrutura

```
src/dominio/   funções puras: dinheiro, datas, parcelas, saldo (Fase 1)
src/dados/     cliente Supabase, autenticação, queries
src/ui/        componentes reutilizáveis
src/telas/     uma pasta por módulo (§11)
src/import/    parsers de OFX e CSV (Fase 4)
supabase/migrations/
testes/        só função pura, sem teste de interface
fixtures/      extratos anonimizados (Fase 4)
```

## Critério de aceite da Fase 0 — cumprido

- [x] `npx supabase db push` aplica as 13 migrations sem erro
- [x] URL de produção abre a tela de login
- [x] Login funciona; logout volta para o login
- [x] Logado, a tela inicial mostra **0 contas** e **25 categorias**
- [x] Deslogado, a mesma consulta retorna zero linhas
- [x] Signup público desligado, confirmado tentando criar uma conta
- [x] `npm run teste` roda
