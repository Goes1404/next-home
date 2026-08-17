# Webhook Meta Lead Ads + ajuste da roleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber leads do Meta Lead Ads (Instagram/Facebook Ads) via webhook, gravá-los em `leads` reaproveitando a roleta já existente, e fechar a lacuna de concorrência da roleta + o campo `em_pausa` que ela precisa.

**Architecture:** Rota Next.js (`runtime = "nodejs"`) recebe o evento `leadgen`, valida a assinatura HMAC, busca os dados do lead e o nome do anúncio na Graph API, normaliza o telefone, e insere em `leads` com a chave anon do Supabase (mesmo padrão de `POST /api/leads`) — o trigger `distribuir_lead()` do banco decide o corretor. Sem fila, sem serviço novo.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Supabase (Postgres + `@supabase/supabase-js` client anon), TypeScript, Vitest (novo, para os dois helpers puros: normalização de telefone e verificação de assinatura).

**Spec:** `docs/superpowers/specs/2026-08-17-webhook-meta-lead-ads-design.md`

## Global Constraints

- `runtime = "nodejs"` em toda rota nova (padrão do projeto, ver `src/app/api/leads/route.ts:5`).
- Nunca usar `service_role` — o insert do webhook usa a mesma chave anon de `src/lib/supabase/public.ts`, confiando em RLS + trigger.
- `meta_lead_id` é a chave de idempotência: reenvio do mesmo `leadgen_id` pela Meta nunca deve duplicar lead nem redisparar a roleta.
- Telefone sem DDI normaliza para `+55` (mercado brasileiro do site).
- `em_pausa` e `ativo` **ambos** tiram o corretor da roleta.
- Verificação de assinatura usa `crypto.timingSafeEqual` (comparação de tempo constante) — nunca `===` em segredo.
- `POST /api/webhooks/meta` sempre responde 200 quando a assinatura é válida e o JSON é parseável, mesmo se uma change individual falhar — evita a Meta reentrar em loop de retry.
- Vars de ambiente novas (`META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_VERSION`) são só-servidor, sem prefixo `NEXT_PUBLIC_`.

---

## Task 1: Extrair helper de telefone + configurar Vitest

O projeto não tem runner de testes unitários hoje (só Playwright, sem specs escritas). Este é o primeiro código que precisa de teste unitário de verdade, então a task monta o Vitest junto.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/whatsapp.ts`
- Create: `src/lib/whatsapp.test.ts`
- Modify: `package.json` (devDependency `vitest`, script `test`)
- Modify: `src/app/corretor/actions.ts:29-37` (remove a função local, importa do lib)

**Interfaces:**
- Produces: `normalizarWhatsapp(bruto: string): string | null` — exportada de `src/lib/whatsapp.ts`. Task 2 e a Task 4 (webhook) importam esta função para normalizar o telefone do lead.

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Adicionar o script de teste ao `package.json`**

Em `"scripts"`, junto dos existentes (`dev`, `build`, `start`, `lint`):

```json
"test": "vitest run"
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Escrever o teste (vai falhar — `src/lib/whatsapp.ts` ainda não existe)**

