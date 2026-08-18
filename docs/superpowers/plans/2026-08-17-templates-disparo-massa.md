# Templates de mensagem + disparo de WhatsApp em massa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtros na tela `/corretor/leads`, templates de mensagem por corretor, seleção múltipla de leads, e um botão que abre uma aba `wa.me` por lead selecionado em sequência (com delay), registrando cada disparo em `historico_envios`.

**Architecture:** Duas tabelas novas (`templates_mensagens`, `historico_envios`), RLS restrita ao próprio corretor (gestor só lê o histórico de todos, nunca dispara em nome de ninguém). Filtros e seleção são client-side dentro de `ListaLeads.tsx` — a lista de leads já vem inteira do servidor. O "disparo em massa" é um loop `async` no navegador que abre `window.open` por lead com espera aleatória de 5–15s entre cada abertura; não existe envio automático de verdade sem a API oficial do WhatsApp Business (decisão registrada no spec — fora de escopo deste plano).

**Tech Stack:** Next.js 16 (Server Actions, Server Components), Supabase (RLS), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-templates-disparo-massa-design.md`

## Global Constraints

- `wa.me` nunca envia sozinho — o corretor sempre clica "enviar" na aba que abre. Nenhuma task deste plano deve prometer envio automático.
- Templates são só do dono (`corretor_id`), sem compartilhamento — cada corretor mantém a própria lista.
- `historico_envios.status_envio` só grava `"aberto"` (texto livre, não enum) — é tudo que dá pra confirmar sem API oficial.
- Filtro de "status" reaproveita `ETAPAS_FUNIL`/`ETAPA_LABEL` já existentes (`src/lib/types.ts`) — não criar campo `status` novo.
- `NavMobileBottom.tsx` não ganha aba nova (5 vagas já ocupadas) — acesso a templates no mobile é só via link dentro do modal de envio.
- Toda Server Action nova segue o padrão já estabelecido em `src/app/corretor/actions.ts`: `exigirSessao()` no início, `.select("id")` no update/insert pra conferir linhas afetadas antes de reportar sucesso.

---

## Task 1: Migration `0013_templates_historico.sql`, aplicar e regenerar tipos

**Files:**
- Create: `supabase/migrations/0013_templates_historico.sql`
- Modify: `src/lib/supabase/types.ts` (adiciona `templates_mensagens` e `historico_envios` ao `Database["public"]["Tables"]`, seguindo exatamente o formato das tabelas existentes — ver `corretores`/`leads` no mesmo arquivo)

**Interfaces:**
- Produces: tabelas `templates_mensagens` (`id`, `corretor_id`, `titulo`, `conteudo`, `padrao`, `created_at`) e `historico_envios` (`id`, `lead_id`, `corretor_id`, `mensagem_enviada`, `status_envio`, `created_at`). Task 3 (`getMeusTemplates`) e Task 4 (Server Actions) leem/escrevem essas colunas — os nomes têm que bater exatamente.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/0013_templates_historico.sql`:

```sql
-- Templates de mensagem por corretor e histórico de disparo em massa.
--
-- `wa.me` nunca envia sozinho -- quem manda a mensagem de fato é sempre um
-- clique humano dentro do WhatsApp Web/app. `historico_envios` registra
-- "esta aba foi aberta com este texto", não "esta mensagem foi entregue" --
-- é tudo que dá pra confirmar sem a API oficial do WhatsApp Business.

create table templates_mensagens (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references corretores(id) on delete cascade,
  titulo text not null,
  -- Variáveis: {{nome_lead}}, {{nome_corretor}}, {{telefone_corretor}}.
  conteudo text not null,
  padrao boolean not null default false,
  created_at timestamptz not null default now()
);

create table historico_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  corretor_id uuid not null references corretores(id) on delete cascade,
  -- Texto já com as variáveis substituídas -- o que de fato foi aberto no
  -- WhatsApp daquele lead, não o template genérico.
  mensagem_enviada text not null,
  -- Só existe 'aberto' por enquanto. Texto livre, não enum, pra não
  -- precisar de migration quando a API oficial trouxer status de verdade.
  status_envio text not null default 'aberto',
  created_at timestamptz not null default now()
);

alter table templates_mensagens enable row level security;
alter table historico_envios enable row level security;

create policy "corretor gerencia os proprios templates"
  on templates_mensagens for all
  to authenticated
  using (corretor_id = corretor_atual())
  with check (corretor_id = corretor_atual());

grant select, insert, update, delete on templates_mensagens to authenticated;

create policy "corretor grava seu envio"
  on historico_envios for insert
  to authenticated
  with check (corretor_id = corretor_atual());

create policy "corretor le os seus, gestor le todos historico"
  on historico_envios for select
  to authenticated
  using (eh_gestor() or corretor_id = corretor_atual());

grant select, insert on historico_envios to authenticated;
```

