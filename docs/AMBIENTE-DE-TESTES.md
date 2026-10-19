# Ambiente de testes (banco e deploy)

O E2E deixou de rodar contra produção em 19/10/2026. Com a plataforma
multi-grupo, o banco de produção passa a guardar dados de várias empresas, e
rodar teste contra ele, com a senha de um corretor de verdade, deixou de ser
aceitável (spec da plataforma, §14 e §18).

A exceção única é o job `site-publico` do `e2e.yml`: todo dia, só os specs de
`e2e/publico/` contra o site no ar, sem login, sem segredo e sem artefato
(`E2E_SO_SITE_PUBLICO=1`, que faz o Playwright montar só os projetos do site
público e recusar credencial no ambiente). É a vigilância automática do que
está em produção; o painel nunca entra nele.

São três peças, e só a primeira existe sem ação do Matheus:

| Peça | Para quê | Estado |
|---|---|---|
| Banco local (`npm run db:teste`) | Suíte de isolamento (`*.db.test.ts`), a cada push no CI | pronto |
| Projeto Supabase de testes | Banco do site de testes, montado do zero pelas migrations | **depende do Matheus** |
| Ambiente `teste` da Vercel | Site no ar contra o banco de testes, para o E2E | **depende do Matheus** |

Enquanto as duas últimas não existem, o job do painel (`ambiente-de-testes`
no `e2e.yml`) só roda sob demanda (fora do `schedule`) e para no primeiro
passo dizendo o que falta.

## O que já está travado no código

- `playwright.config.ts` recusa `E2E_BASE_URL` apontando para
  `next-home-drab.vercel.app` ou `nexthomeimoveis.com` (`e2e/baseDoE2E.ts`).
- `conectar()` (`src/lib/grupos/apoioDoBanco.ts`) recusa `DB_TESTE_URL` com o
  projeto de produção (`prhhrqyubjcafvucirri`).
- O `e2e.yml` não sobe artefato: o rastro das falhas tem telas do painel.
- `scripts/eval/exportarGolden.ts` exige `--grupo` do grupo 1 e grava fora do
  repositório.
- `test/ambienteDeTestes.test.ts` reprova a volta de qualquer um dos itens
  acima.

## Passo 1 — Criar o projeto Supabase de testes

1. No painel do Supabase, **New project**, nome `next-home-teste`. Pode ser na
   mesma organização (o plano grátis aceita dois projetos ativos). Região: a
   mesma de produção (`ca-central-1`), para o comportamento ser o mesmo.
2. Guarde a senha do banco num gerenciador de senhas. Ela não é de produção e
   não pode ser reaproveitada em lugar nenhum de produção.
3. Em **Project Settings → Database → Connection string**, copie a do
   **Session pooler** (porta 5432). A conexão direta é só IPv6 no plano grátis
   e costuma falhar de redes domésticas e do GitHub.
4. Em **Authentication → URL Configuration**, ponha em **Site URL** a URL do
   ambiente `teste` da Vercel (passo 3). Até ele existir, deixe o padrão.

Confira, antes de seguir, que a URL copiada **não** contém
`prhhrqyubjcafvucirri`. Se contiver, você está no projeto de produção.

## Passo 2 — Aplicar as migrations do zero

As migrations entram pelo mesmo `scripts/banco/dbTeste.mjs` do banco local,
com o comando `remoto`:

```bash
DB_TESTE_URL="<connection string do passo 1>" npm run db:teste:remoto
```

Ele usa o mesmo CLI na mesma versão fixa (`supabase@2.121.0`, a constante
`CLI` do script) e a mesma pasta `supabase/migrations`, e roda `db push`, que
aplica as migrations em ordem e registra cada uma no histórico do projeto.
Num banco vazio, é a mesma prova do `npm run db:teste`. Se uma migration
falhar, a correção vai para `supabase/REPRODUCAO.md`, como no banco local.

Antes do push, o script recusa a URL de produção (`prhhrqyubjcafvucirri`), a
do banco local (para ele, `npm run db:teste`) e URL vazia ou que não seja
`postgresql://`. A URL vem do ambiente, e não da linha de comando. Não chame
o CLI direto: a conferência fica no script, e não em quem digita a URL.

O script não passa `--include-seed`: o `supabase/seed.sql` é de 08/2026 e
grava uma coluna que a 0129 apagou.

## Passo 3 — Dados sintéticos de dois grupos

```bash
DB_TESTE_URL="<connection string do passo 1>" \
  npx tsx scripts/banco/semearAmbienteDeTeste.ts
```

Cria os grupos `teste-a` e `teste-b`, cada um com um gestor e um corretor com
login, pelo mesmo `criarGrupo` da suíte de isolamento. Cada login ganha uma
senha aleatória, impressa **uma vez** no terminal. Guarde a do
`corretor@teste-a.teste`: é a conta do E2E.

O grupo 1 (Next Home) já nasce pelas migrations, sem corretor e sem catálogo.