Criar `src/lib/whatsapp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizarWhatsapp } from "./whatsapp";

describe("normalizarWhatsapp", () => {
  it("adiciona o DDI 55 a um número local de 11 dígitos (com 9º dígito)", () => {
    expect(normalizarWhatsapp("11987654321")).toBe("5511987654321");
  });

  it("adiciona o DDI 55 a um número local de 10 dígitos (sem 9º dígito)", () => {
    expect(normalizarWhatsapp("1132654321")).toBe("551132654321");
  });

  it("mantém um número que já vem com o DDI 55", () => {
    expect(normalizarWhatsapp("5511987654321")).toBe("5511987654321");
  });

  it("aceita o número formatado, ignorando pontuação", () => {
    expect(normalizarWhatsapp("(11) 98765-4321")).toBe("5511987654321");
  });

  it("rejeita número curto demais para ser válido", () => {
    expect(normalizarWhatsapp("123456789")).toBeNull();
  });

  it("rejeita número com DDI diferente de 55 e mais de 11 dígitos", () => {
    expect(normalizarWhatsapp("12125551234567")).toBeNull();
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: FAIL — `Cannot find module './whatsapp'` (ou equivalente).

- [ ] **Step 6: Criar `src/lib/whatsapp.ts`**

Move a lógica que já existe em `src/app/corretor/actions.ts:29-37`, sem alterar o comportamento:

```ts
/** Mantém só dígitos e garante o formato E.164 brasileiro que `wa.me` espera. */
export function normalizarWhatsapp(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  // 10-11 dígitos = número local, sem código do país; 12-13 já vem com o 55.
  if (digitos.length <= 11) return `55${digitos}`;
  if (digitos.length <= 13 && digitos.startsWith("55")) return digitos;
  return null;
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 8: Atualizar `src/app/corretor/actions.ts` para usar o helper**

Remover a função local (linhas 29-37) e adicionar o import:

```ts
import { normalizarWhatsapp } from "@/lib/whatsapp";
```

O restante do arquivo (uso em `salvarPerfil`, linha ~85) não muda.

- [ ] **Step 9: Verificar que nada quebrou**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.ts src/lib/whatsapp.ts src/lib/whatsapp.test.ts src/app/corretor/actions.ts package.json package-lock.json
git commit -m "Extrai normalizarWhatsapp para src/lib e adiciona Vitest"
```

---

## Task 2: Helper de verificação de assinatura HMAC do webhook

**Files:**
- Create: `src/lib/metaWebhookSignature.ts`
- Create: `src/lib/metaWebhookSignature.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `assinaturaValida(corpoBruto: string, headerAssinatura: string | null, appSecret: string): boolean` — a Task 4 (rota do webhook) usa esta função para validar `X-Hub-Signature-256` antes de processar o corpo.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/lib/metaWebhookSignature.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaValida } from "./metaWebhookSignature";

const SEGREDO = "segredo-de-teste";