- [ ] **Step 2: Aplicar no Supabase real e verificar**

Usar a conexão Postgres já disponível nesta sessão (mesmo método das migrations
0008–0012: `pg` client via pooler, `begin`/`query(sql)`/`commit`). Depois de
aplicar, confirmar com uma query direta:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('templates_mensagens', 'historico_envios');

select policyname from pg_policies
 where tablename in ('templates_mensagens', 'historico_envios');
```

Esperado: as duas tabelas e as três policies (`"corretor gerencia os proprios
templates"`, `"corretor grava seu envio"`, `"corretor le os seus, gestor le
todos historico"`) aparecem.

- [ ] **Step 3: Atualizar `src/lib/supabase/types.ts` manualmente**

O `supabase gen types` local exige Docker (indisponível neste ambiente, mesmo
problema das migrations anteriores). Adicionar as duas tabelas ao objeto
`Database["public"]["Tables"]`, em ordem alfabética junto das existentes,
seguindo exatamente o formato de `corretores`/`leads` no mesmo arquivo
(`Row`/`Insert`/`Update`/`Relationships`):

```ts
historico_envios: {
  Row: {
    id: string
    lead_id: string | null
    corretor_id: string
    mensagem_enviada: string
    status_envio: string
    created_at: string
  }
  Insert: {
    id?: string
    lead_id?: string | null
    corretor_id: string
    mensagem_enviada: string
    status_envio?: string
    created_at?: string
  }
  Update: {
    id?: string
    lead_id?: string | null
    corretor_id?: string
    mensagem_enviada?: string
    status_envio?: string
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "historico_envios_lead_id_fkey"
      columns: ["lead_id"]
      isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "historico_envios_corretor_id_fkey"
      columns: ["corretor_id"]
      isOneToOne: false
      referencedRelation: "corretores"
      referencedColumns: ["id"]
    },
  ]
}
templates_mensagens: {
  Row: {
    id: string
    corretor_id: string
    titulo: string
    conteudo: string
    padrao: boolean
    created_at: string
  }
  Insert: {
    id?: string
    corretor_id: string
    titulo: string
    conteudo: string
    padrao?: boolean
    created_at?: string
  }
  Update: {
    id?: string
    corretor_id?: string
    titulo?: string
    conteudo?: string
    padrao?: boolean
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "templates_mensagens_corretor_id_fkey"
      columns: ["corretor_id"]
      isOneToOne: false
      referencedRelation: "corretores"
      referencedColumns: ["id"]
    },
  ]
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros (nenhum código ainda usa as tabelas novas, então isso só
confirma que o `types.ts` editado à mão está sintaticamente correto).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_templates_historico.sql src/lib/supabase/types.ts
git commit -m "Migration 0013: templates_mensagens e historico_envios"
```

---

## Task 2: `src/lib/mensagem.ts` — substituição de variáveis no template

**Files:**
- Create: `src/lib/mensagem.ts`
- Create: `src/lib/mensagem.test.ts`

**Interfaces:**
- Produces: `preencherTemplate(conteudo: string, vars: VariaveisTemplate): string` e o tipo `VariaveisTemplate = { nomeLead: string; nomeCorretor: string; telefoneCorretor: string }` — a Task 7 (`EnviarEmMassa.tsx`) importa os dois de `@/lib/mensagem`.

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `src/lib/mensagem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { preencherTemplate } from "./mensagem";

const VARS = {
  nomeLead: "Maria",
  nomeCorretor: "João",
  telefoneCorretor: "5511999998888",
};

describe("preencherTemplate", () => {
  it("substitui as três variáveis", () => {
    const resultado = preencherTemplate(
      "Olá {{nome_lead}}, aqui é {{nome_corretor}}, meu contato é {{telefone_corretor}}.",
      VARS,
    );
    expect(resultado).toBe("Olá Maria, aqui é João, meu contato é 5511999998888.");
  });

  it("substitui a mesma variável repetida mais de uma vez", () => {
    const resultado = preencherTemplate("{{nome_lead}}, {{nome_lead}}!", VARS);
    expect(resultado).toBe("Maria, Maria!");
  });

  it("não quebra quando falta variável no texto", () => {
    const resultado = preencherTemplate("Mensagem fixa sem variável nenhuma.", VARS);
    expect(resultado).toBe("Mensagem fixa sem variável nenhuma.");
  });

  it("ignora chaves desconhecidas, sem tentar substituir", () => {
    const resultado = preencherTemplate("{{campo_invalido}} olá {{nome_lead}}", VARS);
    expect(resultado).toBe("{{campo_invalido}} olá Maria");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/mensagem.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/lib/mensagem.ts`**

