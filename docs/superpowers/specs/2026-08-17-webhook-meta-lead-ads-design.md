# Webhook Meta Lead Ads + ajuste da roleta

Sub-projeto 1 de 4 do módulo de leads (Meta Lead Ads → roleta → tabela →
WhatsApp em massa). Este spec cobre só a chegada do lead: webhook da Meta,
normalização de dados, e os dois ajustes que a roleta precisa para suportar
isso (`em_pausa` e trava de concorrência).

Os outros três sub-projetos (templates + histórico de envios, tabela de
leads com filtros, disparo de WhatsApp em massa) ficam para specs
seguintes.

## Contexto

O projeto já tem:
- `leads` (migrations 0001, 0005, 0007): captura via `POST /api/leads`,
  usando a chave anon do Supabase — não existe `service_role` em nenhum
  ambiente, de propósito (ver comentário na 0007).
- `corretores` com `papel` (`corretor`/`gestor`), `ativo`, `regioes`.
- Roleta como trigger `before insert` (`distribuir_lead()`), que escolhe o
  corretor com menos leads nos últimos 30 dias, desempatando por
  "há mais tempo sem receber". Roda dentro da mesma transação do insert.
- Painel `/corretor/equipe` (só gestor): resumo de carga por corretor,
  atribuição manual de leads sem dono.

Falta: qualquer porta de entrada além do formulário do site. Este spec
adiciona a porta Meta Lead Ads (Instagram/Facebook Ads).

## Arquitetura

```
Meta (evento leadgen)
  → POST /api/webhooks/meta
      1. valida assinatura (X-Hub-Signature-256)
      2. para cada leadgen_id: busca dados do lead na Graph API
      3. busca nome do anúncio na Graph API
      4. normaliza telefone (E.164, default +55)
      5. insere em `leads` com a chave anon (mesma de /api/leads)
         → trigger distribuir_lead() roda igual, escolhe corretor
      6. responde 200
```

Nenhuma fila, nenhum serviço novo. É uma função Next.js (`runtime =
"nodejs"`) que processa o evento inline — o volume de leads de anúncio não
justifica infraestrutura de fila, e a Graph API responde rápido o
suficiente para caber no timeout da função.

## Banco de dados — migration `0008_webhook_meta.sql`

### `leads`

```sql
alter table leads
  add column meta_lead_id text unique,
  add column anuncio_origem text;
```

- `meta_lead_id`: identifica o lead vindo da Meta. `unique` (permite NULL
  em qualquer quantidade de linhas — leads do site continuam sem valor
  aqui) é o que torna o insert idempotente a reenvios de webhook.
- `anuncio_origem`: nome do anúncio (não o `ad_id` bruto), pra o corretor
  saber de qual campanha veio sem precisar decorar IDs.

### `corretores`

```sql
alter table corretores
  add column em_pausa boolean not null default false;
```

Diferença de `ativo`: `ativo = false` é desligamento (perde a escala e o
cadastro publicável); `em_pausa = true` é temporário (férias, folga) —
mesmo cadastro, mesmo login, só fora da roleta enquanto durar. Os dois
tiram da roleta.

### `distribuir_lead()` — dois ajustes

1. Filtro ganha `and not c.em_pausa`.
2. A função passa a abrir com um advisory lock transacional:

```sql
perform pg_advisory_xact_lock(hashtext('roleta_leads'));
```

**Por quê:** a seleção do corretor lê `count(*)` e `max(created_at)` de
`leads` via subquery correlacionada, sem travar linha nenhuma de
`corretores`. Em READ COMMITTED, duas transações concorrentes (dois leads
entrando no mesmo segundo — o caso que webhooks tornam comum) avaliam essa
subquery cada uma sem enxergar o insert da outra, porque nenhuma commitou
ainda. As duas podem escolher o mesmo corretor como "quem recebeu menos".
`pg_advisory_xact_lock` serializa as execuções da função: a segunda
transação espera a primeira commitar (e liberar o lock, automático no fim
da transação) antes de rodar sua própria seleção — nesse ponto ela já
enxerga o lead que acabou de entrar. Escopo do lock é global ao processo
Postgres (uma chave arbitrária via `hashtext`), não por linha, o que é
exatamente o que se quer: só um insert de lead decide corretor por vez.