function assinar(corpo: string, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

describe("assinaturaValida", () => {
  it("aceita uma assinatura correta", () => {
    const corpo = '{"entry":[]}';
    expect(assinaturaValida(corpo, assinar(corpo), SEGREDO)).toBe(true);
  });

  it("rejeita quando o corpo foi alterado depois de assinado", () => {
    const assinatura = assinar('{"entry":[]}');
    expect(assinaturaValida('{"entry":["adulterado"]}', assinatura, SEGREDO)).toBe(false);
  });

  it("rejeita quando o segredo usado para assinar é outro", () => {
    const corpo = '{"entry":[]}';
    expect(assinaturaValida(corpo, assinar(corpo, "outro-segredo"), SEGREDO)).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(assinaturaValida('{"entry":[]}', null, SEGREDO)).toBe(false);
  });

  it("rejeita header sem o prefixo sha256=", () => {
    const corpo = '{"entry":[]}';
    const semPrefixo = assinar(corpo).replace("sha256=", "");
    expect(assinaturaValida(corpo, semPrefixo, SEGREDO)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/metaWebhookSignature.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/lib/metaWebhookSignature.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIXO = "sha256=";

/**
 * Confere o header `X-Hub-Signature-256` que a Meta manda em todo webhook.
 *
 * Compara com `timingSafeEqual`, e não `===`: comparar segredo por igualdade
 * simples vaza, por tempo de resposta, quantos bytes iniciais bateram — o
 * tipo de brecha que um HMAC existe justamente para fechar.
 */
export function assinaturaValida(
  corpoBruto: string,
  headerAssinatura: string | null,
  appSecret: string,
): boolean {
  if (!headerAssinatura?.startsWith(PREFIXO)) return false;

  const recebida = Buffer.from(headerAssinatura.slice(PREFIXO.length), "hex");
  const esperada = Buffer.from(
    createHmac("sha256", appSecret).update(corpoBruto).digest("hex"),
    "hex",
  );

  if (recebida.length !== esperada.length) return false;
  return timingSafeEqual(recebida, esperada);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/metaWebhookSignature.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/metaWebhookSignature.ts src/lib/metaWebhookSignature.test.ts
git commit -m "Adiciona verificacao de assinatura HMAC do webhook da Meta"
```

---

## Task 3: Migration `0008_webhook_meta.sql`

Só SQL — sem teste automatizado (não há Supabase local linkado neste ambiente; ver Step 4 para a verificação manual, igual ao padrão das migrations 0006/0007 anteriores).

**Files:**
- Create: `supabase/migrations/0008_webhook_meta.sql`

**Interfaces:**
- Produces: colunas `leads.meta_lead_id` (text, unique), `leads.anuncio_origem` (text), `corretores.em_pausa` (boolean); policy de update em `corretores` para gestor. A Task 4 (webhook) grava em `meta_lead_id`/`anuncio_origem`; a Task 5 (UI) grava em `em_pausa`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/0008_webhook_meta.sql`:

```sql
-- Webhook Meta Lead Ads: novas colunas de lead, pausa temporária de
-- corretor, e a trava de concorrência que a roleta precisa agora que leads
-- podem chegar em rajada (vários anúncios gerando lead no mesmo segundo).

-- ---------------------------------------------------------------------------
-- 1. Leads vindos da Meta
-- ---------------------------------------------------------------------------

alter table leads
  -- Identifica o lead na origem. `unique` permite qualquer quantidade de
  -- linhas com NULL (leads do site continuam sem valor aqui) e é o que torna
  -- o insert do webhook idempotente a reenvios do mesmo evento.
  add column meta_lead_id text unique,
  -- Nome do anúncio (não o ad_id bruto) — o corretor não decora ID de anúncio.
  add column anuncio_origem text;

-- ---------------------------------------------------------------------------
-- 2. Pausa temporária de corretor
-- ---------------------------------------------------------------------------
--
-- Diferente de `ativo` (desligamento, perde cadastro publicável): em_pausa é
-- férias/folga — mesmo cadastro, mesmo login, só fora da roleta enquanto
-- durar.

alter table corretores
  add column em_pausa boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Roleta: filtro de pausa + trava de concorrência
-- ---------------------------------------------------------------------------
--
-- A seleção de corretor lê `count`/`max` de `leads` via subquery, sem travar
-- linha nenhuma. Em READ COMMITTED, dois leads entrando no mesmo segundo (o
-- caso que o webhook torna comum) podem escolher o mesmo corretor, porque
-- nenhuma das duas transações concorrentes enxerga o insert da outra antes de
-- qualquer uma commitar. `pg_advisory_xact_lock` serializa as execuções desta
-- função: quem chega depois espera a primeira liberar (fim da transação)
-- antes de rodar sua própria seleção — nesse ponto já enxerga o lead que
-- acabou de entrar.

create or replace function public.distribuir_lead() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
   where c.ativo
     and not c.em_pausa
     and c.user_id is not null
     and c.slug is not null
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Gestor pode alternar a escala
-- ---------------------------------------------------------------------------
--
-- `corretores` hoje só tem a policy de select pública (0001) — nenhum update
-- é possível pelo cliente autenticado. Sem isso o toggle de em_pausa não tem
-- como gravar.

create policy "gestor atualiza escala"
  on corretores for update
  to authenticated
  using (eh_gestor())
  with check (eh_gestor());

grant update (ativo, em_pausa) on corretores to authenticated;
```

- [ ] **Step 2: Verificar sintaxe localmente**

Sem Postgres local neste projeto (não há `supabase/config.toml`). Verificar a
sintaxe com um parser sem precisar de banco:

Run: `node -e "require('fs').readFileSync('supabase/migrations/0008_webhook_meta.sql','utf8')"`
Expected: sem erro de leitura (checagem mínima de que o arquivo está bem formado/salvo). A validação real de sintaxe SQL acontece no Step 4.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_webhook_meta.sql
git commit -m "Migration 0008: colunas do webhook Meta, em_pausa e trava da roleta"
```

- [ ] **Step 4: Aplicar e verificar (manual, fora deste ambiente)**

Este ambiente não tem acesso ao projeto Supabase real (`prhhrqyubjcafvucirri`, ver `src/lib/supabase/types.ts:2`). Quem tiver acesso ao dashboard (ou a um `supabase` CLI linkado) precisa:

1. Rodar o SQL da migration (SQL Editor do dashboard, ou `supabase db push` se o projeto estiver linkado).
2. Confirmar que a policy nova existe: `select * from pg_policies where tablename = 'corretores';` deve listar `"gestor atualiza escala"`.
3. Testar a trava de concorrência — em duas sessões `psql` (ou duas abas do SQL Editor) simultâneas, com pelo menos dois corretores elegíveis cadastrados:

```sql
-- sessão A e sessão B, disparadas o mais próximo possível uma da outra
insert into leads (nome, telefone, consentimento_lgpd)
values ('Teste concorrência', '5511999999999', true)
returning corretor_id;
```

   Esperado: os dois inserts retornam `corretor_id` de corretores **diferentes** (ou o mesmo corretor só se havia apenas um elegível) — nunca o mesmo corretor recebendo os dois quando havia mais de um disponível.
4. Regenerar `src/lib/supabase/types.ts` via Management API (`types/typescript`), como nas migrations anteriores (ver comentário no topo do arquivo).

---

## Task 4: Rota do webhook `src/app/api/webhooks/meta/route.ts`

**Files:**
- Create: `src/app/api/webhooks/meta/route.ts`
- Modify: `.env.example` (variáveis novas, comentadas)

**Interfaces:**
- Consumes: `normalizarWhatsapp` (Task 1, `@/lib/whatsapp`), `assinaturaValida` (Task 2, `@/lib/metaWebhookSignature`), `createClient` de `@/lib/supabase/public` (já existe, mesmo uso de `src/app/api/leads/route.ts:3`).
- Produces: `GET /api/webhooks/meta` (verificação) e `POST /api/webhooks/meta` (recepção) — endpoints finais, nenhuma task depende deles.

- [ ] **Step 1: Criar o arquivo com os dois handlers**

Criar `src/app/api/webhooks/meta/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/metaWebhookSignature";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";

/** GET: desafio de verificação que a Meta manda ao salvar a Callback URL. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && desafio) {
    return new NextResponse(desafio, { status: 200 });
  }
  return new NextResponse("Verificação inválida.", { status: 403 });
}

type ChangeLeadgen = {
  field: string;
  value?: {
    leadgen_id?: string;
    ad_id?: string;
    form_id?: string;
    page_id?: string;
  };
};

type EventoWebhook = {
  entry?: { changes?: ChangeLeadgen[] }[];
};

type CampoLead = { name: string; values?: string[] };

/** Um campo do formulário da Meta pode vir com um destes nomes. */
function campo(campos: CampoLead[], ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const achado = campos.find((c) => c.name === nome);
    const valor = achado?.values?.[0]?.trim();
    if (valor) return valor;
  }
  return null;
}

async function buscarComRetry(url: string, tentativas = 2): Promise<Response | null> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) return resposta;
    } catch {
      // tenta de novo
    }
  }
  return null;
}

async function buscarDadosDoLead(leadgenId: string, token: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,ad_id&access_token=${token}`;
  const resposta = await buscarComRetry(url);
  if (!resposta) return null;

  const corpo = (await resposta.json()) as { field_data?: CampoLead[]; ad_id?: string };
  const campos = corpo.field_data ?? [];

  const nome = campo(campos, "full_name") ?? campo(campos, "first_name");
  const telefoneBruto = campo(campos, "phone_number");
  const email = campo(campos, "email");

  if (!nome || !telefoneBruto) return null;

  const telefone = normalizarWhatsapp(telefoneBruto);
  if (!telefone) return null;

  return { nome, telefone, email, adId: corpo.ad_id };
}

async function buscarNomeDoAnuncio(adId: string, token: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=name&access_token=${token}`;
  const resposta = await buscarComRetry(url);
  if (!resposta) return null;
  const corpo = (await resposta.json()) as { name?: string };
  return corpo.name ?? null;
}

/** POST: evento leadgen. Sempre responde 200 quando assinatura e JSON são válidos. */
export async function POST(req: Request) {
  const corpoBruto = await req.text();

  if (!assinaturaValida(corpoBruto, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET ?? "")) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  let evento: EventoWebhook;
  try {
    evento = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN ?? "";
  const supabase = createClient();

  const changes =
    evento.entry?.flatMap((entry) => entry.changes ?? []).filter((c) => c.field === "leadgen") ?? [];

  for (const change of changes) {
    const leadgenId = change.value?.leadgen_id;
    const adId = change.value?.ad_id;
    if (!leadgenId) continue;

    try {
      const dados = await buscarDadosDoLead(leadgenId, token);
      if (!dados) {
        console.error(`Webhook Meta: não foi possível obter dados do lead ${leadgenId}`);
        continue;
      }

      const anuncioOrigem = adId ? await buscarNomeDoAnuncio(adId, token) : null;

      const { error } = await supabase.from("leads").upsert(
        {
          meta_lead_id: leadgenId,
          nome: dados.nome,
          telefone: dados.telefone,
          email: dados.email,
          tipo: "comprador",
          origem: "meta/leadads",
          anuncio_origem: anuncioOrigem,
          consentimento_lgpd: true,
          corretor_id: null,
        },
        { onConflict: "meta_lead_id", ignoreDuplicates: true },
      );

      if (error) {
        console.error(`Webhook Meta: falha ao inserir lead ${leadgenId}: ${error.message}`);
      }
    } catch (e) {
      console.error(`Webhook Meta: erro processando ${leadgenId}:`, e);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se `leads` no `Database` type ainda não tiver `meta_lead_id`/`anuncio_origem` — porque a Task 3 só teve a migration aplicada manualmente fora deste ambiente — o `.upsert` vai reclamar de propriedade desconhecida. Nesse caso, gere localmente um type-stub mínimo ou aguarde a regeneração de `src/lib/supabase/types.ts` do Step 4 da Task 3 antes deste type-check; documente qual dos dois caminhos foi seguido no commit.)

- [ ] **Step 3: Atualizar `.env.example`**

Adicionar ao final do arquivo:

```
# Webhook do Meta Lead Ads (Instagram/Facebook Ads) — ver o passo a passo em
# docs/superpowers/specs/2026-08-17-webhook-meta-lead-ads-design.md.
# Nunca prefixar com NEXT_PUBLIC_: são segredos usados só no servidor.
META_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=
META_GRAPH_VERSION=v20.0
```

- [ ] **Step 4: Teste manual com a Meta Lead Ads Testing Tool**

Publicar a branch em preview (Vercel) ou expor `localhost` via túnel, configurar o webhook no app Meta (ver passo a passo na spec), enviar um lead de teste pela [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing) e confirmar em `/corretor/leads` que o lead aparece com `origem = "meta/leadads"` e um corretor atribuído.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/meta/route.ts .env.example
git commit -m "Adiciona o webhook de recepcao de leads do Meta Lead Ads"
```

---

## Task 5: Toggle de pausa no painel `/corretor/equipe`

**Files:**
- Modify: `src/lib/corretorSessao.ts:161-173` (`getEquipeAtiva` passa a trazer `em_pausa`)
- Modify: `src/app/corretor/actions.ts` (nova Server Action `alternarPausa`)
- Create: `src/app/corretor/(painel)/equipe/TogglePausa.tsx`
- Modify: `src/app/corretor/(painel)/equipe/page.tsx` (nova coluna na tabela "Carga por corretor")

**Interfaces:**
- Consumes: `souGestor` (já existe, `@/lib/corretorSessao`), padrão de Server Action de `atribuirLead` (`src/app/corretor/actions.ts:211-238`).
- Produces: `alternarPausa(corretorId: string, pausado: boolean): Promise<ResultadoAcao>` — só usada pelo `TogglePausa.tsx` desta task.

- [ ] **Step 1: Ampliar `getEquipeAtiva` para trazer `em_pausa`**

Em `src/lib/corretorSessao.ts`, mudar a função (linhas 161-173):

```ts
export async function getEquipeAtiva(): Promise<
  { id: string; nome: string; emPausa: boolean }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretores")
    .select("id, nome, em_pausa")
    .eq("ativo", true)
    .not("slug", "is", null)
    .not("user_id", "is", null)
    .order("nome");

  if (error) throw new Error(`Falha ao listar a equipe: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, emPausa: c.em_pausa }));
}
```

- [ ] **Step 2: Adicionar a Server Action `alternarPausa`**

Em `src/app/corretor/actions.ts`, junto de `atribuirLead` (mesmo arquivo, final):

```ts
/**
 * Liga/desliga a pausa temporária de um corretor na escala da roleta. Só
 * gestor — mesma checagem de `atribuirLead`.
 */
export async function alternarPausa(
  corretorId: string,
  pausado: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  if (!(await souGestor())) {
    return { erro: "Só quem é gestor pode alterar a escala." };
  }

  const { data, error } = await supabase
    .from("corretores")
    .update({ em_pausa: pausado })
    .eq("id", corretorId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Corretor não encontrado." };
  }

  revalidatePath("/corretor/equipe");
  return {};
}
```

- [ ] **Step 3: Criar `TogglePausa.tsx`**

Criar `src/app/corretor/(painel)/equipe/TogglePausa.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { alternarPausa } from "@/app/corretor/actions";

/** Liga/desliga a pausa de um corretor na escala da roleta. */
export function TogglePausa({ corretorId, emPausa }: { corretorId: string; emPausa: boolean }) {
  const [pausado, setPausado] = useState(emPausa);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarTransicao] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={pausado}
        aria-label={pausado ? "Tirar da pausa" : "Colocar em pausa"}
        disabled={salvando}
        onClick={() => {
          const novoValor = !pausado;
          setPausado(novoValor);
          setErro(null);
          iniciarTransicao(async () => {
            const resultado = await alternarPausa(corretorId, novoValor);
            if (resultado.erro) {
              setPausado(!novoValor);
              setErro(resultado.erro);
            }
          });
        }}
        className={`text-fluid-xs rounded-full border px-3 py-1 transition-colors disabled:opacity-50 ${
          pausado
            ? "border-sand-300/40 bg-sand-300/10 text-sand-300"
            : "border-white/15 bg-ink-950 text-mist-300"
        }`}
      >
        {pausado ? "Em pausa" : "Na escala"}
      </button>
      {erro && (
        <span role="alert" className="text-fluid-xs text-sand-300">
          {erro}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Adicionar a coluna na tabela de `equipe/page.tsx`**

Em `src/app/corretor/(painel)/equipe/page.tsx`:

Adicionar o import:

```ts
import { TogglePausa } from "./TogglePausa";
```

`montarResumo` (linhas 20-37) precisa carregar `emPausa` — mudar a assinatura e o retorno:

```ts
type LinhaResumo = {
  id: string;
  nome: string;
  emPausa: boolean;
  total: number;
  novos: number;
  fechados: number;
  porRoleta: number;
};

function montarResumo(
  leads: Lead[],
  equipe: { id: string; nome: string; emPausa: boolean }[],
): LinhaResumo[] {
  return equipe
    .map((corretor) => {
      const meus = leads.filter((lead) => lead.corretor?.id === corretor.id);
      return {
        id: corretor.id,
        nome: corretor.nome,
        emPausa: corretor.emPausa,
        total: meus.length,
        novos: meus.filter((l) => l.etapa === "novo").length,
        fechados: meus.filter((l) => l.etapa === "fechado").length,
        porRoleta: meus.filter((l) => l.origemAtribuicao === "roleta").length,
      };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}
```

Na tabela "Carga por corretor" (linhas 82-105), adicionar uma coluna:

```tsx
<thead>
  <tr className="text-fluid-xs text-mist-500">
    <th className="border-b border-white/10 py-2 pr-4 font-normal">Corretor</th>
    <th className="border-b border-white/10 py-2 pr-4 font-normal">Escala</th>
    <th className="border-b border-white/10 py-2 pr-4 font-normal">Total</th>
    <th className="border-b border-white/10 py-2 pr-4 font-normal">Novos</th>
    <th className="border-b border-white/10 py-2 pr-4 font-normal">Fechados</th>
    <th className="border-b border-white/10 py-2 font-normal">Pela roleta</th>
  </tr>
</thead>
<tbody>
  {resumo.map((linha) => (
    <tr key={linha.id} className="text-fluid-sm text-mist-200">
      <td className="border-b border-white/5 py-2.5 pr-4">{linha.nome}</td>
      <td className="border-b border-white/5 py-2.5 pr-4">
        <TogglePausa corretorId={linha.id} emPausa={linha.emPausa} />
      </td>
      <td className="border-b border-white/5 py-2.5 pr-4">{linha.total}</td>
      <td className="border-b border-white/5 py-2.5 pr-4">{linha.novos}</td>
      <td className="border-b border-white/5 py-2.5 pr-4">{linha.fechados}</td>
      <td className="border-b border-white/5 py-2.5">{linha.porRoleta}</td>
    </tr>
  ))}
</tbody>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros. (Mesma ressalva da Task 4 Step 2: `em_pausa` só existe em
`src/lib/supabase/types.ts` depois que alguém aplicar a migration 0008 e
regenerar os tipos — Task 3 Step 4. Até lá este type-check falha por
propriedade desconhecida, o que é esperado, não um bug desta task.)

- [ ] **Step 6: Teste manual**

`npm run dev`, logar como gestor, ir em `/corretor/equipe`, clicar no toggle de um corretor, confirmar que o rótulo muda para "Em pausa" e persiste após recarregar a página. Confirmar que um corretor comum (não-gestor) nem chega nesta página (`notFound()` em `page.tsx:42`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/corretorSessao.ts src/app/corretor/actions.ts src/app/corretor/(painel)/equipe/TogglePausa.tsx "src/app/corretor/(painel)/equipe/page.tsx"
git commit -m "Painel de equipe ganha toggle de pausa temporaria na escala"
```

---

## Task 6: Documentar o passo a passo de configuração do app Meta

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nada (documentação).
- Produces: nada (terminal).

- [ ] **Step 1: Adicionar seção ao `README.md`**

Adicionar, próximo de onde o README já documenta variáveis de ambiente (ou ao final, se não houver seção equivalente):

```markdown
## Webhook do Meta Lead Ads

Leads de anúncio do Instagram/Facebook chegam via
`POST /api/webhooks/meta`. Passo a passo de configuração:

1. **Criar o app**: developers.facebook.com → Meus Apps → Criar App → tipo
   "Empresa". Anotar o App ID e, em Configurações → Básico, o App Secret
   (`META_APP_SECRET`).
2. **Adicionar o produto Webhooks** ao app.
3. **Adicionar o produto Lead Ads** (ou "Página" com permissão
   `leads_retrieval`) — necessário para a Graph API liberar
   `GET /{leadgen_id}`.
4. **Gerar o Page Access Token de longa duração**:
   - Graph API Explorer → selecionar o app → gerar token de usuário com
     `pages_show_list`, `pages_manage_ads`, `leads_retrieval`,
     `pages_read_engagement`.
   - Trocar por um token de usuário de longa duração
     (`GET /oauth/access_token?grant_type=fb_exchange_token&...`).
   - Trocar pelo token da **página** (`GET /me/accounts` com o token de
     usuário) — esse é o `META_PAGE_ACCESS_TOKEN`.
5. **Configurar o webhook**: Callback URL =
   `https://<domínio>/api/webhooks/meta`, Verify Token = o mesmo valor de
   `META_WEBHOOK_VERIFY_TOKEN`.
6. **Assinar o campo `leadgen`** para a Página específica (não basta
   assinar no nível do app).
7. **Testar**: [Lead Ads Testing
   Tool](https://developers.facebook.com/tools/lead-ads-testing) →
   selecionar a página e um formulário de teste → enviar lead de teste →
   conferir em `/corretor/leads`.
8. Preencher `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`,
   `META_PAGE_ACCESS_TOKEN` em produção (Vercel) e em `.env.local`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Documenta o passo a passo de configuracao do webhook Meta Lead Ads"
```

---

## Task 7: Suíte completa

- [ ] **Step 1: Rodar tudo**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: todos passam.

- [ ] **Step 2: Revisar o diff final contra a spec**

Conferir, lendo o diff de todas as tasks contra
`docs/superpowers/specs/2026-08-17-webhook-meta-lead-ads-design.md`, que
nada ficou de fora (checklist na seção seguinte deste plano já faz essa
conferência — usar como referência).