```ts
export type VariaveisTemplate = {
  nomeLead: string;
  nomeCorretor: string;
  telefoneCorretor: string;
};

/** Troca as três variáveis conhecidas pelo valor do lead/corretor atual. */
export function preencherTemplate(conteudo: string, vars: VariaveisTemplate): string {
  return conteudo
    .replaceAll("{{nome_lead}}", vars.nomeLead)
    .replaceAll("{{nome_corretor}}", vars.nomeCorretor)
    .replaceAll("{{telefone_corretor}}", vars.telefoneCorretor);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/mensagem.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mensagem.ts src/lib/mensagem.test.ts
git commit -m "Adiciona preencherTemplate para variaveis de mensagem"
```

---

## Task 3: Tipo `TemplateMensagem` + `getMeusTemplates()`

**Files:**
- Modify: `src/lib/types.ts` (novo tipo, perto de `Lead`/`OrigemAtribuicao`)
- Modify: `src/lib/corretorSessao.ts` (nova função, junto de `getEquipeAtiva` no fim do arquivo)

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server` (já importado em `corretorSessao.ts`).
- Produces: `TemplateMensagem = { id: string; titulo: string; conteudo: string; padrao: boolean }` (`@/lib/types`) e `getMeusTemplates(): Promise<TemplateMensagem[]>` (`@/lib/corretorSessao`) — a Task 5 (página de templates) e a Task 8 (`ListaLeads`/modal) consomem os dois.

- [ ] **Step 1: Adicionar o tipo em `src/lib/types.ts`**

Logo depois do bloco de `OrigemAtribuicao`/`ORIGEM_ATRIBUICAO_LABEL` (antes de
`export type Lead`):

```ts
/** Modelo de mensagem que o corretor reutiliza no disparo em massa. */
export type TemplateMensagem = {
  id: string;
  titulo: string;
  conteudo: string;
  padrao: boolean;
};
```

- [ ] **Step 2: Adicionar `getMeusTemplates()` em `src/lib/corretorSessao.ts`**

No fim do arquivo, depois de `getEquipeAtiva`:

```ts
/**
 * Templates do corretor logado, mais recentes primeiro. RLS (0013) já
 * garante que só os próprios aparecem — sem `.eq` explícito de propósito,
 * como as outras consultas desta camada.
 */
export async function getMeusTemplates(): Promise<TemplateMensagem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates_mensagens")
    .select("id, titulo, conteudo, padrao")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao carregar os templates: ${error.message}`);
  return (data ?? []) as TemplateMensagem[];
}
```

Adicionar `TemplateMensagem` ao import de tipos no topo do arquivo (mesma
linha de `type { CorretorPerfil, EtapaFunil, Lead, OrigemAtribuicao }`).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/corretorSessao.ts
git commit -m "Adiciona TemplateMensagem e getMeusTemplates"
```

---

## Task 4: Server Actions de templates e histórico

**Files:**
- Modify: `src/app/corretor/actions.ts`

**Interfaces:**
- Consumes: `getCorretorLogado` de `@/lib/corretorSessao` (novo import nesta task).
- Produces: `criarTemplate`, `editarTemplate`, `apagarTemplate`, `registrarEnvio` — a Task 5 (`GerenciarTemplates.tsx`) usa as três primeiras, a Task 7 (`EnviarEmMassa.tsx`) usa `registrarEnvio`.

- [ ] **Step 1: Importar `getCorretorLogado`**

Em `src/app/corretor/actions.ts`, mudar:

```ts
import { souGestor } from "@/lib/corretorSessao";
```

para:

```ts
import { getCorretorLogado, souGestor } from "@/lib/corretorSessao";
```

- [ ] **Step 2: Adicionar as quatro Server Actions**

No fim do arquivo, depois de `definirVisitaEm`:

```ts
/**
 * Cria um template. `padrao: true` desmarca qualquer outro padrão do mesmo
 * corretor antes de gravar o novo — só um padrão por vez.
 */
