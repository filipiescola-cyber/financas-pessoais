# Finanças Pessoais

App pessoal de gestão financeira. Especificação completa em [CLAUDE.md](CLAUDE.md);
plano das duas primeiras fases em [PLANO-FASE-0-1.md](PLANO-FASE-0-1.md).

**Estado atual: Fase 0 — fundação.** Existe schema, RLS, login e deploy. Não existe
nenhuma funcionalidade de negócio ainda: isso é a Fase 1.

---

## Passos manuais da Fase 0

O código está pronto. Estes cinco passos dependem de contas suas e não podem ser
automatizados daqui.

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

As migrations estão em `supabase/migrations`, numeradas de 001 a 013.
**Nunca alterar schema pelo painel** — tudo por migration versionada (§13.6).

### 3. Criar o usuário e DESLIGAR o cadastro público

Este é o item de segurança crítico da fase.

1. No painel do Supabase, **Authentication → Users → Add user**: crie o seu único
   usuário com e-mail e senha.
2. Em seguida, **Authentication → Sign In / Providers → Email**: desligue
   **Allow new users to sign up**.

O schema não tem coluna de dono (o app é de um CPF só), então a política de RLS é
"qualquer usuário autenticado vê tudo". Com o signup aberto, qualquer pessoa cria
uma conta e lê o banco inteiro. Detalhes em `supabase/migrations/012_rls.sql`.

### 4. Rodar localmente

```bash
cp .env.example .env
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (painel → Project Settings
→ API). Só a **anon key** — a `service_role` ignora a RLS e nunca vai para o front.

```bash
npm run dev
```

### 5. Deploy na Netlify

Conectar o repositório (privado). O `netlify.toml` já define build, publish e o
redirect de SPA. Falta só cadastrar as duas variáveis `VITE_*` no painel da
Netlify — nenhuma chave vai para o repositório.

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

## Critério de aceite da Fase 0

- [ ] `npx supabase db push` aplica as 13 migrations sem erro
- [ ] URL de produção abre a tela de login
- [ ] Login funciona; logout volta para o login
- [ ] Logado, a tela inicial mostra **0 contas** e **25 categorias**
- [ ] Deslogado, a mesma consulta retorna zero linhas
- [ ] Signup público desligado, confirmado tentando criar uma conta
- [ ] `npm run teste` roda