### Policy nova em `corretores`

```sql
create policy "gestor atualiza escala"
  on corretores for update
  to authenticated
  using (eh_gestor())
  with check (eh_gestor());

grant update (ativo, em_pausa) on corretores to authenticated;
```

Hoje `corretores` só tem a policy de select pública (0001) — nenhum
update é possível pelo cliente autenticado. Isso bloqueia o toggle de
`em_pausa` (e deixaria `ativo` sem forma de editar pela UI também, embora
isso não seja escopo deste spec).

## Webhook — `src/app/api/webhooks/meta/route.ts`

`export const runtime = "nodejs";` (mesmo padrão de `api/leads`).

### `GET` — verificação

```
GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
```

Compara `hub.verify_token` com `META_WEBHOOK_VERIFY_TOKEN`. Bate: responde
`hub.challenge` como texto puro, status 200. Não bate: 403.

### `POST` — recepção

1. Lê o corpo bruto (`await req.text()`) — precisa do texto exato para a
   verificação de assinatura, antes de fazer `JSON.parse`.
2. Calcula HMAC-SHA256 do corpo bruto com `META_APP_SECRET`, compara com o
   header `x-hub-signature-256` (`sha256=<hex>`) usando comparação de
   tempo constante (`crypto.timingSafeEqual`). Não bate: 401, para o
   processamento.
3. `JSON.parse` do corpo. Estrutura esperada:
   `entry[].changes[].value` com `field === "leadgen"` e
   `{ leadgen_id, ad_id, form_id, page_id }`.
4. Para cada change de `leadgen`, em sequência (não paralelo — evita
   estourar rate limit da Graph API em picos de anúncio):
   - `GET https://graph.facebook.com/{GRAPH_VERSION}/{leadgen_id}` com
     `access_token=META_PAGE_ACCESS_TOKEN` e
     `fields=field_data,ad_id,form_id`. Retorna `field_data`: array de
     `{ name, values }` — mapeia `full_name`/`first_name`+`last_name`,
     `phone_number`, `email` pelos nomes de campo que a Meta usa.
   - `GET https://graph.facebook.com/{GRAPH_VERSION}/{ad_id}?fields=name`
     com o mesmo token, pro nome do anúncio.
   - Cada chamada: até 2 tentativas com um retry simples (a Graph API
     falha transitoriamente às vezes); erro definitivo é logado
     (`console.error`) e a change é pulada — não derruba o webhook
     inteiro.
5. Normaliza telefone: reaproveita a mesma lógica de
   `normalizarWhatsapp` de `src/app/corretor/actions.ts` (dígitos, default
   `55` quando vem sem DDI) — extrai para um helper compartilhado em
   `src/lib/whatsapp.ts` usado pelos dois lugares.
6. Insere em `leads` via `createClient()` de `@/lib/supabase/public`
   (mesma chave anon de `api/leads`):

```ts
await supabase.from("leads").upsert(
  {
    meta_lead_id: leadgenId,
    nome,
    telefone,
    email,
    tipo: "comprador",
    origem: "meta/leadads",
    anuncio_origem: nomeAnuncio,
    consentimento_lgpd: true, // implícito no consentimento do form da Meta
    corretor_id: null,        // trigger distribuir_lead() decide
  },
  { onConflict: "meta_lead_id", ignoreDuplicates: true },
);
```

   `ignoreDuplicates: true` é o que torna reentrega da Meta um no-op em vez
   de duplicar o lead (e, mais importante, em vez de disparar a roleta de
   novo pra um lead que já tem dono).
7. Responde `{ ok: true }`, 200 — sempre, mesmo se alguma change
   individual falhou (erros já foram logados no passo 4).

### Erros

- Assinatura inválida → 401, não loga corpo (pode ser lixo/ataque).
- JSON inválido → 400.
- Falha de Graph API numa change → loga, pula essa change, continua as
  outras, ainda responde 200 no fim (a Meta reenviaria em loop num erro
  5xx, o que não ajuda numa falha que não é transitória de rede).
- Falha de insert no Supabase → loga, continua pras próximas changes,
  ainda 200.

