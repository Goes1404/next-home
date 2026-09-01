# Next Home

Plataforma da **Next Home Negócios Imobiliários** (CRECI 044589-J) — imobiliária
de Alphaville, Barueri, Santana de Parnaíba e região. São três produtos no mesmo
repositório:

- **Vitrine pública** — home, portfólio de empreendimentos, página do imóvel,
  mapa interativo e páginas institucionais.
- **Painel do corretor** — CRM (leads, funil, visitas, tarefas), cadastro de
  imóveis com ingestão de material da construtora (PDF e Google Drive),
  campanhas de WhatsApp e administração da equipe (papel `gestor`).
- **Assistente de WhatsApp com IA (Sofia)** — atende o cliente no WhatsApp do
  próprio corretor, qualifica o lead, envia fotos e plantas, propõe visita e
  avisa o corretor quando a conversa evolui.

## Stack

Next.js 16 (App Router, React 19) · TypeScript · Tailwind 4 · Supabase
(Postgres + Auth + Storage, com RLS) · GSAP e Lenis para movimento · Leaflet
para mapas · Evolution API para WhatsApp · OpenAI para o agente · Vercel para
deploy · Vitest e Playwright para teste.

> ⚠️ **Esta não é a versão do Next.js que você conhece.** APIs, convenções e
> estrutura de arquivos podem divergir do que está no seu treinamento — leia o
> guia relevante em `node_modules/next/dist/docs/` antes de escrever código.
> Ver `AGENTS.md`.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # e preencha (ver abaixo)
npm run dev                  # http://localhost:3000
```

O mínimo para a **vitrine pública** subir são as duas variáveis do Supabase.
Painel, WhatsApp e IA exigem o resto.

## Estrutura

```
src/app/(institucional)   home (/), anunciar imóvel, página do corretor
src/app/(vitrine)         portfólio, empreendimento, mapa
src/app/sobre|contato|privacidade|wa  (páginas avulsas)
src/app/corretor/(painel) CRM, imóveis, campanhas, conversas, administração
src/app/api/webhooks      whatsapp · meta (Lead Ads) · email-lead
src/app/api/cron          campanhas · followups · meta-ads
src/lib/whatsapp          agente de IA, provedores, anti-ban, campanhas
src/lib/crm               leads, timeline, tarefas
src/lib/supabase          clientes (browser, servidor, serviço) e types
supabase/migrations       61 migrations, aplicadas em ordem
scripts/eval              eval de resposta, eval de conversa e benchmarks
e2e/                      Playwright (público + painel)
docs/                     roadmaps, setup e a memória operacional
```

## Variáveis de ambiente

`.env.example` traz o comentário completo de cada uma. Resumo:

| Grupo | Variáveis | Sem elas |
|---|---|---|
| **Supabase (público)** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | nada funciona |
| **Supabase (servidor)** | `SUPABASE_SECRET_KEY` | webhook não grava conversa (chega sem sessão; as tabelas têm RLS) |
| **Site** | `NEXT_PUBLIC_SITE_URL` | canonical, sitemap e links do bot apontam para o domínio errado |
| **WhatsApp** | `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_URL` | nenhuma mensagem sai — nem a resposta ao cliente, nem o alerta ao corretor |
| **IA (motor)** | `OPENAI_API_KEY`, `OPENAI_MODEL` (opcional) | todo atendimento cai em contingência |
| **IA (Gemini)** | `GEMINI_API_KEY` | importar PDF e entender áudio param — é o caminho **único** de PDF e a primeira escolha na transcrição, mesmo com o motor no ar |
| **IA (reserva)** | `GROQ_API_KEY`, `NVIDIA_API_KEY` | só entram quando o motor está SEM CHAVE (ambiente desconfigurado, não modo de operação) |
| **Cron** | `CRON_SECRET` | `/api/cron/*` recusa toda requisição em produção |
| **Lead por e-mail** | `INBOUND_EMAIL_WEBHOOK_SECRET` | `/api/webhooks/email-lead` devolve 503 (falha fechada, de propósito) |
| **Google Drive** | `GOOGLE_API_KEY` | importar mídia por link de pasta some da tela, com aviso |
| **Meta Lead Ads** | `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_VERSION` | leads de anúncio não chegam |
| **Meta Ads (métricas)** | `META_ADS_TOKEN`, `META_ADS_ACCOUNT_ID` | tela de Anúncios funciona, só sem o gasto |
| **E2E** | `E2E_CORRETOR_EMAIL`, `E2E_CORRETOR_SENHA` em `.env.e2e.local` | specs do painel **pulam** (não falham) |

**O motor de IA é um só: a OpenAI (`gpt-4.1-mini`), que é paga.** A cascata de
quatro provedores foi desmontada de propósito — cada provedor escreve de um
jeito, e a troca acontecia no meio da conversa, com o cliente sentindo a
mudança de voz. As chaves gratuitas continuam no ambiente como reserva para o
caso de o motor ficar sem chave. Ver `src/lib/whatsapp/llm.ts`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run lint` | ESLint |
| `npm test` | Vitest (72 arquivos de teste) |
| `npm run test:e2e` | Playwright |
| `npm run eval` | eval de **resposta** do agente (36 casos golden + juiz LLM) |
| `npm run eval:conversa` | eval de **conversa**: cliente simulado por até 12 turnos |
| `npm run eval:fixture` | regenera o fixture de catálogo usado pelos evals |
| `npm run bench:openai` \| `:gemini` \| `:groq` \| `:nvidia` | compara modelos de um provedor |

### Testes

Boa parte da suíte é convencional, mas alguns testes **leem o código-fonte** em
vez de executá-lo (`escalaDoPainel`, `camadasGuardas`, `gravacaoDeMensagem`,
`leadArquivado`, `seo`, `navegacao`). São feios de propósito: as regressões que
eles pegam falham **caladas** — a tela continua abrindo, o build passa, e o
estrago só aparece em produção ou na SERP.

### Evals

- **Rode com `npm run eval`, nunca `npx tsx` direto.** A cadeia do agente
  começa com `import "server-only"`, que lança fora do runtime de servidor do
  React; o script precisa de `--conditions=react-server`.
- `npm run eval -- --sem-juiz` roda só as checagens duras (fallback, guardrail,
  foco, valor, prazo). Não produz score — rodada sem juiz não se compara com
  rodada julgada.
- **O arquivo de resultado é por versão + dia e se sobrescreve.** Rodada
  julgada que importa: commite antes de rodar outra coisa.
- Ao mexer no prompt, faça o bump manual de `PROMPT_VERSAO` em
  `src/lib/whatsapp/aiAgent.ts`, rode o eval e commite `eval/resultados/`. O
  score não pode cair em relação à versão anterior — e só compara com o mesmo
  juiz, os mesmos casos e o mesmo denominador.

### E2E

O banco por trás é o de **produção** — não há ambiente de teste. Todo spec do
painel é **read-only por contrato**: abre tela, marca checkbox, abre modal, e
nunca aciona o botão que grava, dispara ou move. Spec novo herda a regra.

## Banco de dados

Migrations versionadas em `supabase/migrations/`, aplicadas em ordem. Duas
armadilhas que já custaram sessões inteiras:

- **`list_migrations` do Supabase está dessincronizado do schema real.** Antes
  de aplicar migration nova, confira as colunas de verdade em
  `information_schema.columns`.
- **A tabela `leads` tem `revoke update` com grant coluna a coluna** (0007), e
  `delete` foi revogado na 0022. Coluna nova editável pelo painel precisa de
  `grant update (col)` explícito — sem isso a policy passa, o update afeta 0
  linhas e ninguém vê erro nenhum.

Regenerar `src/lib/supabase/types.ts` **não é só rodar o gerador**: ele conhece
apenas os quatro enums nativos do Postgres e devolve `string` para as ~34
uniões que aqui são coluna de texto com CHECK. A lista está no cabeçalho do
próprio arquivo.

## Deploy

Vercel, projeto `next-home`, plano **Hobby**. O que precisa saber antes do
primeiro push:

- **A branch de produção não é `main`** — é
  `claude/modernizar-plataforma-imobiliaria-2tm13q`. Push só em `main` gera
  preview. Até alguém trocar isso em Settings → Git → Production Branch, todo
  deploy de verdade vai para as duas.
- **Cron job no Hobby roda no máximo 1x/dia.** Schedule mais frequente em
  `vercel.json` faz a Vercel **recusar o deployment inteiro**, sem log visível
  por push — o site simplesmente para de atualizar. Se um push não gerar
  deployment em ~1 minuto, force um deploy manual pela API para ver o erro.
  (O disparo de campanhas contorna isso com pg_cron no Supabase e uma corrente
  de `after()` na própria rota.)
- **Variável de ambiente nova na Vercel só vale depois de um redeploy** — as
  funções serverless congelam o ambiente no build.

## Webhook do Meta Lead Ads

Leads de anúncio do Instagram/Facebook chegam em `POST /api/webhooks/meta`.
Design completo em
[`docs/superpowers/specs/2026-08-17-webhook-meta-lead-ads-design.md`](./docs/superpowers/specs/2026-08-17-webhook-meta-lead-ads-design.md).
Configuração:

1. **Criar o app** em developers.facebook.com (tipo "Empresa"); anotar o App ID
   e, em Configurações → Básico, o App Secret (`META_APP_SECRET`).
2. Adicionar o produto **Webhooks**.
3. Adicionar o produto **Lead Ads** (ou "Página" com `leads_retrieval`) — sem
   ele a Graph API não libera `GET /{leadgen_id}`.
4. **Gerar o Page Access Token de longa duração**, em três trocas: token de
   usuário no Graph API Explorer (`pages_show_list`, `pages_manage_ads`,
   `leads_retrieval`, `pages_read_engagement`) → token de usuário de longa
   duração (`grant_type=fb_exchange_token`) → token da **página**
   (`GET /me/accounts`). O último é o `META_PAGE_ACCESS_TOKEN`.
5. **Configurar o webhook**: Callback URL `https://<domínio>/api/webhooks/meta`,
   Verify Token igual a `META_WEBHOOK_VERIFY_TOKEN`.
6. **Assinar o campo `leadgen` para a Página específica** — assinar no nível do
   app não basta.
7. **Testar** pela [Lead Ads Testing
   Tool](https://developers.facebook.com/tools/lead-ads-testing) e conferir em
   `/corretor/leads`.

## Assistente de WhatsApp

O provedor é a **Evolution API** (ponte não-oficial, estilo WhatsApp Web), e
não a API da Meta: é o que permite um número por corretor, o dele mesmo, sem
verificação de empresa nem custo por mensagem. O risco está dito com todas as
letras em [`docs/WHATSAPP_SETUP.md`](./docs/WHATSAPP_SETUP.md), que é o
caminho do zero até o primeiro corretor conectado.

Quatro caminhos chamam o agente — webhook, follow-up, playground do painel e
eval — e **todos passam por `turnoDeAtendimento.ts`**. Esse arquivo existe
porque a divergência já aconteceu três vezes (playground sem few-shot, eval com
catálogo cru, eval sem a pendência do funil): quando o teste do corretor mede um
prompt que produção nenhuma vê, o teste vira mentira.

## Documentação

| Arquivo | Para quê |
|---|---|
| [`docs/MEMORIA.md`](./docs/MEMORIA.md) | **leia antes de mexer em qualquer coisa** — fatos que custaram uma sessão inteira para descobrir |
| [`AGENTS.md`](./AGENTS.md) | aviso sobre a versão do Next.js |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | horizontes do produto, cada um com o portão medível que autoriza o seguinte |
| [`docs/ROADMAP-CHATBOT.md`](./docs/ROADMAP-CHATBOT.md) | evolução do assistente |
| [`docs/ROADMAP-META-ADS.md`](./docs/ROADMAP-META-ADS.md) | integração de anúncios |
| [`docs/WHATSAPP_SETUP.md`](./docs/WHATSAPP_SETUP.md) | ligar o WhatsApp do zero |
| [`docs/RECUPERAR-NUMERO-WHATSAPP.md`](./docs/RECUPERAR-NUMERO-WHATSAPP.md) | número restrito pelo WhatsApp: o que fazer, e como verificar que o espaçamento anti-ban está valendo |
| [`docs/superpowers/specs/`](./docs/superpowers/specs) | design de cada funcionalidade grande |

**`docs/MEMORIA.md` não é opcional.** É onde estão as armadilhas que este
projeto já pagou para aprender — de `backdrop-filter` criando containing block
a coluna gerada que fazia o insert de lead falhar em silêncio. A régua para
escrever lá é: *isso teria me poupado 10+ minutos se eu já soubesse*.