**Pendente, a decidir:** `e2e/publico/vitrine.spec.ts` procura imóveis reais
do catálogo (`estacao-267-ne67774`, a busca por "dom parque"). Num banco
montado do zero eles não existem, e esses specs vão falhar. As saídas são
reescrever esses specs para criar o próprio imóvel sintético, ou semear o
catálogo de teste com imóveis inventados. Copiar o catálogo de produção não é
a saída: o banco de testes existe para não depender de dado de produção.

## Passo 4 — Ambiente `teste` da Vercel

O ambiente precisa apontar só para o banco de testes. **Nenhuma variável de
produção** pode chegar a ele.

### Opção A — Custom Environment `teste` (plano Pro)

1. **Project Settings → Environments → Create Environment**, nome `teste`,
   ligado à branch `ambiente-de-testes`.
2. Defina as variáveis da lista abaixo **no ambiente `teste`**.

### Opção B — projeto separado `next-home-teste` (plano Hobby)

O Hobby não tem Custom Environment, e um Preview do projeto de produção herda
as variáveis gerais de Preview — hoje as mesmas chaves de produção. Por isso,
no Hobby, o caminho seguro é um projeto da Vercel separado, ligado ao mesmo
repositório, com as próprias variáveis. Nele, `VERCEL_PROJECT_PRODUCTION_URL`
é a URL do projeto de teste, e não a de produção (o `autoDisparo` usa essa
variável para chamar a si mesmo).

**Por que não um Preview do projeto de produção com variáveis próprias.** É a
outra forma que o plano da fase 1 admite, e ela fica de fora de propósito.
Variável definida só para a branch de testes sobrescreve a geral de Preview
apenas quando tem o mesmo nome: toda variável que ficar sem sobrescrever
(`WHATSAPP_*`, `OPENAI_API_KEY`, `META_*`...) chega ao ambiente de testes com
o valor de produção, e um esquecimento basta para o E2E mandar WhatsApp de
verdade. E `VERCEL_PROJECT_PRODUCTION_URL`, que a Vercel define sozinha em todo
deploy do projeto, aponta para o domínio de produção — o `autoDisparo` do
ambiente de testes chamaria a rota de disparo de produção. No projeto separado, as duas
coisas deixam de existir por construção: não há variável de produção para
herdar.

### Variáveis do ambiente de testes

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto de testes (`https://<ref-de-teste>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável do projeto de testes |
| `SUPABASE_SECRET_KEY` | chave secreta do projeto de testes |
| `NEXT_PUBLIC_SITE_URL` | URL do próprio ambiente de testes |
| `CRON_SECRET` | um valor novo, diferente do de produção |

Ficam **de fora**, de propósito: `WHATSAPP_*` (o ambiente de testes não pode
mandar mensagem a ninguém), `META_*`, `OPENAI_API_KEY`, `GROQ_*`, `GEMINI_*`,
`NVIDIA_*`, `GOOGLE_*`, `RESEND_API_KEY`, `GITHUB_TOKEN`,
`INBOUND_EMAIL_WEBHOOK_SECRET` e `NEXT_PUBLIC_META_PIXEL_ID`. Sem elas, cada
caminho que depende delas falha fechado, como em ambiente desconfigurado.

Por fim, a URL do ambiente precisa abrir **sem** o login da Vercel, senão o
E2E só vê a tela de login dela. Na opção B isso já acontece: a URL é o domínio
de produção do projeto de teste, que a proteção padrão não cobre. Na opção A,
tire o ambiente `teste` da **Deployment Protection**. O site fica aberto, e é
aceitável: só tem dado sintético, as senhas são aleatórias e nenhuma chave de
serviço externo está nele. (O "Protection Bypass for Automation" não foi usado
de propósito: o Playwright mandaria o segredo como cabeçalho também para os
serviços de terceiros que a página carrega, como os tiles do mapa.)

## Passo 5 — Ligar o E2E

Em **GitHub → Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Variável | `E2E_BASE_URL_TESTE` | URL do ambiente de testes |
| Segredo | `E2E_TESTE_EMAIL` | `corretor@teste-a.teste` |
| Segredo | `E2E_TESTE_SENHA` | a senha impressa no passo 3 |

Apague os segredos antigos `E2E_CORRETOR_EMAIL` e `E2E_CORRETOR_SENHA`: eram a
senha de uma conta de corretor de verdade, contra produção.

Rode o workflow **E2E (ambiente de testes)** pela aba Actions
(**Run workflow**). Quando ele passar verde:

1. Devolva o `schedule` ao `e2e.yml` (o horário antigo era `17 9 * * *`, 06h17
   em Brasília).
2. Apague o teste "roda só sob demanda enquanto o ambiente de teste não
   existe" de `test/ambienteDeTestes.test.ts`. As outras guardas continuam.

## Rodar o E2E local contra o ambiente de testes

Para investigar uma falha (o rastro não sobe como artefato), rode na sua
máquina, com o e-mail e a senha da conta sintética em `.env.e2e.local`
(`E2E_CORRETOR_EMAIL` e `E2E_CORRETOR_SENHA`, fora do git):

```bash
E2E_BASE_URL=<url do ambiente de testes> npm run test:e2e
```

O rastro fica em `test-results/`, que o git ignora.