## UI — toggle de pausa

`src/app/corretor/(painel)/equipe/page.tsx`: cada linha da tabela "Carga
por corretor" ganha um toggle de `em_pausa` (componente novo
`TogglePausa.tsx`, mesmo padrão de client component com `useTransition`
que `SeletorDono.tsx` já usa).

Server Action nova em `actions.ts`:

```ts
export async function alternarPausa(corretorId: string, pausado: boolean): Promise<ResultadoAcao>
```

Mesmo formato de `atribuirLead`: checa `souGestor()`, faz o update,
confere `data.length`, `revalidatePath("/corretor/equipe")`.

## Variáveis de ambiente novas

Só servidor (sem prefixo `NEXT_PUBLIC_`):

- `META_WEBHOOK_VERIFY_TOKEN` — string arbitrária escolhida por quem
  configura; usada na verificação do `GET`.
- `META_APP_SECRET` — do painel do app Meta.
- `META_PAGE_ACCESS_TOKEN` — token de longa duração da página.
- `META_GRAPH_VERSION` — opcional, default `"v20.0"` no código se ausente.

## Testes

- Unitário: normalização de telefone (helper `src/lib/whatsapp.ts`) —
  casos sem DDI, com DDI, com/sem 9º dígito, inválido.
- Unitário: verificação de assinatura HMAC — corpo válido/inválido,
  header ausente.
- Manual: Meta Lead Ads Testing Tool (documentado no passo a passo abaixo)
  contra o endpoint publicado (Vercel preview ou produção — a Meta não
  alcança `localhost`; testar local exige túnel, mencionado como opção no
  passo a passo).
- Manual: dois leads inseridos na mesma janela (`INSERT` direto via SQL em
  duas sessões `psql` simultâneas, ou script que dispara upserts em
  paralelo) para confirmar que o advisory lock evita atribuir os dois ao
  mesmo corretor quando há mais de um elegível.

## Passo a passo (Meta for Developers)

1. **Criar o app**: developers.facebook.com → Meus Apps → Criar App → tipo
   "Empresa". Anotar o App ID e, em Configurações → Básico, o App Secret
   (`META_APP_SECRET`).
2. **Adicionar o produto Webhooks**: no painel do app, Adicionar Produto →
   Webhooks.
3. **Adicionar o produto Lead Ads** (ou "Página" com permissão
   `leads_retrieval`): necessário pra Graph API liberar
   `GET /{leadgen_id}`.
4. **Gerar o Page Access Token de longa duração**:
   - Graph API Explorer → selecionar o app → gerar token de usuário com
     permissões `pages_show_list`, `pages_manage_ads`,
     `leads_retrieval`, `pages_read_engagement`.
   - Trocar o token de usuário de curta duração por um de longa duração
     (`GET /oauth/access_token?grant_type=fb_exchange_token&...`).
   - Trocar o token de longa duração de usuário por um token de **página**
     de longa duração: `GET /me/accounts` com o token de usuário — pega o
     `access_token` da página específica. Esse é o
     `META_PAGE_ACCESS_TOKEN` (não expira enquanto o usuário admin mantiver
     a permissão).
5. **Configurar o webhook**: no produto Webhooks do app, "Callback URL" =
   `https://<domínio>/api/webhooks/meta`, "Verify Token" = o mesmo valor
   colocado em `META_WEBHOOK_VERIFY_TOKEN`. Clicar em Verificar — deve
   bater com o `GET` implementado.
6. **Assinar o campo `leadgen`**: na página do app, Webhooks → Página →
   assinar o campo `leadgen` para a Página específica (não basta assinar
   no nível do app; precisa assinar a página em
   `POST /{page-id}/subscribed_apps`).
7. **Testar**: Meta Lead Ads Testing Tool
   (developers.facebook.com/tools/lead-ads-testing) → selecionar a
   página e um formulário de teste → "Enviar lead de teste". Confirma que
   o lead aparece em `/corretor/leads` (ou `/corretor/funil`) com
   `origem = "meta/leadads"` e corretor atribuído.
8. **Variáveis de ambiente**: em produção (Vercel) e em `.env.local`,
   preencher os quatro valores acima.