export async function criarTemplate(
  titulo: string,
  conteudo: string,
  padrao: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const tituloLimpo = titulo.trim();
  const conteudoLimpo = conteudo.trim();
  if (tituloLimpo.length < 2 || tituloLimpo.length > 120) {
    return { erro: "Informe um título entre 2 e 120 caracteres." };
  }
  if (conteudoLimpo.length < 2 || conteudoLimpo.length > 2000) {
    return { erro: "A mensagem precisa ter entre 2 e 2000 caracteres." };
  }

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  if (padrao) {
    await supabase
      .from("templates_mensagens")
      .update({ padrao: false })
      .eq("corretor_id", corretor.id)
      .eq("padrao", true);
  }

  const { data, error } = await supabase
    .from("templates_mensagens")
    .insert({ corretor_id: corretor.id, titulo: tituloLimpo, conteudo: conteudoLimpo, padrao })
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Não foi possível salvar o template." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/** Edita um template existente. Mesma regra de `padrao` de `criarTemplate`. */
export async function editarTemplate(
  id: string,
  titulo: string,
  conteudo: string,
  padrao: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const tituloLimpo = titulo.trim();
  const conteudoLimpo = conteudo.trim();
  if (tituloLimpo.length < 2 || tituloLimpo.length > 120) {
    return { erro: "Informe um título entre 2 e 120 caracteres." };
  }
  if (conteudoLimpo.length < 2 || conteudoLimpo.length > 2000) {
    return { erro: "A mensagem precisa ter entre 2 e 2000 caracteres." };
  }

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  if (padrao) {
    await supabase
      .from("templates_mensagens")
      .update({ padrao: false })
      .eq("corretor_id", corretor.id)
      .eq("padrao", true)
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("templates_mensagens")
    .update({ titulo: tituloLimpo, conteudo: conteudoLimpo, padrao })
    .eq("id", id)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este template não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/** Apaga um template. Sem confirmação no servidor — a UI confirma antes de chamar. */
export async function apagarTemplate(id: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const { data, error } = await supabase
    .from("templates_mensagens")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return { erro: "Não foi possível apagar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este template não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/**
 * Registra que uma aba de WhatsApp foi aberta para este lead com esta
 * mensagem. Não confirma entrega — `wa.me` não permite isso; é só o
 * registro de que o corretor dsparou o envio em massa para este contato.
 */
export async function registrarEnvio(leadId: string, mensagem: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  const { error } = await supabase.from("historico_envios").insert({
    lead_id: leadId,
    corretor_id: corretor.id,
    mensagem_enviada: mensagem,
  });

  if (error) {
    return { erro: "Não foi possível registrar o envio." };
  }

  return {};
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/corretor/actions.ts
git commit -m "Adiciona Server Actions de templates e historico de envio"
```

---

## Task 5: Página `/corretor/templates`

**Files:**
- Create: `src/app/corretor/(painel)/templates/page.tsx`
- Create: `src/app/corretor/(painel)/templates/GerenciarTemplates.tsx`
- Modify: `src/app/corretor/(painel)/NavPainel.tsx`

**Interfaces:**
- Consumes: `getMeusTemplates` (Task 3), `criarTemplate`/`editarTemplate`/`apagarTemplate` (Task 4).
- Produces: rota `/corretor/templates`. Nenhuma task depende diretamente dela (a Task 7 só linka pra cá).

- [ ] **Step 1: Criar `GerenciarTemplates.tsx`**

Criar `src/app/corretor/(painel)/templates/GerenciarTemplates.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { apagarTemplate, criarTemplate, editarTemplate } from "@/app/corretor/actions";
import type { TemplateMensagem } from "@/lib/types";

const VARIAVEIS_DISPONIVEIS = "{{nome_lead}}, {{nome_corretor}}, {{telefone_corretor}}";

export function GerenciarTemplates({ templatesIniciais }: { templatesIniciais: TemplateMensagem[] }) {
  const [templates, setTemplates] = useState(templatesIniciais);
  const [editando, setEditando] = useState<TemplateMensagem | null>(null);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [padrao, setPadrao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarTransicao] = useTransition();

  function iniciarEdicao(template: TemplateMensagem | null) {
    setEditando(template);
    setTitulo(template?.titulo ?? "");
    setConteudo(template?.conteudo ?? "");
    setPadrao(template?.padrao ?? false);
    setErro(null);
  }

  function salvar() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = editando
        ? await editarTemplate(editando.id, titulo, conteudo, padrao)
        : await criarTemplate(titulo, conteudo, padrao);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      // Sem endpoint de listagem própria neste componente: a Server Action já
      // revalida a rota, então um recarregamento simples da página reflete o
      // estado novo. Aqui só fecha o formulário.
      iniciarEdicao(null);
      window.location.reload();
    });
  }

  function apagar(id: string) {
    if (!confirm("Apagar este template?")) return;
    iniciarTransicao(async () => {
      const resultado = await apagarTemplate(id);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setTemplates((atual) => atual.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-5">
        <h2 className="text-fluid-sm font-medium text-mist-100">
          {editando ? "Editar template" : "Novo template"}
        </h2>
        <p className="text-fluid-xs mt-1 text-mist-500">Variáveis disponíveis: {VARIAVEIS_DISPONIVEIS}</p>

        <div className="mt-4 space-y-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ex.: Primeiro contato)"
            className="text-fluid-sm w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
          />
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Olá {{nome_lead}}, aqui é {{nome_corretor}}..."
            rows={4}
            className="text-fluid-sm w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
          />
          <label className="flex items-center gap-2 text-fluid-sm text-mist-300">
            <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
            Usar como padrão
          </label>

          {erro && (
            <p role="alert" className="text-fluid-xs text-sand-300">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={salvando || titulo.trim().length < 2 || conteudo.trim().length < 2}
              onClick={salvar}
              className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {editando ? "Salvar" : "Criar"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => iniciarEdicao(null)}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {templates.length === 0 && (
          <p className="text-fluid-sm text-mist-400">Nenhum template ainda.</p>
        )}
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-fluid-sm text-mist-50">
                {template.titulo} {template.padrao && <span className="text-brand-300">· padrão</span>}
              </p>
              <p className="text-fluid-xs mt-1 truncate text-mist-400">{template.conteudo}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => iniciarEdicao(template)}
                className="text-fluid-xs text-brand-200 underline-offset-4 hover:underline"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => apagar(template.id)}
                className="text-fluid-xs text-sand-300 underline-offset-4 hover:underline"
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `page.tsx`**

Criar `src/app/corretor/(painel)/templates/page.tsx`:

```tsx
import type { Metadata } from "next";
import { GerenciarTemplates } from "./GerenciarTemplates";
import { getMeusTemplates } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await getMeusTemplates();

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">Templates de mensagem</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        Modelos que você usa no disparo em massa. Só você vê e edita os seus.
      </p>
      <div className="mt-6">
        <GerenciarTemplates templatesIniciais={templates} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar a aba em `NavPainel.tsx`**

Em `src/app/corretor/(painel)/NavPainel.tsx`, no array `ABAS`, adicionar
depois de `"/corretor/links"`:

```ts
{ href: "/corretor/templates", label: "Templates" },
```

- [ ] **Step 4: Type-check e lint**

Run: `npx tsc --noEmit && npx eslint src/app/corretor/"(painel)"/templates`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

`npm run dev`, logar, ir em `/corretor/templates`, criar um template,
marcar como padrão, criar um segundo marcando padrão também — confirmar que
o primeiro perde o selo "padrão" ao recarregar. Editar e apagar um
template.

- [ ] **Step 6: Commit**

```bash
git add "src/app/corretor/(painel)/templates" "src/app/corretor/(painel)/NavPainel.tsx"
git commit -m "Pagina de gerenciar templates de mensagem"
```

---

## Task 6: Checkbox de seleção em `CartaoLead.tsx`

**Files:**
- Modify: `src/app/corretor/(painel)/_componentes/CartaoLead.tsx`

**Interfaces:**
- Produces: `CartaoLead` ganha props opcionais `selecionavel?: boolean`, `selecionado?: boolean`, `aoAlternarSelecao?: () => void`. Sem esses props, comportamento idêntico ao atual (o `Cartao` do funil, em `Quadro.tsx`, não usa `CartaoLead` e não é afetado). Task 8 (`ListaLeads.tsx`) passa os três props novos.

- [ ] **Step 1: Adicionar os props e o checkbox**

Em `src/app/corretor/(painel)/_componentes/CartaoLead.tsx`, mudar a
assinatura:

```tsx
export function CartaoLead({
  lead,
  mostrarDono = false,
  selecionavel = false,
  selecionado = false,
  aoAlternarSelecao,
}: {
  lead: Lead;
  mostrarDono?: boolean;
  selecionavel?: boolean;
  selecionado?: boolean;
  aoAlternarSelecao?: () => void;
}) {
```

No início do `<article>`, antes do `<div className="flex flex-wrap items-start justify-between gap-2">` já existente, adicionar:

```tsx
{selecionavel && (
  <label className="mb-3 flex items-center gap-2 text-fluid-xs text-mist-400">
    <input type="checkbox" checked={selecionado} onChange={aoAlternarSelecao} />
    Selecionar
  </label>
)}
```

- [ ] **Step 2: Type-check e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/corretor/(painel)/_componentes/CartaoLead.tsx"`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/corretor/(painel)/_componentes/CartaoLead.tsx"
git commit -m "CartaoLead ganha checkbox de selecao opcional"
```

---

## Task 7: Modal `EnviarEmMassa.tsx`

**Files:**
- Create: `src/app/corretor/(painel)/leads/EnviarEmMassa.tsx`

**Interfaces:**
- Consumes: `preencherTemplate` (Task 2, `@/lib/mensagem`), `registrarEnvio` (Task 4, `@/app/corretor/actions`), `normalizarWhatsapp` (`@/lib/whatsapp`, já existe), `linkWhatsappPara` (`@/lib/site`, já existe), `Lead`/`TemplateMensagem` (`@/lib/types`).
- Produces: componente `EnviarEmMassa` — a Task 8 (`ListaLeads.tsx`) é a única consumidora.

- [ ] **Step 1: Criar o componente**

Criar `src/app/corretor/(painel)/leads/EnviarEmMassa.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { registrarEnvio } from "@/app/corretor/actions";
import { preencherTemplate } from "@/lib/mensagem";
import { linkWhatsappPara } from "@/lib/site";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import type { Lead, TemplateMensagem } from "@/lib/types";

function espera(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Espera aleatória de 5 a 15s entre cada aba aberta. */
function proximaEspera(): number {
  return 5000 + Math.random() * 10000;
}

export function EnviarEmMassa({
  leadsSelecionados,
  templates,
  nomeCorretor,
  whatsappCorretor,
  onFechar,
}: {
  leadsSelecionados: Lead[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
  onFechar: () => void;
}) {
  const [templateId, setTemplateId] = useState(
    templates.find((t) => t.padrao)?.id ?? templates[0]?.id ?? "",
  );
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [concluido, setConcluido] = useState(false);
  const canceladoRef = useRef(false);

  const templateEscolhido = templates.find((t) => t.id === templateId) ?? null;

  const comTelefoneValido = useMemo(
    () => leadsSelecionados.filter((lead) => lead.telefone && normalizarWhatsapp(lead.telefone)),
    [leadsSelecionados],
  );

  const previa = useMemo(() => {
    if (!templateEscolhido || leadsSelecionados.length === 0) return "";
    return preencherTemplate(templateEscolhido.conteudo, {
      nomeLead: leadsSelecionados[0].nome,
      nomeCorretor,
      telefoneCorretor: whatsappCorretor,
    });
  }, [templateEscolhido, leadsSelecionados, nomeCorretor, whatsappCorretor]);

  async function disparar() {
    if (!templateEscolhido) return;
    setEnviando(true);
    canceladoRef.current = false;

    for (const lead of comTelefoneValido) {
      if (canceladoRef.current) break;

      const numero = normalizarWhatsapp(lead.telefone!);
      if (!numero) continue;

      const mensagem = preencherTemplate(templateEscolhido.conteudo, {
        nomeLead: lead.nome,
        nomeCorretor,
        telefoneCorretor: whatsappCorretor,
      });

      window.open(linkWhatsappPara(numero, mensagem), "_blank");
      await registrarEnvio(lead.id, mensagem);
      setProgresso((atual) => atual + 1);

      if (lead !== comTelefoneValido[comTelefoneValido.length - 1]) {
        await espera(proximaEspera());
      }
    }

    setEnviando(false);
    setConcluido(true);
  }

  function fechar() {
    canceladoRef.current = true;
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-ink-900 p-6 sm:rounded-2xl">
        <h2 className="font-display text-lg text-mist-50">
          Enviar mensagem para {leadsSelecionados.length} contato{leadsSelecionados.length === 1 ? "" : "s"}
        </h2>

        {comTelefoneValido.length < leadsSelecionados.length && (
          <p className="text-fluid-xs mt-2 text-sand-300">
            {leadsSelecionados.length - comTelefoneValido.length} sem telefone válido — serão pulados.
          </p>
        )}

        {templates.length === 0 ? (
          <p className="text-fluid-sm mt-4 text-mist-300">
            Você ainda não tem template.{" "}
            <Link href="/corretor/templates" className="text-brand-200 underline-offset-4 hover:underline">
              Criar um agora
            </Link>
            .
          </p>
        ) : (
          <>
            <label className="text-fluid-xs mt-4 block text-mist-400" htmlFor="template-massa">
              Template
            </label>
            <select
              id="template-massa"
              value={templateId}
              disabled={enviando}
              onChange={(e) => setTemplateId(e.target.value)}
              className="text-fluid-sm mt-1 w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </select>

            {previa && (
              <p className="text-fluid-sm mt-3 rounded-xl border border-white/5 bg-ink-950/50 px-4 py-3 whitespace-pre-line text-mist-200">
                {previa}
              </p>
            )}

            {!enviando && !concluido && (
              <p className="text-fluid-xs mt-3 text-mist-500">
                Seu navegador pode pedir permissão pra abrir múltiplas janelas — permita para o envio
                continuar.
              </p>
            )}

            {(enviando || concluido) && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${(progresso / comTelefoneValido.length) * 100}%` }}
                  />
                </div>
                <p className="text-fluid-xs mt-2 text-mist-400">
                  {concluido
                    ? `Enviado para ${progresso} de ${comTelefoneValido.length}.`
                    : `${progresso} de ${comTelefoneValido.length}...`}
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              {!enviando && !concluido && (
                <button
                  type="button"
                  disabled={!templateEscolhido || comTelefoneValido.length === 0}
                  onClick={disparar}
                  className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  Confirmar disparo
                </button>
              )}
              <button
                type="button"
                onClick={fechar}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                {concluido ? "Fechar" : "Cancelar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/corretor/(painel)/leads/EnviarEmMassa.tsx"`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/corretor/(painel)/leads/EnviarEmMassa.tsx"
git commit -m "Modal de disparo de WhatsApp em massa"
```

---

## Task 8: Filtros e seleção em `ListaLeads.tsx` + `leads/page.tsx`

**Files:**
- Modify: `src/app/corretor/(painel)/leads/page.tsx`
- Modify: `src/app/corretor/(painel)/leads/ListaLeads.tsx`

**Interfaces:**
- Consumes: `EnviarEmMassa` (Task 7), `CartaoLead` com os props novos (Task 6), `getEquipeAtiva`/`getMeusTemplates`/`getCorretorLogado` (`@/lib/corretorSessao`).

- [ ] **Step 1: Passar os dados novos de `page.tsx` pra `ListaLeads`**

Reescrever `src/app/corretor/(painel)/leads/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ListaLeads } from "./ListaLeads";
import {
  getCorretorLogado,
  getEquipeAtiva,
  getMeusLeads,
  getMeusTemplates,
  souGestor,
} from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Meus leads" };

export default async function LeadsPage() {
  const [leads, gestor, corretor, templates] = await Promise.all([
    getMeusLeads(),
    souGestor(),
    getCorretorLogado(),
    getMeusTemplates(),
  ]);
  const equipe = gestor ? await getEquipeAtiva() : [];

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">{gestor ? "Contatos" : "Meus leads"}</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        {gestor
          ? "Todos os contatos recebidos pelos formulários do site, dos mais recentes aos mais antigos."
          : "Contatos que chegaram atribuídos a você — pelo seu link pessoal ou pela distribuição automática."}
      </p>

      <ListaLeads
        leads={leads}
        gestor={gestor}
        equipe={equipe}
        templates={templates}
        nomeCorretor={corretor?.nome ?? ""}
        whatsappCorretor={corretor?.whatsapp ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `ListaLeads.tsx` com filtros, seleção e o botão de disparo**

Substituir o conteúdo de `src/app/corretor/(painel)/leads/ListaLeads.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CartaoLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { EnviarEmMassa } from "./EnviarEmMassa";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil, type Lead, type TemplateMensagem } from "@/lib/types";

type Filtro = "todos" | "novos" | "negociando" | "frios";

export function ListaLeads({
  leads,
  gestor,
  equipe,
  templates,
  nomeCorretor,
  whatsappCorretor,
}: {
  leads: Lead[];
  gestor: boolean;
  equipe: { id: string; nome: string }[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [corretorFiltro, setCorretorFiltro] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaFunil | "">("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState(false);

  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      if (filtro === "novos" && !["novo", "primeiro_contato"].includes(lead.etapa)) return false;
      if (
        filtro === "negociando" &&
        !["visita_agendada", "proposta_enviada", "negociacao"].includes(lead.etapa)
      )
        return false;
      if (filtro === "frios" && !["perdido", "fechado"].includes(lead.etapa)) return false;

      if (corretorFiltro && lead.corretor?.id !== corretorFiltro) return false;
      if (etapaFiltro && lead.etapa !== etapaFiltro) return false;

      if (dataDe && lead.criadoEm < dataDe) return false;
      if (dataAte && lead.criadoEm > `${dataAte}T23:59:59`) return false;

      if (busca) {
        const alvo = `${lead.nome} ${lead.telefone ?? ""}`.toLowerCase();
        if (!alvo.includes(busca.toLowerCase())) return false;
      }

      return true;
    });
  }, [leads, filtro, corretorFiltro, etapaFiltro, dataDe, dataAte, busca]);

  const todosFiltradosSelecionados =
    leadsFiltrados.length > 0 && leadsFiltrados.every((l) => selecionados.has(l.id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (todosFiltradosSelecionados) {
        leadsFiltrados.forEach((l) => novo.delete(l.id));
      } else {
        leadsFiltrados.forEach((l) => novo.add(l.id));
      }
      return novo;
    });
  }

  const leadsSelecionados = leads.filter((l) => selecionados.has(l.id));

  return (
    <div>
      {leads.length > 0 && (
        <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {(["todos", "novos", "negociando", "frios"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filtro === f
                  ? "bg-brand-500 text-white"
                  : "bg-ink-900/50 text-mist-400 hover:bg-ink-800 hover:text-mist-200"
              }`}
            >
              {f === "todos" && "Todos"}
              {f === "novos" && "Novos/Quentes"}
              {f === "negociando" && "Em Negociação"}
              {f === "frios" && "Frios/Concluídos"}
            </button>
          ))}
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {gestor && (
            <select
              value={corretorFiltro}
              onChange={(e) => setCorretorFiltro(e.target.value)}
              className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
            >
              <option value="">Todos os corretores</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value as EtapaFunil | "")}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          >
            <option value="">Todas as etapas</option>
            {ETAPAS_FUNIL.map((etapa) => (
              <option key={etapa} value={etapa}>
                {ETAPA_LABEL[etapa]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dataDe}
            onChange={(e) => setDataDe(e.target.value)}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          />
          <input
            type="date"
            value={dataAte}
            onChange={(e) => setDataAte(e.target.value)}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200 sm:col-span-2 lg:col-span-4"
          />
        </div>
      )}

      {leadsFiltrados.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-fluid-xs text-mist-400">
          <input type="checkbox" checked={todosFiltradosSelecionados} onChange={alternarSelecaoTodos} />
          Selecionar todos ({leadsFiltrados.length})
        </label>
      )}

      {leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <p className="text-fluid-sm text-mist-300">
            Nenhum contato ainda. Compartilhe seu link pessoal — todo formulário preenchido a
            partir dele chega aqui com seu nome.
          </p>
          <Link
            href="/corretor/links"
            className="text-fluid-sm mt-3 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Pegar meus links →
          </Link>
        </div>
      ) : leadsFiltrados.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6 text-center">
          <p className="text-fluid-sm text-mist-400">Nenhum lead encontrado neste filtro.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4 pb-24">
          {leadsFiltrados.map((lead) => (
            <CartaoLead
              key={lead.id}
              lead={lead}
              mostrarDono={gestor}
              selecionavel
              selecionado={selecionados.has(lead.id)}
              aoAlternarSelecao={() => alternarSelecao(lead.id)}
            />
          ))}
        </div>
      )}

      {selecionados.size > 0 && !modalAberto && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 p-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-fluid-sm text-mist-200">{selecionados.size} selecionado(s)</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setModalAberto(true)}
                className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white"
              >
                Enviar mensagem
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <EnviarEmMassa
          leadsSelecionados={leadsSelecionados}
          templates={templates}
          nomeCorretor={nomeCorretor}
          whatsappCorretor={whatsappCorretor}
          onFechar={() => {
            setModalAberto(false);
            setSelecionados(new Set());
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/corretor/(painel)/leads"`
Expected: sem erros.

- [ ] **Step 4: Teste manual**

`npm run dev`, logar como gestor (pra ver o filtro de corretor), ir em
`/corretor/leads`:
- Filtrar por etapa, por data, buscar por nome — conferir que a lista muda.
- Selecionar 2 leads via checkbox, conferir que a barra fixa aparece com a
  contagem certa.
- "Selecionar todos" com um filtro ativo, confirmar que só os leads
  filtrados entram na seleção.
- Abrir o modal, escolher template, ver a prévia com o nome do primeiro
  lead selecionado, confirmar disparo com pelo menos 2 leads com telefone
  válido — as abas do WhatsApp abrem em sequência com espera perceptível
  entre elas, barra de progresso avança.
- Conferir no banco (`select * from historico_envios order by created_at desc`)
  que uma linha foi gravada por lead.

- [ ] **Step 5: Commit**

```bash
git add "src/app/corretor/(painel)/leads/page.tsx" "src/app/corretor/(painel)/leads/ListaLeads.tsx"
git commit -m "Filtros, selecao multipla e disparo em massa na tela de leads"
```

---

## Task 9: Suíte completa

- [ ] **Step 1: Rodar tudo**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: todos passam.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: compila sem erro (confirma que `types.ts` editado à mão na Task 1
está correto e que nenhuma página quebra em build-time).

- [ ] **Step 3: Revisar o diff final contra o spec**

Conferir, lendo o diff de todas as tasks contra
`docs/superpowers/specs/2026-08-17-templates-disparo-massa-design.md`, que
nada ficou de fora: as duas tabelas, RLS, filtros (corretor/etapa/data/busca),
seleção múltipla, modal com prévia e progresso, templates CRUD com padrão
único, histórico gravado por envio.
