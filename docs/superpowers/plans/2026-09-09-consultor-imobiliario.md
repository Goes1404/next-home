# Consultor imobiliário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um chat no painel em que o corretor pergunta sobre o portfólio e sobre o negócio imobiliário (crédito, objeção, documentação) e recebe resposta ancorada no catálogo real, com cartão de imóvel, simulação de financiamento calculada em código e um botão de copiar no tom de WhatsApp.

**Architecture:** Módulo próprio `src/lib/consultor/` no molde do Estúdio (0096): duas tabelas (conversa + mensagens), leitura pelo cliente de sessão e escrita pela service key. O prompt é montado por código a partir de três blocos determinísticos (catálogo completo, parâmetros de crédito da tabela nova, objeções reais do corpus). Uma chamada de LLM por turno via `chamarLlmJson`. A IA nunca calcula e nunca escreve URL: ela devolve slugs e um pedido de simulação; o código resolve cartão e faz a conta.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind v4, `llm.ts` (OpenAI `gpt-4.1-mini`, motor único).

**Spec:** `docs/superpowers/specs/2026-09-09-consultor-imobiliario-design.md`

## Global Constraints

- **Antes de escrever qualquer código de Next.js, ler o guia em `node_modules/next/dist/docs/`.** Esta versão tem breaking changes em relação ao que o modelo "sabe" (regra do `AGENTS.md`).
- **Cada tarefa começa invocando a skill indicada no cabeçalho dela.** É a seção "Ordem de construção" da spec; não é cerimônia.
- **Módulo puro × `server-only`:** valor (constante) compartilhado entre servidor e cliente NUNCA mora em módulo com `import "server-only"` — o build reprova. Tipo viaja de graça. Lições do `limitesPdf.ts` e do `pessoasTipos.ts`.
- **Toda tabela nova leva `revoke all ... from anon`** e policies com `to authenticated`. `tabelasSeguras.test.ts` cobra isso sozinho.
- **`src/lib/supabase/types.ts` é declarado À MÃO.** Nunca regerar: o gerador apaga as 34 uniões de CHECK.
- **Migrations desta entrega: `0101` e `0102`.** Sem buraco na numeração (`migrations.test.ts`).
- **Comentário explica o PORQUÊ, em português.** É o padrão da base inteira.
- **Testes:** `npx vitest run <arquivo>`. Lint: `npx eslint <arquivos>` (a catraca `scripts/lintTeto.mjs` não roda no Windows — `spawnSync npx ENOENT`).
- **Commits frequentes**, um por tarefa no mínimo, mensagem em português.
- **Preço ENTRA no prompt deste chat.** `semValores.ts` não se aplica aqui — quem lê é o corretor. Está escrito na spec para ninguém "consertar" depois.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/corretor/(painel)/_componentes/chatTipos.ts` | **PURO.** `MensagemDeChat<D>`, `PerguntaDeChat`, `ConversaDeChat` — o que a casca de chat precisa saber, sem conhecer domínio. |
| `src/app/corretor/(painel)/_componentes/ChatBase.tsx` | Casca genérica (já existe; passa a ser genérica). |
| `supabase/migrations/0101_consultor_conversas.sql` | Duas tabelas + RLS + grants. |
| `supabase/migrations/0102_parametros_credito.sql` | Linha única seedada + função `security definer` de update. |
| `src/lib/credito/tipos.ts` | **PURO.** Forma dos parâmetros de crédito. |
| `src/lib/credito/parametros.ts` | `server-only`. Lê a tabela. |
| `src/lib/consultor/financiamento.ts` | **PURO.** A conta. |
| `src/lib/consultor/contrato.ts` | **PURO.** Tipos das mensagens + validador de jsonb. |
| `src/lib/consultor/conhecimento.ts` | **PURO.** Os três blocos do prompt. |
| `src/lib/consultor/prompt.ts` | **PURO.** Identidade, regras, ordem dos blocos. |
| `src/lib/consultor/guardrails.ts` | **PURO.** Descarta slug inexistente e número de crédito inventado. |
| `src/lib/consultor/repositorio.ts` | `server-only`. As duas tabelas. |
| `src/lib/consultor/turno.ts` | `server-only`. Uma chamada de LLM. |
| `src/app/corretor/(painel)/consultor/acoes.ts` | Server Actions. |
| `src/app/corretor/(painel)/consultor/page.tsx` | Server Component. |
| `src/app/corretor/(painel)/consultor/ChatConsultor.tsx` | `"use client"`. |
| `src/app/corretor/(painel)/admin/credito/page.tsx` + `acoes.ts` | Tela do gestor. |

---

### Task 1: A casca de chat vira genérica

> **Skill a invocar antes:** `superpowers:test-driven-development`

O `ChatBase` hoje importa `MensagemDoEstudio` e conhece os tipos `referencia`, `proposta` e `resultado` — vocabulário do Estúdio. O consultor tem outro (`cartoes`, `simulacao`, `texto_cliente`). Em vez de espalhar `if (modo === …)`, a casca passa a conhecer só o que é dela: balão, composer, rolagem e os **chips da pergunta aberta**. Todo o resto vira dois slots de render.

**Files:**
- Create: `src/app/corretor/(painel)/_componentes/chatTipos.ts`
- Modify: `src/app/corretor/(painel)/_componentes/ChatBase.tsx`
- Modify: `src/app/corretor/(painel)/_componentes/ListaDeConversas.tsx:16-28`
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx`
- Modify: `src/app/corretor/(painel)/marketing/video/ChatDeVideo.tsx`

**Interfaces:**
- Produces: `MensagemDeChat<D>`, `PerguntaDeChat`, `ConversaDeChat`; `ChatBase<D>` com as props `renderAcima?: (m) => ReactNode` e `renderAbaixo?: (m) => ReactNode` no lugar de `renderProposta`/`renderResultado`.

- [ ] **Step 1: Criar o módulo de tipos puros**

Arquivo novo `src/app/corretor/(painel)/_componentes/chatTipos.ts`:

```ts
/**
 * O que a casca de chat (`ChatBase`) precisa saber — e nada além disso.
 *
 * Módulo PURO: a casca é `"use client"`, e valor compartilhado entre servidor
 * e cliente não pode viajar dentro de módulo com `server-only` (a pedra do
 * `limitesPdf.ts`). Aqui só há tipos, que somem na compilação.
 *
 * A casca conhece UM vocabulário de `dados`: `"pergunta"`, porque os chips de
 * resposta num toque são mecanismo do chat, não do domínio. Todo o resto
 * (proposta de arte, roteiro de vídeo, cartão de imóvel, simulação) chega por
 * `renderAcima` / `renderAbaixo` — senão cada chat novo acrescentaria um
 * `if` aqui dentro, que foi exatamente o que o Estúdio começou a fazer.
 */

/** Uma pergunta de refinamento, com alternativas tocáveis. */
export type PerguntaDeChat = {
  tipo: "pergunta";
  id: string;
  texto: string;
  alternativas: string[];
};

/** O mínimo que a casca lê de uma mensagem. `D` é o vocabulário do domínio. */
export type MensagemDeChat<D extends { tipo: string } = { tipo: string }> = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: D | null;
  createdAt: string;
};

/** O mínimo que a lista lateral lê de uma conversa. */
export type ConversaDeChat = {
  id: string;
  titulo: string;
  atualizadoEm: string;
};
```

- [ ] **Step 2: Escrever o teste que trava a generalização**

Arquivo novo `src/app/corretor/(painel)/_componentes/chatBase.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte: a casca de chat não pode voltar a conhecer o
 * vocabulário de um domínio.
 *
 * A regressão falha CALADA — o Estúdio continua funcionando e só o chat novo
 * fica sem desenhar o que é dele. Mesma classe de `escalaDoPainel.test.ts`.
 */
const BASE = join(process.cwd(), "src", "app", "corretor", "(painel)", "_componentes", "ChatBase.tsx");

/** Comentário citando um tipo não é uso dele — a guarda tem de tirar antes de acusar. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("ChatBase é genérica", () => {
  const fonte = semComentarios(readFileSync(BASE, "utf8"));

  it("não importa nada do Estúdio", () => {
    expect(fonte).not.toContain("@/lib/estudio/contrato");
  });

  it("conhece só o vocabulário do chat: pergunta", () => {
    for (const doDominio of ["proposta", "resultado", "referencia"]) {
      expect(fonte, `ChatBase não pode conhecer "${doDominio}"`).not.toContain(`"${doDominio}"`);
    }
    expect(fonte).toContain('"pergunta"');
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run "src/app/corretor/(painel)/_componentes/chatBase.test.ts"`
Expected: FAIL — o arquivo ainda importa `@/lib/estudio/contrato` e cita `"proposta"`.

- [ ] **Step 4: Generalizar a `ChatBase`**

Trocar o import do topo:

```tsx
import type { MensagemDeChat, PerguntaDeChat } from "./chatTipos";
```

Assinatura (o componente vira genérico):

```tsx
export function ChatBase<D extends { tipo: string }>({
  mensagens,
  pendente,
  pensando,
  placeholder,
  vazio,
  onEnviar,
  onEscolher,
  renderAcima,
  renderAbaixo,
  anexo,
  onAnexar,
  onRemoverAnexo,
}: {
  mensagens: MensagemDeChat<D>[];
  pendente: EnvioPendente | null;
  pensando: boolean;
  placeholder: string;
  vazio: ReactNode;
  onEnviar: (texto: string) => Promise<void>;
  onEscolher: (pergunta: PerguntaDeChat, escolha: string) => Promise<void>;
  /** Desenhado ANTES do texto do balão — a foto de referência do Estúdio. */
  renderAcima?: (m: MensagemDeChat<D>) => ReactNode;
  /** Desenhado DEPOIS do texto — proposta, resultado, cartão, simulação. */
  renderAbaixo?: (m: MensagemDeChat<D>) => ReactNode;
  anexo?: AnexoDoComposer | null;
  onAnexar?: (file: File) => void;
  onRemoverAnexo?: () => void;
}) {
```

O bloco da pergunta aberta perde o cast para o tipo do Estúdio:

```tsx
  const ultima = mensagens.at(-1);
  const perguntaAberta =
    !pendente && !pensando && ultima?.papel === "ia" && ultima.dados?.tipo === "pergunta"
      ? (ultima.dados as unknown as PerguntaDeChat)
      : null;
```

E o corpo do balão deixa de citar domínio:

```tsx
        {mensagens.map((m) => (
          <Balao key={m.id} papel={m.papel}>
            {renderAcima?.(m)}
            <p className="text-fluid-sm text-corpo whitespace-pre-line">{m.conteudo}</p>
            {renderAbaixo?.(m)}
          </Balao>
        ))}
```

- [ ] **Step 5: Mover a foto de referência para o Estúdio**

Em `ChatDeArte.tsx` e `ChatDeVideo.tsx`, trocar `renderProposta`/`renderResultado` por:

```tsx
        renderAcima={(m) =>
          m.dados?.tipo === "referencia" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.dados.url}
              alt="Foto de referência anexada"
              className="border-linha mb-1.5 max-h-44 w-auto max-w-full rounded-lg border"
            />
          ) : null
        }
        renderAbaixo={(m) => {
          if (m.dados?.tipo === "proposta") return renderProposta(m);
          if (m.dados?.tipo === "resultado") return renderResultado(m);
          return null;
        }}
```

(`renderProposta` e `renderResultado` continuam existindo como funções locais das duas telas — só deixam de ser props.)

- [ ] **Step 6: Afrouxar `ListaDeConversas` para `ConversaDeChat`**

Em `ListaDeConversas.tsx`, trocar o tipo da prop `conversas` de `ConversaDoEstudio[]` para `ConversaDeChat[]` e importar de `./chatTipos`. `ConversaDoEstudio` tem `tipo` a mais e continua atribuível.

- [ ] **Step 7: Rodar tudo**

Run: `npx vitest run "src/app/corretor/(painel)/_componentes/" && npx tsc --noEmit`
Expected: PASS, sem erro de tipo.

- [ ] **Step 8: Commit**

```bash
git add "src/app/corretor/(painel)/_componentes/" "src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx" "src/app/corretor/(painel)/marketing/video/ChatDeVideo.tsx"
git commit -m "refactor(chat): ChatBase deixa de conhecer o vocabulário do Estúdio"
```

---

### Task 2: Tabelas da conversa do consultor (0101)

> **Skill a invocar antes:** `supabase:supabase-postgres-best-practices`

**Files:**
- Create: `supabase/migrations/0101_consultor_conversas.sql`
- Modify: `src/lib/supabase/types.ts` (à mão, junto de `estudio_conversas`)

**Interfaces:**
- Produces: tabelas `consultor_conversas` e `consultor_mensagens`; `Database["public"]["Tables"]["consultor_conversas"]` e `["consultor_mensagens"]`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0101 — O consultor imobiliário: a conversa fica salva
--
-- Molde da 0096 (Estúdio), sem os vínculos de peça paga: aqui nada é gerado,
-- só respondido. `imagem_id`/`video_job_id` não existem porque coluna sem
-- sentido em metade das linhas é o que se ganha ao misturar dois domínios
-- numa tabela — foi por isso que este chat não virou `estudio.tipo`.
--
-- Quem ESCREVE é o servidor. O corretor lê a sua conversa e pode apagá-la.

create table public.consultor_conversas (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  titulo        text not null default 'Nova conversa',
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.consultor_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.consultor_conversas(id) on delete cascade,
  papel       text not null check (papel in ('corretor', 'ia')),
  conteudo    text not null,
  -- Do lado da IA: pergunta, cartões de imóvel, simulação ou texto pronto
  -- para o cliente. Do lado do corretor: a alternativa que ele tocou.
  -- A forma é validada em `consultor/contrato.ts`, não aqui — o jsonb é só
  -- transporte, e linha torta não pode derrubar a conversa inteira.
  dados       jsonb,
  created_at  timestamptz not null default now()
);

create index consultor_conversas_corretor_idx
  on public.consultor_conversas (corretor_id, atualizado_em desc);
create index consultor_mensagens_conversa_idx
  on public.consultor_mensagens (conversa_id, created_at);

alter table public.consultor_conversas enable row level security;
alter table public.consultor_mensagens enable row level security;

create policy "corretor le as proprias conversas do consultor"
  on public.consultor_conversas for select to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor apaga as proprias conversas do consultor"
  on public.consultor_conversas for delete to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor le as mensagens das proprias conversas do consultor"
  on public.consultor_mensagens for select to authenticated
  using (
    exists (
      select 1 from public.consultor_conversas c
       where c.id = conversa_id and c.corretor_id = public.corretor_atual()
    )
  );

-- Tabela nova no schema public NASCE aberta para `anon` — a chave anônima vai
-- no bundle do site por desenho. A policy já barra, mas uma policy futura sem
-- `to authenticated` reabriria isso calada (0080, 0082).
revoke all on public.consultor_conversas from anon;
revoke all on public.consultor_mensagens from anon;

revoke insert, update, truncate on public.consultor_conversas from authenticated;
revoke insert, update, delete, truncate on public.consultor_mensagens from authenticated;

comment on table public.consultor_conversas is
  'Conversas do consultor imobiliario (chat de portfolio e negocio). Escrita so pelo servidor.';
comment on table public.consultor_mensagens is
  'Mensagens do consultor. `dados` leva pergunta, cartoes de imovel, simulacao ou texto para o cliente.';
```

- [ ] **Step 2: Declarar as duas tabelas em `types.ts`**

Inserir logo antes do bloco `estudio_conversas` (ordem alfabética do arquivo):

```ts
      consultor_conversas: {
        Row: {
          atualizado_em: string
          corretor_id: string
          created_at: string
          id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          corretor_id: string
          created_at?: string
          id?: string
          titulo?: string
        }
        Update: {
          atualizado_em?: string
          corretor_id?: string
          created_at?: string
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultor_conversas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      consultor_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          dados: Json | null
          id: string
          papel: "corretor" | "ia"
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          dados?: Json | null
          id?: string
          papel: "corretor" | "ia"
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          dados?: Json | null
          id?: string
          papel?: "corretor" | "ia"
        }
        Relationships: [
          {
            foreignKeyName: "consultor_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "consultor_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Rodar as guardas de migration**

Run: `npx vitest run src/lib/migrations.test.ts src/lib/tabelasSeguras.test.ts`
Expected: PASS. Se `tabelasSeguras` reprovar, falta um `revoke all ... from anon` — é o que ela existe para pegar.

- [ ] **Step 4: Aplicar em produção e conferir NOS DOIS SENTIDOS**

Aplicar via `apply_migration` do MCP da Supabase (`execute_sql` é bloqueado para escrita). Depois, no SQL editor:

```sql
-- (1) anon não enxerga
begin;
  set local role anon;
  select count(*) from public.consultor_conversas;  -- espera: permission denied
rollback;

-- (2) o dono enxerga o que é dele
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user_id de um corretor com login>"}';
  select count(*) from public.consultor_conversas;  -- espera: 0, sem erro
rollback;
```

Conferir o segundo sentido é o passo que quase ninguém faz — consertar segurança quebrando a tela não é consertar (0077).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0101_consultor_conversas.sql src/lib/supabase/types.ts
git commit -m "feat(db): conversas do consultor imobiliário (0101)"
```

---

### Task 3: Parâmetros de crédito, seedados (0102)

> **Skill a invocar antes:** `supabase:supabase-postgres-best-practices`

A tabela nasce COM os valores de hoje. Tela de ajustes que nasce vazia é o padrão que já matou sete recursos nesta base — o consultor não pode depender de alguém abrir uma tela.

**Files:**
- Create: `supabase/migrations/0102_parametros_credito.sql`
- Create: `src/lib/credito/tipos.ts`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `ParametrosCredito`, `FaixaMcmv`, `ALIQUOTA_ITBI_PADRAO`; tabela `parametros_credito`; função `public.atualizar_parametros_credito(...)`.

- [ ] **Step 1: Escrever `src/lib/credito/tipos.ts`**

```ts
/**
 * A forma dos parâmetros de crédito — módulo PURO.
 *
 * Puro porque a tela do gestor (`"use client"`) e a conta de financiamento
 * leem a mesma forma, e importar isto de dentro de um módulo `server-only`
 * derrubaria o build do cliente.
 *
 * Estes números MUDAM: faixa do MCMV, teto de uso do FGTS, taxa de
 * referência do SBPE, alíquota de ITBI. Por isso vivem no banco, editáveis
 * pelo gestor — e por isso `conferidoEm` viaja junto. Número de crédito sem
 * data é número que ninguém sabe se ainda vale.
 */

export type FaixaMcmv = {
  /** "Faixa 1", "Faixa 2"… — o rótulo que o corretor usa ao falar. */
  nome: string;
  /** Renda familiar bruta máxima, em reais. */
  rendaMax: number;
  /** Subsídio máximo dessa faixa, em reais. 0 quando não há. */
  subsidioMaximo: number;
  /** Taxa efetiva anual, em decimal: 0.045 = 4,5% a.a. */
  taxaAnual: number;
};

export type ParametrosCredito = {
  /** Ordenadas por `rendaMax` crescente — a conta escolhe a PRIMEIRA que couber. */
  faixas: FaixaMcmv[];
  /** Valor máximo do imóvel para usar FGTS na compra. */
  tetoFgtsImovel: number;
  /** Taxa efetiva anual do SBPE, para quem está fora do MCMV. */
  taxaSbpeAnual: number;
  /** Prazo máximo de financiamento, em meses. */
  prazoMaximoMeses: number;
  /** Fração da renda que a parcela não deve passar: 0.3 = 30%. */
  comprometimentoMaximo: number;
  /** Alíquota de ITBI por cidade, em decimal: { "Barueri": 0.02 }. */
  itbiPorCidade: Record<string, number>;
  /** ISO (AAAA-MM-DD) da última conferência na fonte. */
  conferidoEm: string;
};

/**
 * Cidade fora do mapa usa 2%, que é a alíquota mais comum no estado.
 *
 * Devolver zero seria pior que uma estimativa: o corretor esqueceria o ITBI
 * na conta, e ele é o custo que mais surpreende o cliente na assinatura.
 * A simulação diz em voz alta quando usou o padrão.
 */
export const ALIQUOTA_ITBI_PADRAO = 0.02;
```

- [ ] **Step 2: Escrever a migration com o seed**

```sql
-- 0102 — Parâmetros de crédito: uma linha, seedada, editável pelo gestor
--
-- ## Por que nasce preenchida
--
-- Esta base registra sete recursos completos que nunca produziram uma linha
-- porque dependiam de alguém abrir uma tela. Tela de ajustes tem exatamente
-- esse risco. A migration escreve os valores vigentes; a tela só EDITA — o
-- consultor funciona no minuto em que subir.
--
-- ## Por que UMA linha
--
-- Não há versionamento nem histórico: o que interessa é o que vale HOJE, e
-- `conferido_em` diz há quanto tempo. Histórico de parâmetro de crédito é
-- tabela que ninguém consulta (o erro do `historico_envios`).
--
-- ## Quem escreve
--
-- Só o gestor, e só pela função abaixo. `papel` ensinou a lição: grant de
-- update numa tabela que a RLS deixa o corretor tocar é como alguém se
-- autopromove. Aqui `authenticated` só LÊ.

create table public.parametros_credito (
  id                     boolean primary key default true check (id),
  faixas                 jsonb not null,
  teto_fgts_imovel       numeric(12,2) not null,
  taxa_sbpe_anual        numeric(6,4) not null,
  prazo_maximo_meses     integer not null,
  comprometimento_maximo numeric(4,3) not null,
  itbi_por_cidade        jsonb not null,
  conferido_em           date not null,
  conferido_por          uuid references public.corretores(id) on delete set null,
  atualizado_em          timestamptz not null default now()
);

comment on column public.parametros_credito.id is
  'Sempre true: o check garante linha unica sem precisar de trigger.';

insert into public.parametros_credito (
  faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
  comprometimento_maximo, itbi_por_cidade, conferido_em
) values (
  '[
    {"nome":"Faixa 1","rendaMax":2850,"subsidioMaximo":55000,"taxaAnual":0.0450},
    {"nome":"Faixa 2","rendaMax":4700,"subsidioMaximo":29000,"taxaAnual":0.0600},
    {"nome":"Faixa 3","rendaMax":8000,"subsidioMaximo":0,"taxaAnual":0.0766},
    {"nome":"Faixa 4","rendaMax":12000,"subsidioMaximo":0,"taxaAnual":0.1000}
  ]'::jsonb,
  350000, 0.1149, 420, 0.30,
  '{"Barueri":0.02,"Osasco":0.02,"Santana de Parnaiba":0.02,"Sao Paulo":0.03}'::jsonb,
  date '2026-09-09'
);

alter table public.parametros_credito enable row level security;

create policy "todo corretor logado le os parametros de credito"
  on public.parametros_credito for select to authenticated
  using (true);

revoke all on public.parametros_credito from anon;
revoke insert, update, delete, truncate on public.parametros_credito from authenticated;

-- ---------------------------------------------------------------------------
-- A escrita, só pelo gestor
-- ---------------------------------------------------------------------------
--
-- `security definer` pelo mesmo motivo de `definir_papel_corretor`: quem
-- decide é o papel, e o papel não pode ser conferido por policy de update
-- numa tabela em que `authenticated` não tem grant nenhum.

create or replace function public.atualizar_parametros_credito(
  p_faixas                 jsonb,
  p_teto_fgts_imovel       numeric,
  p_taxa_sbpe_anual        numeric,
  p_prazo_maximo_meses     integer,
  p_comprometimento_maximo numeric,
  p_itbi_por_cidade        jsonb,
  p_conferido_em           date
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corretor uuid;
begin
  select id into v_corretor
    from public.corretores
   where user_id = auth.uid() and papel = 'gestor' and ativo;

  if v_corretor is null then
    return false;
  end if;

  -- Recusa o absurdo aqui, e não só na tela: comprometimento de 90% ou taxa
  -- negativa entrariam por qualquer chamada direta ao PostgREST, e a conta
  -- do consultor passaria a mentir para todo mundo.
  if p_comprometimento_maximo <= 0 or p_comprometimento_maximo > 0.5 then return false; end if;
  if p_taxa_sbpe_anual <= 0 or p_taxa_sbpe_anual > 1 then return false; end if;
  if p_prazo_maximo_meses < 12 or p_prazo_maximo_meses > 480 then return false; end if;
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) = 0 then return false; end if;
  if jsonb_typeof(p_itbi_por_cidade) <> 'object' then return false; end if;

  update public.parametros_credito
     set faixas = p_faixas,
         teto_fgts_imovel = p_teto_fgts_imovel,
         taxa_sbpe_anual = p_taxa_sbpe_anual,
         prazo_maximo_meses = p_prazo_maximo_meses,
         comprometimento_maximo = p_comprometimento_maximo,
         itbi_por_cidade = p_itbi_por_cidade,
         conferido_em = p_conferido_em,
         conferido_por = v_corretor,
         atualizado_em = now()
   where id;

  return true;
end;
$$;

revoke all on function public.atualizar_parametros_credito(jsonb, numeric, numeric, integer, numeric, jsonb, date) from anon;

comment on table public.parametros_credito is
  'Linha unica com faixas do MCMV, teto do FGTS, taxa SBPE e ITBI. Seedada na 0102; editada so por gestor via atualizar_parametros_credito.';
```

- [ ] **Step 3: Declarar `parametros_credito` em `types.ts`**

Mesmo formato das outras — `Row`/`Insert`/`Update` com `faixas: Json`, `itbi_por_cidade: Json`, numéricos como `number`, `conferido_em: string`. Acrescentar também a função em `Functions`:

```ts
      atualizar_parametros_credito: {
        Args: {
          p_faixas: Json
          p_teto_fgts_imovel: number
          p_taxa_sbpe_anual: number
          p_prazo_maximo_meses: number
          p_comprometimento_maximo: number
          p_itbi_por_cidade: Json
          p_conferido_em: string
        }
        Returns: boolean
      }
```

- [ ] **Step 4: Guardas + tipos**

Run: `npx vitest run src/lib/migrations.test.ts src/lib/tabelasSeguras.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Aplicar e conferir nos dois sentidos**

```sql
-- (1) anon fora
begin; set local role anon;
  select count(*) from public.parametros_credito;   -- permission denied
rollback;

-- (2) corretor comum LÊ e NÃO escreve
begin; set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user_id de corretor NÃO gestor>"}';
  select conferido_em from public.parametros_credito;                  -- 2026-09-09
  select public.atualizar_parametros_credito(
    '[]'::jsonb, 1, 0.1, 360, 0.3, '{}'::jsonb, current_date);         -- false
rollback;

-- (3) gestor escreve
begin; set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user_id do gestor>"}';
  select public.atualizar_parametros_credito(
    (select faixas from public.parametros_credito), 350000, 0.1149, 420, 0.30,
    (select itbi_por_cidade from public.parametros_credito), current_date);  -- true
rollback;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0102_parametros_credito.sql src/lib/credito/tipos.ts src/lib/supabase/types.ts
git commit -m "feat(db): parâmetros de crédito seedados, editáveis só pelo gestor (0102)"
```

---

### Task 4: A conta do financiamento

> **Skill a invocar antes:** `superpowers:test-driven-development`

É a peça que produz número que vai para o cliente. A IA nunca calcula: ela extrai (renda, entrada, imóvel) e o código faz a conta.

**Files:**
- Create: `src/lib/consultor/financiamento.ts`
- Test: `src/lib/consultor/financiamento.test.ts`

**Interfaces:**
- Consumes: `ParametrosCredito`, `FaixaMcmv`, `ALIQUOTA_ITBI_PADRAO` (Task 3).
- Produces: `type EntradaSimulacao`, `type Simulacao`, `function simularFinanciamento(entrada, params): Simulacao`.

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/consultor/financiamento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { simularFinanciamento } from "./financiamento";

const PARAMS: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("simularFinanciamento", () => {
  it("escolhe a primeira faixa que a renda cabe", () => {
    const s = simularFinanciamento(
      { rendaMensal: 4000, entrada: 20000, valorImovel: 250000, cidade: "Barueri" },
      PARAMS,
    );
    expect(s.faixa).toBe("Faixa 2");
    expect(s.taxaAnual).toBe(0.06);
    expect(s.subsidio).toBe(29000);
  });

  it("renda acima de todas as faixas cai no SBPE, sem subsídio", () => {
    const s = simularFinanciamento(
      { rendaMensal: 20000, entrada: 100000, valorImovel: 800000 },
      PARAMS,
    );
    expect(s.faixa).toBeNull();
    expect(s.taxaAnual).toBe(0.1149);
    expect(s.subsidio).toBe(0);
  });

  it("a parcela máxima é a fração da renda que o parâmetro manda", () => {
    const s = simularFinanciamento({ rendaMensal: 10000, entrada: 0, valorImovel: 500000 }, PARAMS);
    expect(s.parcelaMaxima).toBeCloseTo(3000, 2);
  });

  it("fecha quando o que falta financiar cabe no que a renda sustenta", () => {
    const s = simularFinanciamento(
      { rendaMensal: 12000, entrada: 200000, valorImovel: 400000 },
      PARAMS,
    );
    expect(s.fecha).toBe(true);
    expect(s.faltam).toBe(0);
    expect(s.parcelaEstimada).toBeGreaterThan(0);
    expect(s.parcelaEstimada).toBeLessThanOrEqual(s.parcelaMaxima + 0.01);
  });

  it("NÃO fecha quando a renda não sustenta, e diz quanto falta", () => {
    // O caso que mais importa: dizer não cedo evita visita perdida.
    const s = simularFinanciamento({ rendaMensal: 2000, entrada: 0, valorImovel: 400000 }, PARAMS);
    expect(s.fecha).toBe(false);
    expect(s.faltam).toBeGreaterThan(0);
    expect(s.parcelaEstimada).toBe(0);
  });

  it("bloqueia o FGTS acima do teto do imóvel, e avisa", () => {
    const s = simularFinanciamento(
      { rendaMensal: 12000, entrada: 50000, fgts: 60000, valorImovel: 500000 },
      PARAMS,
    );
    expect(s.recursosProprios).toBe(50000);
    expect(s.avisos.join(" ")).toMatch(/FGTS/i);
  });

  it("usa o FGTS quando o imóvel está dentro do teto", () => {
    const s = simularFinanciamento(
      { rendaMensal: 6000, entrada: 20000, fgts: 30000, valorImovel: 300000 },
      PARAMS,
    );
    expect(s.recursosProprios).toBe(20000 + 30000 + s.subsidio);
  });

  it("calcula o ITBI pela cidade, e cai no padrão quando não conhece", () => {
    const conhecida = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, cidade: "Barueri" },
      PARAMS,
    );
    expect(conhecida.itbi).toBeCloseTo(6000, 2);

    const desconhecida = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, cidade: "Itapevi" },
      PARAMS,
    );
    expect(desconhecida.itbi).toBeCloseTo(6000, 2);
    expect(desconhecida.avisos.join(" ")).toMatch(/Itapevi/);
  });

  it("sempre diz o que a conta assumiu", () => {
    // Estimativa sem premissa visível é número que ninguém pode conferir.
    const s = simularFinanciamento({ rendaMensal: 8000, entrada: 0, valorImovel: 300000 }, PARAMS);
    expect(s.premissas.length).toBeGreaterThanOrEqual(3);
    expect(s.premissas.join(" ")).toMatch(/2026-09-09/);
  });

  it("prazo pedido acima do máximo é aparado", () => {
    const s = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, prazoMeses: 600 },
      PARAMS,
    );
    expect(s.prazoMeses).toBe(420);
  });

  it("entrada maior que o imóvel não gera financiamento negativo", () => {
    const s = simularFinanciamento(
      { rendaMensal: 8000, entrada: 400000, valorImovel: 300000 },
      PARAMS,
    );
    expect(s.fecha).toBe(true);
    expect(s.parcelaEstimada).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/consultor/financiamento.test.ts`
Expected: FAIL — "Failed to resolve import ./financiamento".

- [ ] **Step 3: Implementar**

`src/lib/consultor/financiamento.ts`:

```ts
/**
 * A conta do financiamento — módulo PURO, sem I/O e sem LLM.
 *
 * ## Por que a IA não faz esta conta
 *
 * Modelo erra aritmética, e o número daqui vai para o cliente. A IA extrai
 * (renda, entrada, imóvel) do texto livre e PEDE a simulação; quem calcula é
 * este arquivo, que tem teste. Mesma razão por que o telefone é normalizado
 * em código e o corte de mensagem não é pedido no prompt.
 *
 * ## O que ela é
 *
 * ESTIMATIVA, e diz isso em voz alta: `premissas` sai preenchida em toda
 * simulação. Financiamento de verdade depende de análise de crédito, seguro,
 * taxa negociada e avaliação do imóvel — nada disso está aqui.
 */

import {
  ALIQUOTA_ITBI_PADRAO,
  type FaixaMcmv,
  type ParametrosCredito,
} from "@/lib/credito/tipos";

export type EntradaSimulacao = {
  /** Renda familiar bruta mensal. */
  rendaMensal: number;
  /** Recursos próprios em dinheiro. */
  entrada: number;
  /** Saldo de FGTS que a pessoa pretende usar. */
  fgts?: number;
  valorImovel: number;
  cidade?: string;
  prazoMeses?: number;
};

export type Simulacao = {
  /** `null` = fora do MCMV; a conta usa a taxa do SBPE. */
  faixa: string | null;
  taxaAnual: number;
  prazoMeses: number;
  subsidio: number;
  /** O teto de parcela que a renda suporta. */
  parcelaMaxima: number;
  /** Quanto de financiamento essa parcela sustenta, no prazo escolhido. */
  valorFinanciavel: number;
  /** Entrada + FGTS utilizável + subsídio. */
  recursosProprios: number;
  /** Quanto ainda falta depois de tudo. Zero quando fecha. */
  faltam: number;
  fecha: boolean;
  /** A parcela do financiamento realmente necessário. Zero se não fecha. */
  parcelaEstimada: number;
  itbi: number;
  /** O que a conta assumiu, em português. */
  premissas: string[];
  /** O que o corretor precisa saber que foi desconsiderado. */
  avisos: string[];
};

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Efetiva anual → efetiva mensal. Somar/dividir por 12 erraria para cima. */
function taxaMensal(anual: number): number {
  return Math.pow(1 + anual, 1 / 12) - 1;
}

/** Valor presente de uma série de parcelas iguais (Price). */
function valorPresente(parcela: number, i: number, n: number): number {
  if (i <= 0) return parcela * n;
  return (parcela * (1 - Math.pow(1 + i, -n))) / i;
}

/** Parcela de um financiamento (Price). */
function parcelaDe(principal: number, i: number, n: number): number {
  if (principal <= 0) return 0;
  if (i <= 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

/** A PRIMEIRA faixa cuja renda-teto comporta a renda declarada. */
function faixaDaRenda(renda: number, faixas: FaixaMcmv[]): FaixaMcmv | null {
  return [...faixas].sort((a, b) => a.rendaMax - b.rendaMax).find((f) => renda <= f.rendaMax) ?? null;
}

export function simularFinanciamento(
  entrada: EntradaSimulacao,
  params: ParametrosCredito,
): Simulacao {
  const avisos: string[] = [];

  const faixa = faixaDaRenda(entrada.rendaMensal, params.faixas);
  const taxaAnual = faixa ? faixa.taxaAnual : params.taxaSbpeAnual;
  const subsidio = faixa ? faixa.subsidioMaximo : 0;

  const prazoMeses = Math.min(entrada.prazoMeses ?? params.prazoMaximoMeses, params.prazoMaximoMeses);
  const i = taxaMensal(taxaAnual);

  /*
   * O FGTS na compra tem teto de VALOR DO IMÓVEL, não de renda. Ignorar isso
   * inflaria os recursos próprios e a simulação diria "fecha" para quem não
   * fecha — o pior erro possível aqui, porque manda alguém para uma visita
   * que termina em não.
   */
  const fgtsPedido = Math.max(0, entrada.fgts ?? 0);
  const fgtsUsavel = entrada.valorImovel <= params.tetoFgtsImovel ? fgtsPedido : 0;
  if (fgtsPedido > 0 && fgtsUsavel === 0) {
    avisos.push(
      `FGTS não entrou na conta: o imóvel (${reais(entrada.valorImovel)}) passa do teto de ${reais(params.tetoFgtsImovel)} para uso do fundo na compra.`,
    );
  }

  const recursosProprios = Math.max(0, entrada.entrada) + fgtsUsavel + subsidio;
  const necessario = Math.max(0, entrada.valorImovel - recursosProprios);

  const parcelaMaxima = entrada.rendaMensal * params.comprometimentoMaximo;
  const valorFinanciavel = valorPresente(parcelaMaxima, i, prazoMeses);

  const fecha = necessario <= valorFinanciavel;
  const faltam = fecha ? 0 : Math.round(necessario - valorFinanciavel);
  const parcelaEstimada = fecha ? parcelaDe(necessario, i, prazoMeses) : 0;

  const cidade = entrada.cidade?.trim();
  const aliquota = (cidade && params.itbiPorCidade[cidade]) ?? ALIQUOTA_ITBI_PADRAO;
  if (cidade && params.itbiPorCidade[cidade] === undefined) {
    avisos.push(
      `Não tenho a alíquota de ITBI de ${cidade} cadastrada — usei ${(ALIQUOTA_ITBI_PADRAO * 100).toFixed(0)}%, que é a mais comum. Confira na prefeitura.`,
    );
  }
  const itbi = entrada.valorImovel * aliquota;

  const premissas = [
    `Taxa de ${(taxaAnual * 100).toFixed(2)}% ao ano${faixa ? ` (${faixa.nome} do MCMV)` : " (SBPE)"}.`,
    `Prazo de ${prazoMeses} meses, tabela Price, parcela fixa.`,
    `Parcela limitada a ${(params.comprometimentoMaximo * 100).toFixed(0)}% da renda.`,
    `Sem seguro, taxa de administração nem custos de cartório na parcela.`,
    `Parâmetros conferidos em ${params.conferidoEm}.`,
  ];

  return {
    faixa: faixa?.nome ?? null,
    taxaAnual,
    prazoMeses,
    subsidio,
    parcelaMaxima,
    valorFinanciavel,
    recursosProprios,
    faltam,
    fecha,
    parcelaEstimada,
    itbi,
    premissas,
    avisos,
  };
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/lib/consultor/financiamento.test.ts`
Expected: PASS (12 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultor/financiamento.ts src/lib/consultor/financiamento.test.ts
git commit -m "feat(consultor): a conta do financiamento, pura e testada"
```

---

### Task 5: O contrato das mensagens

> **Skill a invocar antes:** `superpowers:test-driven-development`

**Files:**
- Create: `src/lib/consultor/contrato.ts`
- Test: `src/lib/consultor/contrato.test.ts`

**Interfaces:**
- Consumes: `Simulacao` (Task 4).
- Produces: `DadosDoConsultor`, `PerguntaDoConsultor`, `CartaoDeImovel`, `CartoesNaMensagem`, `SimulacaoNaMensagem`, `TextoParaCliente`, `EscolhaDoConsultor`, `MensagemDoConsultor`, `ConversaDoConsultor`, `dadosDoConsultor(bruto)`, `tituloDaConversa(texto)`, `MAX_CARTOES`.

- [ ] **Step 1: Escrever o teste**

`src/lib/consultor/contrato.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dadosDoConsultor, tituloDaConversa, MAX_CARTOES } from "./contrato";

describe("dadosDoConsultor", () => {
  it("devolve null para lixo — jsonb torto não derruba a conversa", () => {
    expect(dadosDoConsultor(null)).toBeNull();
    expect(dadosDoConsultor("texto")).toBeNull();
    expect(dadosDoConsultor({ tipo: "inventado" })).toBeNull();
  });

  it("aceita pergunta com pelo menos duas alternativas", () => {
    expect(
      dadosDoConsultor({ tipo: "pergunta", id: "p1", texto: "Qual região?", alternativas: ["Barueri", "Osasco"] }),
    ).toEqual({ tipo: "pergunta", id: "p1", texto: "Qual região?", alternativas: ["Barueri", "Osasco"] });
  });

  it("recusa pergunta com uma alternativa só — chip único não é escolha", () => {
    expect(
      dadosDoConsultor({ tipo: "pergunta", id: "p1", texto: "Qual?", alternativas: ["Só esta"] }),
    ).toBeNull();
  });

  it("aceita cartões e corta no teto", () => {
    const item = { slug: "a", nome: "A", bairro: "B", cidade: "C", situacao: "Pronto", precoAPartir: 1, resumoFicha: "x", capaUrl: null };
    const muitos = { tipo: "cartoes", itens: Array.from({ length: 9 }, (_, n) => ({ ...item, slug: `s${n}` })) };
    const lido = dadosDoConsultor(muitos);
    expect(lido?.tipo).toBe("cartoes");
    expect(lido && "itens" in lido && lido.itens.length).toBe(MAX_CARTOES);
  });

  it("recusa cartão sem slug — sem slug não há link", () => {
    expect(dadosDoConsultor({ tipo: "cartoes", itens: [{ nome: "A" }] })).toBeNull();
  });

  it("aceita simulação e escolha", () => {
    const sim = dadosDoConsultor({
      tipo: "simulacao",
      entrada: { rendaMensal: 8000, entrada: 0, valorImovel: 300000 },
      resultado: { fecha: true, premissas: ["x"], avisos: [] },
    });
    expect(sim?.tipo).toBe("simulacao");

    expect(dadosDoConsultor({ tipo: "escolha", perguntaId: "p1", pergunta: "Q?", escolha: "A" })?.tipo).toBe("escolha");
  });

  it("aceita texto pronto para o cliente", () => {
    expect(dadosDoConsultor({ tipo: "texto_cliente", texto: "Oi! Tenho uma opção…" })?.tipo).toBe("texto_cliente");
  });
});

describe("tituloDaConversa", () => {
  it("corta longo e não estoura", () => {
    expect(tituloDaConversa("  ").length).toBeGreaterThan(0);
    expect(tituloDaConversa("a".repeat(200)).length).toBeLessThanOrEqual(48);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/consultor/contrato.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/consultor/contrato.ts`:

```ts
import type { EntradaSimulacao, Simulacao } from "./financiamento";

/**
 * O contrato do consultor — o que uma mensagem do chat pode carregar.
 *
 * Módulo PURO, sem `server-only`: a tela cliente lê estes tipos para desenhar
 * cartão, quadro de simulação e o botão de copiar.
 *
 * `consultor_mensagens.dados` é só transporte. O que a IA devolve às vezes vem
 * torto (cerca de código, campo faltando, alternativa vazia); linha fora do
 * contrato vira mensagem de texto simples, nunca texto cru na tela.
 */

/** Teto de cartões por resposta. Lista é desfile; três é indicação. */
export const MAX_CARTOES = 3;

export type PerguntaDoConsultor = {
  tipo: "pergunta";
  id: string;
  texto: string;
  alternativas: string[];
};

/**
 * O cartão é um RETRATO do que foi indicado, não a ficha viva.
 *
 * Guardar o retrato é o que faz a conversa antiga continuar legível depois
 * que o preço mudar. O que nunca é retrato é o LINK: ele sai do slug e leva
 * sempre à ficha de hoje. A IA jamais escreve URL — link errado leva o
 * corretor a um 404.
 */
export type CartaoDeImovel = {
  slug: string;
  nome: string;
  bairro: string;
  cidade: string;
  /** Rótulo humano do estágio ("Em construção"), nunca o enum. */
  situacao: string;
  precoAPartir: number | null;
  /** Uma linha: tipologias e metragens. */
  resumoFicha: string;
  capaUrl: string | null;
};

export type CartoesNaMensagem = { tipo: "cartoes"; itens: CartaoDeImovel[] };

export type SimulacaoNaMensagem = {
  tipo: "simulacao";
  entrada: EntradaSimulacao;
  resultado: Simulacao;
};

/** A resposta reescrita no tom de WhatsApp, pronta para colar. */
export type TextoParaCliente = { tipo: "texto_cliente"; texto: string };

export type EscolhaDoConsultor = {
  tipo: "escolha";
  perguntaId: string;
  pergunta: string;
  escolha: string;
};

export type DadosDoConsultor =
  | PerguntaDoConsultor
  | CartoesNaMensagem
  | SimulacaoNaMensagem
  | TextoParaCliente
  | EscolhaDoConsultor;

export type MensagemDoConsultor = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: DadosDoConsultor | null;
  createdAt: string;
};

export type ConversaDoConsultor = {
  id: string;
  titulo: string;
  atualizadoEm: string;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function lerCartao(bruto: unknown): CartaoDeImovel | null {
  if (!bruto || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;
  if (!texto(c.slug)) return null;
  return {
    slug: texto(c.slug),
    nome: texto(c.nome),
    bairro: texto(c.bairro),
    cidade: texto(c.cidade),
    situacao: texto(c.situacao),
    precoAPartir: numero(c.precoAPartir),
    resumoFicha: texto(c.resumoFicha),
    capaUrl: texto(c.capaUrl) || null,
  };
}

export function dadosDoConsultor(bruto: unknown): DadosDoConsultor | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;

  switch (d.tipo) {
    case "pergunta": {
      const alternativas = Array.isArray(d.alternativas)
        ? d.alternativas.map(texto).filter(Boolean).slice(0, 4)
        : [];
      if (!texto(d.texto) || alternativas.length < 2) return null;
      return { tipo: "pergunta", id: texto(d.id) || "p0", texto: texto(d.texto), alternativas };
    }
    case "cartoes": {
      const itens = Array.isArray(d.itens)
        ? d.itens.map(lerCartao).filter((c): c is CartaoDeImovel => c !== null).slice(0, MAX_CARTOES)
        : [];
      if (itens.length === 0) return null;
      return { tipo: "cartoes", itens };
    }
    case "simulacao": {
      if (!d.entrada || !d.resultado) return null;
      return {
        tipo: "simulacao",
        entrada: d.entrada as EntradaSimulacao,
        resultado: d.resultado as Simulacao,
      };
    }
    case "texto_cliente":
      if (!texto(d.texto)) return null;
      return { tipo: "texto_cliente", texto: texto(d.texto) };
    case "escolha":
      if (!texto(d.escolha)) return null;
      return {
        tipo: "escolha",
        perguntaId: texto(d.perguntaId),
        pergunta: texto(d.pergunta),
        escolha: texto(d.escolha),
      };
    default:
      return null;
  }
}

/** Título curto para a lista lateral, a partir do primeiro pedido. */
export function tituloDaConversa(primeiroPedido: string): string {
  const limpo = primeiroPedido.trim().replace(/\s+/g, " ");
  if (!limpo) return "Nova conversa";
  return limpo.length > 48 ? `${limpo.slice(0, 47).trimEnd()}…` : limpo;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/lib/consultor/contrato.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultor/contrato.ts src/lib/consultor/contrato.test.ts
git commit -m "feat(consultor): contrato das mensagens, com validador de jsonb torto"
```

---

### Task 6: Os três blocos de conhecimento

> **Skill a invocar antes:** `superpowers:test-driven-development`

**Files:**
- Create: `src/lib/consultor/conhecimento.ts`
- Test: `src/lib/consultor/conhecimento.test.ts`

**Interfaces:**
- Consumes: `Empreendimento`, `STATUS_LABEL` (`@/lib/types`), `ParametrosCredito`.
- Produces: `blocoDoCatalogo(imoveis)`, `blocoDeCredito(params, hoje)`, `blocoDeObjecoes(exemplos)`, `cartaoDoImovel(e)`, `resumoDaFicha(e)`.

- [ ] **Step 1: Escrever o teste**

`src/lib/consultor/conhecimento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { blocoDeCredito, blocoDeObjecoes, blocoDoCatalogo, cartaoDoImovel } from "./conhecimento";

const IMOVEL = {
  slug: "eternity-alphaville",
  nome: "Eternity Alphaville",
  nomesAlternativos: ["Eternity Tamboré"],
  tagline: "Alto padrão em Tamboré",
  descricao: "Empreendimento de alto padrão.",
  status: "em_construcao",
  tipo: "apartamento",
  cidade: "Barueri",
  bairro: "Centro Comercial Jubran",
  precoAPartir: 780000,
  construtora: "P4",
  entregaPrevista: null,
  tipologias: [
    { nome: "Tipo A", areaPrivativa: 92, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2 },
  ],
  lazer: ["Piscina", "Academia"],
  plantas: [],
  galeria: [{ url: "https://x/capa.jpg", tipo: "foto" }],
  capa: { url: "https://x/capa.jpg", tipo: "foto" },
} as unknown as Empreendimento;

const PARAMS: ParametrosCredito = {
  faixas: [{ nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 }],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("blocoDoCatalogo", () => {
  const bloco = blocoDoCatalogo([IMOVEL]);

  it("traz o slug, que é a moeda do cartão", () => {
    expect(bloco).toContain("slug: eternity-alphaville");
  });

  it("traz o PREÇO — aqui quem lê é o corretor", () => {
    expect(bloco).toMatch(/780\.000|780000/);
  });

  it("usa o rótulo humano do estágio, nunca o enum cru", () => {
    // Com "em_construcao" na ficha, o modelo já afirmou "pronto para morar".
    expect(bloco).toContain("Em construção");
    expect(bloco).not.toContain("em_construcao");
  });

  it("diz a AUSÊNCIA em voz alta", () => {
    expect(bloco).toContain("SEM planta");
    expect(bloco).toContain("sem prazo de entrega cadastrado");
  });

  it("traz os apelidos, que é como o cliente chama", () => {
    expect(bloco).toContain("Eternity Tamboré");
  });
});

describe("blocoDeCredito", () => {
  it("traz os números e a data da conferência", () => {
    const b = blocoDeCredito(PARAMS, new Date("2026-09-10T12:00:00Z"));
    expect(b).toContain("Faixa 1");
    expect(b).toContain("2026-09-09");
  });

  it("avisa quando os parâmetros estão velhos", () => {
    const b = blocoDeCredito(PARAMS, new Date("2027-03-01T12:00:00Z"));
    expect(b.toLowerCase()).toMatch(/desatualizad|conferir/);
  });

  it("proíbe número que não está no bloco", () => {
    expect(blocoDeCredito(PARAMS, new Date("2026-09-10T12:00:00Z"))).toMatch(/não (cite|invente)/i);
  });
});

describe("blocoDeObjecoes", () => {
  it("some quando não há corpus — bloco vazio não vira cabeçalho órfão", () => {
    expect(blocoDeObjecoes("   ")).toBe("");
    expect(blocoDeObjecoes("Cliente: caro\nCorretora: entendo")).toContain("Cliente: caro");
  });
});

describe("cartaoDoImovel", () => {
  it("monta o retrato com situação humana e capa", () => {
    const c = cartaoDoImovel(IMOVEL);
    expect(c.slug).toBe("eternity-alphaville");
    expect(c.situacao).toBe("Em construção");
    expect(c.capaUrl).toBe("https://x/capa.jpg");
    expect(c.resumoFicha).toMatch(/3 dorm/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/consultor/conhecimento.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/consultor/conhecimento.ts`:

```ts
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import type { CartaoDeImovel } from "./contrato";

/**
 * Os três blocos determinísticos que o consultor enxerga — módulo PURO.
 *
 * O que separa este chat de um chat genérico não é uma instrução longa: é o
 * que o CÓDIGO injeta. Catálogo real (para nunca inventar imóvel), parâmetros
 * de crédito com data (para nunca citar número velho) e as objeções que de
 * fato funcionaram nesta casa.
 *
 * O ponto de troca quando o catálogo crescer (acima de ~150 imóveis, quando
 * RAG passa a valer) é ESTE arquivo, e só ele.
 */

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Uma linha com o que a ficha tem de tipologia — o que a IA pode afirmar. */
export function resumoDaFicha(e: Empreendimento): string {
  if (!e.tipologias?.length) return "sem tipologia cadastrada";
  return e.tipologias
    .map((t) =>
      [
        t.nome,
        t.areaPrivativa ? `${t.areaPrivativa}m²` : null,
        `${t.dormitorios} dorm`,
        t.suites ? `${t.suites} suíte(s)` : null,
        t.banheiros ? `${t.banheiros} banheiro(s)` : null,
        t.vagas ? `${t.vagas} vaga(s)` : null,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .join(" | ");
}

/** O retrato que vai para a mensagem. Sai do catálogo, nunca do modelo. */
export function cartaoDoImovel(e: Empreendimento): CartaoDeImovel {
  return {
    slug: e.slug,
    nome: e.nome,
    bairro: e.bairro,
    cidade: e.cidade,
    situacao: STATUS_LABEL[e.status] ?? e.status,
    precoAPartir: e.precoAPartir,
    resumoFicha: resumoDaFicha(e),
    capaUrl: e.capa?.url ?? e.galeria?.[0]?.url ?? null,
  };
}

/**
 * O catálogo INTEIRO, ficha completa.
 *
 * Duas diferenças em relação ao catálogo do atendimento ao cliente:
 *
 * 1. **O preço entra.** Quem lê aqui é o corretor. `semValores.ts` protege a
 *    conversa com o CLIENTE e não tem nada a fazer nesta superfície.
 * 2. **A ausência é dita em voz alta.** Listar só o que existe faz o modelo
 *    preencher o resto: com "3 dorm/110m²" ele respondeu "1 suíte" para um
 *    cadastro com 3, e com o enum cru afirmou "pronto para morar" para um
 *    imóvel em obra. O que não está aqui, a IA inventa.
 */
export function blocoDoCatalogo(imoveis: Empreendimento[]): string {
  if (imoveis.length === 0) return "CATÁLOGO: nenhum imóvel publicado no momento.";

  const fichas = imoveis
    .map((e) => {
      const apelidos = e.nomesAlternativos?.length
        ? ` (também conhecido como: ${e.nomesAlternativos.join(", ")})`
        : "";
      const midia = [
        (e.galeria?.length ?? 0) > 0 ? `${e.galeria.length} foto(s)` : "SEM foto",
        (e.plantas?.length ?? 0) > 0 ? `${e.plantas.length} planta(s)` : "SEM planta",
      ].join(", ");

      return [
        `- ${e.nome}${apelidos} [slug: ${e.slug}]`,
        `  Onde: ${e.bairro}, ${e.cidade}. Situação: ${STATUS_LABEL[e.status] ?? e.status}. Tipo: ${e.tipo}.`,
        e.precoAPartir
          ? `  A partir de: ${reais(e.precoAPartir)} (piso de tabela — valor de unidade, condição e desconto você NÃO tem)`
          : "  A partir de: SEM piso cadastrado",
        `  Ficha: ${resumoDaFicha(e)}`,
        e.construtora ? `  Construtora: ${e.construtora}` : null,
        e.entregaPrevista
          ? `  Entrega prevista: ${e.entregaPrevista}`
          : "  Entrega: sem prazo de entrega cadastrado — não afirme data",
        e.lazer?.length ? `  Lazer: ${e.lazer.join(", ")}` : "  Lazer: SEM itens cadastrados",
        `  Material: ${midia}`,
        `  Sobre: ${e.tagline || e.descricao.slice(0, 140)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `CATÁLOGO COMPLETO (${imoveis.length} imóveis publicados). Só existe o que está aqui — imóvel que não está nesta lista, nós não temos:\n\n${fichas}`;
}

/** Acima disso, os parâmetros deixam de ser afirmação e viram lembrete. */
const DIAS_ATE_ENVELHECER = 120;

/**
 * Os números de crédito, com data.
 *
 * A dupla defesa do preço e do prazo, aplicada aqui: o bloco avisa ANTES
 * (dizendo o que ela PODE citar) e o guardrail corta DEPOIS. Bloco que só
 * proíbe empurra a IA para o silêncio, e silêncio sobre crédito também perde
 * negócio.
 */
export function blocoDeCredito(params: ParametrosCredito, hoje: Date): string {
  const faixas = params.faixas
    .map(
      (f) =>
        `  - ${f.nome}: renda familiar até ${reais(f.rendaMax)}, taxa ${(f.taxaAnual * 100).toFixed(2)}% a.a.` +
        (f.subsidioMaximo > 0 ? `, subsídio de até ${reais(f.subsidioMaximo)}` : ", sem subsídio"),
    )
    .join("\n");

  const itbi = Object.entries(params.itbiPorCidade)
    .map(([cidade, aliquota]) => `${cidade} ${(aliquota * 100).toFixed(1)}%`)
    .join(", ");

  const dias = Math.floor(
    (hoje.getTime() - new Date(`${params.conferidoEm}T12:00:00Z`).getTime()) / 86_400_000,
  );
  const idade =
    dias > DIAS_ATE_ENVELHECER
      ? `\nATENÇÃO: estes números foram conferidos há ${dias} dias e podem estar DESATUALIZADOS. Diga isso ao corretor e mande conferir na fonte antes de repassar ao cliente.`
      : "";

  return `PARÂMETROS DE CRÉDITO (conferidos em ${params.conferidoEm}):
${faixas}
  - Teto de valor do imóvel para usar FGTS na compra: ${reais(params.tetoFgtsImovel)}
  - Taxa de referência do SBPE (fora do MCMV): ${(params.taxaSbpeAnual * 100).toFixed(2)}% a.a.
  - Prazo máximo: ${params.prazoMaximoMeses} meses
  - Comprometimento máximo da renda com a parcela: ${(params.comprometimentoMaximo * 100).toFixed(0)}%
  - ITBI: ${itbi}${idade}

REGRA DURA: número de crédito que não está neste bloco você NÃO cita e não inventa — pergunta ao corretor ou manda conferir na fonte (Caixa, prefeitura, cartório). Os números ACIMA você pode citar à vontade, dizendo a data da conferência.`;
}

/** O corpus real. Vazio some inteiro — cabeçalho órfão é ruído no prompt. */
export function blocoDeObjecoes(exemplos: string): string {
  const limpo = exemplos.trim();
  if (!limpo) return "";
  return `COMO ESTA CASA JÁ RESPONDEU (conversas reais que converteram — imite o argumento e o tom, nunca copie literalmente):\n${limpo}`;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/lib/consultor/conhecimento.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultor/conhecimento.ts src/lib/consultor/conhecimento.test.ts
git commit -m "feat(consultor): os três blocos de conhecimento do prompt"
```

---

### Task 7: O prompt e os guardrails

> **Skill a invocar antes:** `superpowers:test-driven-development`

**Files:**
- Create: `src/lib/consultor/prompt.ts`
- Create: `src/lib/consultor/guardrails.ts`
- Test: `src/lib/consultor/guardrails.test.ts`

**Interfaces:**
- Consumes: blocos da Task 6, `ParametrosCredito`.
- Produces: `montarPromptDoConsultor(params): string`; `slugsValidos(slugs, catalogo): string[]`; `numerosPermitidos(params, simulacao)`; `cortarCreditoInventado(texto, permitidos): string`.

- [ ] **Step 1: Escrever o teste dos guardrails**

`src/lib/consultor/guardrails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { cortarCreditoInventado, numerosPermitidos, slugsValidos } from "./guardrails";
import { montarPromptDoConsultor } from "./prompt";

const CATALOGO = [
  { slug: "eternity-alphaville" },
  { slug: "more-na-aldeia-de-barueri" },
] as unknown as Empreendimento[];

const PARAMS: ParametrosCredito = {
  faixas: [{ nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 }],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("slugsValidos", () => {
  it("descarta o que não está no catálogo — alucinação impossível por construção", () => {
    expect(slugsValidos(["eternity-alphaville", "canvas-alphaville"], CATALOGO)).toEqual([
      "eternity-alphaville",
    ]);
  });

  it("deduplica e respeita o teto de três", () => {
    const repetido = ["eternity-alphaville", "eternity-alphaville", "more-na-aldeia-de-barueri"];
    expect(slugsValidos(repetido, CATALOGO)).toEqual([
      "eternity-alphaville",
      "more-na-aldeia-de-barueri",
    ]);
  });
});

describe("cortarCreditoInventado", () => {
  const permitidos = numerosPermitidos(PARAMS, null);

  it("deixa passar número que está no bloco", () => {
    const t = "O subsídio da Faixa 1 chega a R$ 55.000.";
    expect(cortarCreditoInventado(t, permitidos)).toBe(t);
  });

  it("corta a FRASE inteira quando o número não está no bloco", () => {
    const t = "A região é ótima. O subsídio da Faixa 1 chega a R$ 91.000. Vale a visita.";
    const saida = cortarCreditoInventado(t, permitidos);
    expect(saida).not.toContain("91.000");
    expect(saida).toContain("A região é ótima.");
    expect(saida).toContain("Vale a visita.");
    expect(saida.toLowerCase()).toMatch(/conferir|não tenho/);
  });

  it("não mexe em número que não é de crédito", () => {
    // Metragem, dormitório e ano não são números de crédito.
    const t = "São 92m², 3 dormitórios, entrega em 2027.";
    expect(cortarCreditoInventado(t, permitidos)).toBe(t);
  });

  it("deixa passar os números da simulação daquele turno", () => {
    const comSim = numerosPermitidos(PARAMS, { parcelaEstimada: 2431.55, itbi: 6000, subsidio: 0 });
    const t = "A parcela estimada fica em R$ 2.431,55 e o ITBI em R$ 6.000.";
    expect(cortarCreditoInventado(t, comSim)).toBe(t);
  });
});

describe("montarPromptDoConsultor", () => {
  const prompt = montarPromptDoConsultor({
    blocoCatalogo: "CATÁLOGO COMPLETO (2 imóveis)…",
    blocoCredito: "PARÂMETROS DE CRÉDITO…",
    blocoObjecoes: "",
    historico: [],
    pedido: "quem serve pra renda de 8 mil?",
  });

  it("põe os blocos de dado ANTES das regras longas", () => {
    // Bloco enterrado compete com as outras instruções. A v32 pagou por isso.
    expect(prompt.indexOf("CATÁLOGO COMPLETO")).toBeLessThan(prompt.indexOf("REGRAS"));
  });

  it("descreve o contrato JSON que o turno espera", () => {
    for (const campo of ["resposta", "imoveis", "pergunta", "simular"]) {
      expect(prompt).toContain(`"${campo}"`);
    }
  });

  it("proíbe escrever URL e fazer conta", () => {
    expect(prompt.toLowerCase()).toContain("nunca escreva link");
    expect(prompt.toLowerCase()).toMatch(/não calcule|nunca calcule/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/consultor/guardrails.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `guardrails.ts`**

```ts
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { MAX_CARTOES } from "./contrato";

/**
 * As duas redes de segurança da resposta — módulo PURO.
 *
 * Instrução de prompt é probabilística e falha justo na resposta que importa;
 * função determinística vale sempre e é testável. É a mesma lição do
 * `vozHumana`, do `resolverMidia` e do `semValores`.
 */

/** Só slug que EXISTE vira cartão. O resto some antes de chegar à tela. */
export function slugsValidos(slugs: string[], catalogo: Empreendimento[]): string[] {
  const existem = new Set(catalogo.map((e) => e.slug));
  const vistos = new Set<string>();
  const bons: string[] = [];
  for (const s of slugs) {
    const limpo = s.trim();
    if (!existem.has(limpo) || vistos.has(limpo)) continue;
    vistos.add(limpo);
    bons.push(limpo);
    if (bons.length === MAX_CARTOES) break;
  }
  return bons;
}

/** Palavras que fazem de um número um número de CRÉDITO. */
const ASSUNTO_DE_CREDITO =
  /(mcmv|minha casa|faixa|subs[ií]dio|fgts|itbi|financia|juros|taxa|parcela|entrada|renda|presta[çc][ãa]o)/i;

/** Números que a resposta pode citar sem conferência: os do bloco + os da conta. */
export function numerosPermitidos(
  params: ParametrosCredito,
  simulacao: { parcelaEstimada?: number; itbi?: number; subsidio?: number } | null,
): number[] {
  const doBloco = [
    ...params.faixas.flatMap((f) => [f.rendaMax, f.subsidioMaximo, f.taxaAnual * 100]),
    params.tetoFgtsImovel,
    params.taxaSbpeAnual * 100,
    params.prazoMaximoMeses,
    params.comprometimentoMaximo * 100,
    ...Object.values(params.itbiPorCidade).map((a) => a * 100),
  ];
  const daConta = simulacao
    ? [simulacao.parcelaEstimada ?? 0, simulacao.itbi ?? 0, simulacao.subsidio ?? 0]
    : [];
  return [...doBloco, ...daConta].filter((n) => Number.isFinite(n) && n > 0);
}

/** "R$ 55.000", "55.000", "4,5%" → 55000, 4.5. */
function numerosDaFrase(frase: string): number[] {
  const achados = frase.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? [];
  return achados
    .map((t) => Number(t.replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
}

/** Tolerância de 1% absorve arredondamento de quem escreveu "R$ 2.432". */
function estaPermitido(n: number, permitidos: number[]): boolean {
  return permitidos.some((p) => Math.abs(p - n) <= Math.max(1, p * 0.01));
}

const DESVIO =
  "Esse número eu não tenho conferido aqui — confira na fonte antes de passar pro cliente.";

/**
 * Corta a FRASE inteira quando ela afirma número de crédito que não confere.
 *
 * Frase, não o número: apagar só o algarismo deixaria "o subsídio chega a" e
 * pareceria defeito — a mesma escolha do `semValores.ts`. E só frase que fala
 * de crédito entra na régua: metragem, dormitório e ano de entrega não são
 * afetados, senão a IA perderia a capacidade de descrever o imóvel.
 */
export function cortarCreditoInventado(texto: string, permitidos: number[]): string {
  const frases = texto.split(/(?<=[.!?])\s+/);
  let cortou = false;

  const saida = frases.filter((frase) => {
    if (!ASSUNTO_DE_CREDITO.test(frase)) return true;
    const suspeitos = numerosDaFrase(frase).filter((n) => n >= 100 || /%/.test(frase));
    if (suspeitos.length === 0) return true;
    const ok = suspeitos.every((n) => estaPermitido(n, permitidos));
    if (!ok) cortou = true;
    return ok;
  });

  if (cortou) saida.push(DESVIO);
  return saida.join(" ").replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Implementar `prompt.ts`**

```ts
/**
 * O prompt do consultor — módulo PURO.
 *
 * ## A ordem importa mais do que o texto
 *
 * Os blocos de DADO vêm antes das regras. A v32 do agente do WhatsApp pagou
 * essa lição: o bloco que precisava ganhar de todas as outras instruções
 * ficou na posição 27.697 de 35.751 caracteres e competia como qualquer
 * outra. Bloco que tem de vencer vai ANTES de tudo.
 */

export type PedidoDoPrompt = {
  blocoCatalogo: string;
  blocoCredito: string;
  /** Vazio quando não há corpus — some inteiro. */
  blocoObjecoes: string;
  /** As últimas mensagens, já em "Corretor:" / "Você:". */
  historico: string[];
  pedido: string;
};

export function montarPromptDoConsultor(p: PedidoDoPrompt): string {
  const objecoes = p.blocoObjecoes.trim() ? `\n\n${p.blocoObjecoes.trim()}` : "";
  const conversa = p.historico.length ? `\n\nCONVERSA ATÉ AQUI:\n${p.historico.join("\n")}` : "";

  return `${p.blocoCatalogo}

${p.blocoCredito}${objecoes}

Você é o consultor imobiliário da Next Home. Quem fala com você é um CORRETOR da casa — não é cliente. Ele pode ver preço, comissão, margem e tudo o que está no catálogo acima.

Você conhece quatro coisas, e nessa ordem de utilidade:
1. O PORTFÓLIO acima — casar a necessidade da pessoa com o imóvel certo.
2. CRÉDITO E FINANCIAMENTO — MCMV, SBPE, FGTS, entrada, subsídio, capacidade de pagamento.
3. OBJEÇÃO E ARGUMENTAÇÃO — o que responder para "está caro", "vou pensar", "quero desconto".
4. JURÍDICO E DOCUMENTAÇÃO — ITBI, escritura, registro, contrato, permuta, distrato, comissão.

REGRAS
1. Fale como um colega experiente falaria, em português do Brasil, direto ao ponto. Nada de lista numerada gigante nem de abertura de manual ("Excelente pergunta!").
2. NUNCA ESCREVA LINK. Para indicar um imóvel, ponha o slug em "imoveis" — o sistema monta o cartão com a ficha e o link certos.
3. NÃO CALCULE NADA de financiamento. Quando o corretor der renda, entrada e valor do imóvel (ou der para deduzir do catálogo), preencha "simular" e deixe a conta com o sistema. Conta feita de cabeça vira número errado na mão do cliente.
4. Imóvel que não está no catálogo acima, nós NÃO TEMOS. Diga isso e pergunte o que agradou nele — o critério de escolha é o que vale.
5. Especificação que não está na ficha (acabamento, piso, bancada, metragem de área comum) você NÃO AFIRMA. Diga que confirma com a construtora.
6. Prazo de entrega só o que está na ficha. Imóvel sem prazo cadastrado, você diz que vai confirmar.
7. Em jurídico e documentação, separe o que é PRAXE do que é EXIGÊNCIA LEGAL, e diga sempre onde conferir (cartório, prefeitura, CRECI, Caixa). Nunca afirme alíquota, prazo legal ou valor que não esteja no bloco de crédito.
8. Faça no máximo UMA pergunta por resposta, e só quando a resposta depender dela. Quando a pergunta tiver alternativas óbvias, use "pergunta" para ele responder num toque.
9. Quando ele pedir para mandar algo ao cliente, escreva a versão de WhatsApp em "textoCliente": curta, sem markdown, sem asterisco, uma ideia por frase.

Responda SÓ com um JSON neste formato, sem cerca de código e sem texto fora dele:
{
  "resposta": "o que você diz ao corretor, em português",
  "imoveis": ["slug-do-imovel"],
  "pergunta": { "texto": "…", "alternativas": ["…", "…"] },
  "simular": { "rendaMensal": 8000, "entrada": 40000, "fgts": 0, "valorImovel": 350000, "cidade": "Barueri" },
  "textoCliente": "versão pronta para colar no WhatsApp"
}
Os campos "imoveis", "pergunta", "simular" e "textoCliente" são OPCIONAIS — omita o que não se aplica.${conversa}

PEDIDO DO CORRETOR AGORA:
${p.pedido}`;
}
```

- [ ] **Step 5: Rodar até passar**

Run: `npx vitest run src/lib/consultor/`
Expected: PASS (financiamento, contrato, conhecimento, guardrails).

- [ ] **Step 6: Commit**

```bash
git add src/lib/consultor/prompt.ts src/lib/consultor/guardrails.ts src/lib/consultor/guardrails.test.ts
git commit -m "feat(consultor): prompt com blocos na frente e os dois guardrails"
```

---

### Task 8: Leitura do banco — parâmetros e conversas

> **Skill a invocar antes:** `supabase:supabase-postgres-best-practices`

**Files:**
- Create: `src/lib/credito/parametros.ts`
- Create: `src/lib/consultor/repositorio.ts`

**Interfaces:**
- Consumes: tabelas das Tasks 2 e 3; `ParametrosCredito`; `MensagemDoConsultor`, `ConversaDoConsultor`, `dadosDoConsultor`.
- Produces: `getParametrosCredito()`, `PARAMETROS_PADRAO`; `listarConversasDoConsultor()`, `carregarConversaDoConsultor(id)`, `criarConversaDoConsultor({corretorId, titulo})`, `gravarMensagemDoConsultor({...})`, `conversaDoCorretor(id)`, `excluirConversaDoConsultor(id)`.

- [ ] **Step 1: `src/lib/credito/parametros.ts`**

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FaixaMcmv, ParametrosCredito } from "./tipos";

/**
 * Os parâmetros de crédito, do banco.
 *
 * ## Por que existe um padrão em código
 *
 * A tabela é seedada na 0102, então a linha existe. Mas leitura pode falhar
 * (Supabase fora do ar) e o consultor não pode ficar mudo por causa disso —
 * ele responderia sem bloco de crédito, e o guardrail cortaria TODA frase
 * sobre financiamento. O padrão é o mesmo seed, e a data velha faz o próprio
 * bloco avisar que precisa conferir.
 */
export const PARAMETROS_PADRAO: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
    { nome: "Faixa 4", rendaMax: 12000, subsidioMaximo: 0, taxaAnual: 0.1 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02, Osasco: 0.02, "Santana de Parnaiba": 0.02, "Sao Paulo": 0.03 },
  conferidoEm: "2026-09-09",
};

export async function getParametrosCredito(): Promise<ParametrosCredito> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parametros_credito")
    .select(
      "faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses, comprometimento_maximo, itbi_por_cidade, conferido_em",
    )
    .maybeSingle();

  if (error || !data) {
    console.warn("[crédito] falha ao ler parâmetros; usando o padrão do código:", error?.message);
    return PARAMETROS_PADRAO;
  }

  return {
    faixas: (data.faixas as unknown as FaixaMcmv[]) ?? PARAMETROS_PADRAO.faixas,
    tetoFgtsImovel: Number(data.teto_fgts_imovel),
    taxaSbpeAnual: Number(data.taxa_sbpe_anual),
    prazoMaximoMeses: data.prazo_maximo_meses,
    comprometimentoMaximo: Number(data.comprometimento_maximo),
    itbiPorCidade: (data.itbi_por_cidade as unknown as Record<string, number>) ?? {},
    conferidoEm: data.conferido_em,
  };
}
```

- [ ] **Step 2: `src/lib/consultor/repositorio.ts`**

Cópia estrutural de `src/lib/estudio/repositorio.ts`, sem `tipo`, sem `imagem_id`/`video_job_id`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  dadosDoConsultor,
  type ConversaDoConsultor,
  type DadosDoConsultor,
  type MensagemDoConsultor,
} from "./contrato";

/**
 * Leitura e escrita das conversas do consultor.
 *
 * LEITURA com o cliente de SESSÃO (a RLS recorta pelo corretor logado);
 * ESCRITA com a service key, porque `authenticated` não tem insert nem update
 * (0101). A decisão de QUEM pode é sempre da sessão; a service key só executa.
 */

type LinhaMensagem = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: unknown;
  created_at: string;
};

function mapMensagem(l: LinhaMensagem): MensagemDoConsultor {
  return {
    id: l.id,
    papel: l.papel,
    conteudo: l.conteudo,
    dados: dadosDoConsultor(l.dados),
    createdAt: l.created_at,
  };
}

export async function listarConversasDoConsultor(limite = 30): Promise<ConversaDoConsultor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consultor_conversas")
    .select("id, titulo, atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, titulo: c.titulo, atualizadoEm: c.atualizado_em }));
}

export async function carregarConversaDoConsultor(
  conversaId: string,
): Promise<{ conversa: ConversaDoConsultor; mensagens: MensagemDoConsultor[] } | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("consultor_conversas")
    .select("id, titulo, atualizado_em")
    .eq("id", conversaId)
    .maybeSingle();
  if (!c) return null;

  const { data: ms, error } = await supabase
    .from("consultor_mensagens")
    .select("id, papel, conteudo, dados, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return {
    conversa: { id: c.id, titulo: c.titulo, atualizadoEm: c.atualizado_em },
    mensagens: (ms ?? []).map((m) => mapMensagem(m as LinhaMensagem)),
  };
}

export async function criarConversaDoConsultor(params: {
  corretorId: string;
  titulo: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultor_conversas")
    .insert({ corretor_id: params.corretorId, titulo: params.titulo })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function gravarMensagemDoConsultor(params: {
  conversaId: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados?: DadosDoConsultor | null;
}): Promise<MensagemDoConsultor> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultor_mensagens")
    .insert({
      conversa_id: params.conversaId,
      papel: params.papel,
      conteudo: params.conteudo,
      dados: params.dados ?? null,
    })
    .select("id, papel, conteudo, dados, created_at")
    .single();
  if (error) throw error;

  // A lista lateral ordena por `atualizado_em`: toda mensagem sobe a conversa.
  await supabase
    .from("consultor_conversas")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", params.conversaId);

  return mapMensagem(data as LinhaMensagem);
}

/** Confere que a conversa é do corretor — pelo cliente de SESSÃO. */
export async function conversaDoCorretor(conversaId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consultor_conversas")
    .select("id")
    .eq("id", conversaId)
    .maybeSingle();
  return data ?? null;
}

export async function excluirConversaDoConsultor(conversaId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("consultor_conversas")
    .delete({ count: "exact" })
    .eq("id", conversaId);
  return !error && (count ?? 0) > 0;
}
```

- [ ] **Step 3: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erro. Se reclamar de relação desconhecida, falta a declaração à mão em `types.ts` (Tasks 2 e 3).

- [ ] **Step 4: Commit**

```bash
git add src/lib/credito/parametros.ts src/lib/consultor/repositorio.ts
git commit -m "feat(consultor): leitura dos parâmetros de crédito e das conversas"
```

---

### Task 9: O turno — a única chamada de LLM

> **Skill a invocar antes:** `superpowers:test-driven-development`, depois `write-judge-prompt` (para a etapa de qualidade da Task 13)

**Files:**
- Create: `src/lib/consultor/turno.ts`
- Test: `src/lib/consultor/turno.test.ts`

**Interfaces:**
- Consumes: `montarPromptDoConsultor`, `blocoDoCatalogo`, `blocoDeCredito`, `blocoDeObjecoes`, `cartaoDoImovel`, `slugsValidos`, `numerosPermitidos`, `cortarCreditoInventado`, `simularFinanciamento`, `chamarLlmJson`, `soarHumano`.
- Produces: `type RespostaDoConsultor`, `turnoDoConsultor(params): Promise<RespostaDoConsultor>`, `lerRespostaDaIa(json)` (exportada só para teste).

- [ ] **Step 1: Escrever o teste**

`src/lib/consultor/turno.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametros";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

const { turnoDoConsultor } = await import("./turno");

const CATALOGO = [
  {
    slug: "eternity-alphaville",
    nome: "Eternity Alphaville",
    bairro: "Jubran",
    cidade: "Barueri",
    status: "em_construcao",
    tipo: "apartamento",
    precoAPartir: 780000,
    descricao: "x",
    tagline: "y",
    tipologias: [{ nome: "A", areaPrivativa: 92, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2 }],
    lazer: ["Piscina"],
    plantas: [],
    galeria: [{ url: "https://x/capa.jpg", tipo: "foto" }],
    capa: { url: "https://x/capa.jpg", tipo: "foto" },
  },
] as unknown as Empreendimento[];

const base = {
  pedido: "quem serve pra renda de 8 mil?",
  historico: [],
  catalogo: CATALOGO,
  credito: PARAMETROS_PADRAO,
  exemplos: "",
  agora: new Date("2026-09-10T12:00:00Z"),
};

beforeEach(() => chamarLlmJson.mockReset());

describe("turnoDoConsultor", () => {
  it("devolve o texto e monta o cartão a partir do slug", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: { resposta: "Esse serve.", imoveis: ["eternity-alphaville"] },
      latenciaMs: 10,
      tokensEntrada: 1,
      tokensSaida: 1,
      modelo: "gpt-4.1-mini",
    });

    const r = await turnoDoConsultor(base);
    expect(r.texto).toContain("Esse serve");
    expect(r.dados?.tipo).toBe("cartoes");
    expect(r.dados && "itens" in r.dados && r.dados.itens[0].situacao).toBe("Em construção");
  });

  it("descarta slug que não existe — e não vira cartão vazio", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: { resposta: "Olha esse.", imoveis: ["canvas-alphaville"] },
      latenciaMs: 10,
      tokensEntrada: 1,
      tokensSaida: 1,
      modelo: "m",
    });

    const r = await turnoDoConsultor(base);
    expect(r.dados).toBeNull();
  });

  it("faz a conta em CÓDIGO quando a IA pede simulação", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: {
        resposta: "Vamos ver se fecha.",
        simular: { rendaMensal: 12000, entrada: 200000, valorImovel: 400000, cidade: "Barueri" },
      },
      latenciaMs: 10,
      tokensEntrada: 1,
      tokensSaida: 1,
      modelo: "m",
    });

    const r = await turnoDoConsultor(base);
    expect(r.dados?.tipo).toBe("simulacao");
    if (r.dados?.tipo === "simulacao") {
      expect(r.dados.resultado.premissas.length).toBeGreaterThan(0);
      expect(r.dados.resultado.fecha).toBe(true);
    }
  });

  it("corta número de crédito inventado no texto", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: { resposta: "O subsídio da Faixa 1 chega a R$ 91.000 hoje." },
      latenciaMs: 10,
      tokensEntrada: 1,
      tokensSaida: 1,
      modelo: "m",
    });

    const r = await turnoDoConsultor(base);
    expect(r.texto).not.toContain("91.000");
  });

  it("motor fora do ar vira degradação honesta, não silêncio", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "http_429", latenciaMs: 10 });

    const r = await turnoDoConsultor(base);
    expect(r.texto.length).toBeGreaterThan(20);
    expect(r.dados).toBeNull();
    expect(r.falhou).toBe(true);
  });

  it("JSON torto não derruba o turno", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: { coisa: "errada" },
      latenciaMs: 10,
      tokensEntrada: 1,
      tokensSaida: 1,
      modelo: "m",
    });

    const r = await turnoDoConsultor(base);
    expect(r.falhou).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/consultor/turno.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/consultor/turno.ts`:

```ts
import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { soarHumano } from "@/lib/whatsapp/vozHumana";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { blocoDeCredito, blocoDeObjecoes, blocoDoCatalogo, cartaoDoImovel } from "./conhecimento";
import { cortarCreditoInventado, numerosPermitidos, slugsValidos } from "./guardrails";
import { montarPromptDoConsultor } from "./prompt";
import { simularFinanciamento, type EntradaSimulacao } from "./financiamento";
import type { DadosDoConsultor, MensagemDoConsultor } from "./contrato";

/**
 * O turno do consultor: o corretor perguntou; o que a IA responde?
 *
 * UMA chamada de LLM. Tudo o que é conta, link ou escolha de imóvel acontece
 * DEPOIS dela, em código: a IA devolve slug e um pedido de simulação, e este
 * arquivo resolve os dois. É o que impede a resposta de citar imóvel que não
 * existe e de mandar número calculado de cabeça.
 */

const ORCAMENTO_MS = 20_000;
/** 20 mensagens: 12 cobria só umas seis trocas e o assunto saía da janela. */
const JANELA_DO_HISTORICO = 20;

export type RespostaDoConsultor = {
  texto: string;
  dados: DadosDoConsultor | null;
  /** A versão de WhatsApp, quando a IA escreveu uma. */
  textoCliente: string | null;
  /** `true` = o motor caiu ou devolveu fora do contrato. */
  falhou: boolean;
};

const CONTINGENCIA =
  "Não consegui consultar agora — o motor de IA não respondeu. Tenta de novo em alguns segundos; se persistir, a ficha do imóvel no painel tem a informação completa.";

type RespostaBruta = {
  resposta: string;
  imoveis: string[];
  simular: EntradaSimulacao | null;
  textoCliente: string | null;
};

/** Lê o JSON da IA; `null` quando não tem a forma mínima (uma resposta). */
export function lerRespostaDaIa(json: unknown): RespostaBruta | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const resposta = typeof j.resposta === "string" ? j.resposta.trim() : "";
  if (!resposta) return null;

  const s = j.simular as Record<string, unknown> | undefined;
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const simular =
    s && numero(s.rendaMensal) !== null && numero(s.valorImovel) !== null
      ? {
          rendaMensal: numero(s.rendaMensal) as number,
          entrada: numero(s.entrada) ?? 0,
          fgts: numero(s.fgts) ?? 0,
          valorImovel: numero(s.valorImovel) as number,
          cidade: typeof s.cidade === "string" ? s.cidade : undefined,
        }
      : null;

  return {
    resposta,
    imoveis: Array.isArray(j.imoveis) ? j.imoveis.filter((x): x is string => typeof x === "string") : [],
    simular,
    textoCliente: typeof j.textoCliente === "string" && j.textoCliente.trim() ? j.textoCliente.trim() : null,
  };
}

export async function turnoDoConsultor(params: {
  pedido: string;
  historico: MensagemDoConsultor[];
  catalogo: Empreendimento[];
  credito: ParametrosCredito;
  /** Few-shot do corpus real; vazio é caso normal. */
  exemplos: string;
  agora?: Date;
}): Promise<RespostaDoConsultor> {
  const agora = params.agora ?? new Date();

  const prompt = montarPromptDoConsultor({
    blocoCatalogo: blocoDoCatalogo(params.catalogo),
    blocoCredito: blocoDeCredito(params.credito, agora),
    blocoObjecoes: blocoDeObjecoes(params.exemplos),
    historico: params.historico
      .slice(-JANELA_DO_HISTORICO)
      .map((m) => `${m.papel === "corretor" ? "Corretor" : "Você"}: ${m.conteudo}`),
    pedido: params.pedido,
  });

  const r = await chamarLlmJson(prompt, { temperature: 0, orcamentoMs: ORCAMENTO_MS });
  if (!r.ok) {
    console.warn(`[consultor] motor falhou: ${r.erro}`);
    return { texto: CONTINGENCIA, dados: null, textoCliente: null, falhou: true };
  }

  const bruta = lerRespostaDaIa(r.json);
  if (!bruta) {
    console.warn("[consultor] resposta fora do contrato");
    return { texto: CONTINGENCIA, dados: null, textoCliente: null, falhou: true };
  }

  // A conta acontece ANTES do corte: os números dela são permitidos no texto.
  const simulacao = bruta.simular ? simularFinanciamento(bruta.simular, params.credito) : null;
  const permitidos = numerosPermitidos(params.credito, simulacao);
  const texto = cortarCreditoInventado(soarHumano(bruta.resposta), permitidos);

  /*
   * UM `dados` por mensagem, e a simulação ganha da indicação: quem pediu
   * "isso fecha?" está esperando o número, não uma vitrine. O cartão do
   * imóvel citado continua no texto, pelo nome.
   */
  let dados: DadosDoConsultor | null = null;
  if (simulacao && bruta.simular) {
    dados = { tipo: "simulacao", entrada: bruta.simular, resultado: simulacao };
  } else {
    const slugs = slugsValidos(bruta.imoveis, params.catalogo);
    if (slugs.length > 0) {
      const porSlug = new Map(params.catalogo.map((e) => [e.slug, e]));
      dados = {
        tipo: "cartoes",
        itens: slugs.map((s) => cartaoDoImovel(porSlug.get(s) as Empreendimento)),
      };
    }
  }

  return {
    texto,
    dados,
    textoCliente: bruta.textoCliente ? soarHumano(bruta.textoCliente) : null,
    falhou: false,
  };
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/lib/consultor/turno.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultor/turno.ts src/lib/consultor/turno.test.ts
git commit -m "feat(consultor): o turno — uma chamada de LLM, cartão e conta em código"
```

---

### Task 10: As ações e a tela

> **Skill a invocar antes:** `frontend-design:frontend-design` + `tailwindcss-mobile-first`. E, antes de escrever qualquer coisa de Next: ler `node_modules/next/dist/docs/`.

**Files:**
- Create: `src/app/corretor/(painel)/consultor/acoes.ts`
- Create: `src/app/corretor/(painel)/consultor/page.tsx`
- Create: `src/app/corretor/(painel)/consultor/ChatConsultor.tsx`

**Interfaces:**
- Consumes: repositório, turno, `getEmpreendimentosDoPainel`, `getParametrosCredito`, `buscarExemplosFewShot`, `ChatBase`, `ListaDeConversas`, `useAvisos`.
- Produces: `EstadoDoChatConsultor`, `enviarMensagemDoConsultor(params)`, `abrirConversaDoConsultor(id)`, `excluirConversa(id)`.

- [ ] **Step 1: Escrever `acoes.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { buscarExemplosFewShot } from "@/lib/whatsapp/aprendizadoContinuo";
import {
  carregarConversaDoConsultor,
  conversaDoCorretor,
  criarConversaDoConsultor,
  excluirConversaDoConsultor,
  gravarMensagemDoConsultor,
  listarConversasDoConsultor,
} from "@/lib/consultor/repositorio";
import { turnoDoConsultor } from "@/lib/consultor/turno";
import {
  tituloDaConversa,
  type ConversaDoConsultor,
  type MensagemDoConsultor,
} from "@/lib/consultor/contrato";

/**
 * As ações do consultor.
 *
 * Quem pode é sempre decisão da SESSÃO (`getCorretorLogado`, `conversaDoCorretor`,
 * que a RLS recorta); a service key, dentro do repositório, só executa depois.
 *
 * Nada aqui gasta imagem nem vídeo: o consultor só faz chamada de texto.
 */

const ROTA = "/corretor/consultor";

export type EstadoDoChatConsultor = {
  conversa: ConversaDoConsultor;
  mensagens: MensagemDoConsultor[];
};

export async function listarConversas(): Promise<ConversaDoConsultor[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];
  return listarConversasDoConsultor();
}

export async function abrirConversaDoConsultor(
  conversaId: string,
): Promise<EstadoDoChatConsultor | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const c = await carregarConversaDoConsultor(conversaId);
  if (!c) return { erro: "Conversa não encontrada." };
  return c;
}

export async function enviarMensagemDoConsultor(params: {
  conversaId: string | null;
  texto: string;
  escolha?: { perguntaId: string; pergunta: string } | null;
}): Promise<EstadoDoChatConsultor | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const texto = params.texto.trim();
  if (!texto) return { erro: "Escreva a sua pergunta." };

  // Cria ANTES de chamar a IA: se o motor cair no meio, a pergunta já está
  // salva e o corretor não digita de novo.
  let conversaId = params.conversaId;
  if (conversaId) {
    if (!(await conversaDoCorretor(conversaId))) return { erro: "Conversa não encontrada." };
  } else {
    conversaId = await criarConversaDoConsultor({
      corretorId: corretor.id,
      titulo: tituloDaConversa(texto),
    });
  }

  await gravarMensagemDoConsultor({
    conversaId,
    papel: "corretor",
    conteudo: texto,
    dados: params.escolha
      ? { tipo: "escolha", perguntaId: params.escolha.perguntaId, pergunta: params.escolha.pergunta, escolha: texto }
      : null,
  });

  const anterior = await carregarConversaDoConsultor(conversaId);

  const [catalogo, credito] = await Promise.all([
    getEmpreendimentosDoPainel(),
    getParametrosCredito(),
  ]);
  // O consultor recomenda o que dá para vender: rascunho fica de fora.
  const publicados = catalogo.filter((e) => e.publicado !== false);

  const exemplos = await buscarExemplosFewShot({
    corretorId: corretor.id,
    mensagemAtual: texto,
    catalogo: publicados,
  });

  const r = await turnoDoConsultor({
    pedido: texto,
    historico: anterior?.mensagens ?? [],
    catalogo: publicados,
    credito,
    exemplos,
  });

  await gravarMensagemDoConsultor({
    conversaId,
    papel: "ia",
    conteudo: r.texto,
    dados: r.dados,
  });

  // O texto pronto para o cliente vira mensagem PRÓPRIA: ele tem um botão de
  // copiar e não pode se misturar ao raciocínio que o corretor está lendo.
  if (r.textoCliente) {
    await gravarMensagemDoConsultor({
      conversaId,
      papel: "ia",
      conteudo: "Para mandar pro cliente:",
      dados: { tipo: "texto_cliente", texto: r.textoCliente },
    });
  }

  revalidatePath(ROTA);
  const atual = await carregarConversaDoConsultor(conversaId);
  return atual ?? { erro: "Falha ao recarregar a conversa." };
}

export async function excluirConversa(conversaId: string): Promise<{ ok: true } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const apagou = await excluirConversaDoConsultor(conversaId);
  if (!apagou) return { erro: "Não foi possível apagar." };
  revalidatePath(ROTA);
  return { ok: true };
}
```

- [ ] **Step 2: Escrever `page.tsx`**

```tsx
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { listarConversas } from "./acoes";
import { ChatConsultor } from "./ChatConsultor";

export const dynamic = "force-dynamic";

export default async function ConsultorPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const [conversas, credito] = await Promise.all([listarConversas(), getParametrosCredito()]);

  return (
    <div className="space-y-4">
      <CabecalhoDeTela
        secao="Consultor"
        titulo="Pergunte o que quiser sobre o portfólio e o negócio"
        descricao="Ele conhece os imóveis publicados, as regras de crédito e o que já funcionou nas conversas desta casa."
      />
      <ChatConsultor conversasIniciais={conversas} conferidoEm={credito.conferidoEm} />
    </div>
  );
}
```

(Conferir a assinatura real de `CabecalhoDeTela` antes de usar — se as props diferirem, seguir as do componente, não estas.)

- [ ] **Step 3: Escrever `ChatConsultor.tsx`**

Espelha `ChatDeArte.tsx`: `useState` para conversas/estado/pendente/pensando, `aplicar()` com `falhar()` do `useAvisos`, `ListaDeConversas` na lateral (`order-2` no celular), `ChatBase` com `renderAbaixo`.

```tsx
"use client";

import { useState } from "react";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { PerguntaDeChat } from "@/app/corretor/(painel)/_componentes/chatTipos";
import type {
  ConversaDoConsultor,
  DadosDoConsultor,
  MensagemDoConsultor,
} from "@/lib/consultor/contrato";
import {
  abrirConversaDoConsultor,
  enviarMensagemDoConsultor,
  excluirConversa,
  type EstadoDoChatConsultor,
} from "./acoes";

/**
 * O consultor imobiliário, em forma de chat.
 *
 * A casca é a mesma do Estúdio (`ChatBase`); o que muda é o que aparece
 * embaixo do balão — cartão de imóvel, quadro de simulação, texto pronto para
 * o cliente. Nenhuma chamada paga sai desta tela: só texto.
 */
export function ChatConsultor({
  conversasIniciais,
  conferidoEm,
}: {
  conversasIniciais: ConversaDoConsultor[];
  conferidoEm: string;
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChatConsultor | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);

  const aplicar = (r: EstadoDoChatConsultor | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => [r.conversa, ...lista.filter((c) => c.id !== r.conversa.id)]);
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await enviarMensagemDoConsultor({
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if (!aplicar(r)) throw new Error("falhou");
    } catch {
      // Erro de rede não devolve `{erro}` — sem este ramo a tela destrava
      // muda, que parece ter dado certo.
      falhar("Não consegui enviar. Confira a conexão e tente de novo.");
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Copiado. É só colar na conversa do cliente.");
    } catch {
      falhar("O navegador não deixou copiar. Selecione o texto e copie à mão.");
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <ListaDeConversas
        conversas={conversas}
        ativa={estado?.conversa.id ?? null}
        onAbrir={(id) => void abrirConversaDoConsultor(id).then(aplicar)}
        onNova={() => setEstado(null)}
        onExcluir={async (id) => {
          const r = await excluirConversa(id);
          if ("erro" in r) return falhar(r.erro);
          setConversas((l) => l.filter((c) => c.id !== id));
          if (estado?.conversa.id === id) setEstado(null);
        }}
      />

      <ChatBase<DadosDoConsultor>
        mensagens={(estado?.mensagens ?? []) as MensagemDoConsultor[]}
        pendente={pendente}
        pensando={pensando}
        placeholder="Ex.: renda de 8 mil, quer 2 dorm em Barueri, o que serve?"
        vazio={
          <>
            <p className="font-medium">Pergunte como perguntaria a um gerente experiente.</p>
            <p className="mt-2">
              Ele conhece os imóveis publicados, as regras de crédito (conferidas em {conferidoEm}) e
              o que já funcionou nas conversas desta casa.
            </p>
          </>
        }
        onEnviar={(t) => enviar(t)}
        onEscolher={(p: PerguntaDeChat, escolha) =>
          enviar(escolha, { perguntaId: p.id, pergunta: p.texto })
        }
        renderAbaixo={(m) => {
          const d = m.dados;
          if (!d) return null;
          if (d.tipo === "cartoes") return <Cartoes itens={d.itens} />;
          if (d.tipo === "simulacao") return <QuadroDeSimulacao dados={d} />;
          if (d.tipo === "texto_cliente")
            return <TextoParaCliente texto={d.texto} onCopiar={() => void copiar(d.texto)} />;
          return null;
        }}
      />
    </div>
  );
}
```

Os três subcomponentes ficam no mesmo arquivo:

- **`Cartoes`** — grade de 1 coluna no celular, 2 a partir de `sm`. Cada cartão: capa (`next/image` com `alt` do nome), nome, `bairro, cidade`, `situacao`, `resumoFicha`, preço formatado em `pt-BR`, e um `<Link href={'/corretor/imoveis/' + slug}>` com `min-h-11`. Régua de etapa não se aplica aqui — o cartão é de imóvel, não de lead.
- **`QuadroDeSimulacao`** — cabeçalho com o veredito em uma linha ("Fecha" / "Faltam R$ X"), depois as linhas: faixa, taxa, prazo, subsídio, recursos próprios, parcela estimada, ITBI. Abaixo, `premissas` em `text-fluid-xs text-apoio` e `avisos` em destaque. **As premissas nunca ficam atrás de um clique** — estimativa sem premissa visível é número que ninguém pode conferir.
- **`TextoParaCliente`** — o texto em bloco com fundo `bg-elevado` e um botão "Copiar" de `min-h-11`.

- [ ] **Step 4: Conferir tipos e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/corretor/(painel)/consultor" "src/lib/consultor" "src/lib/credito"`
Expected: sem erro, sem `any` novo (a catraca do lint está em 8).

- [ ] **Step 5: Medir no celular, com o CSS de produção**

Run: `npm run build && npm run start` e, com o Playwright já instalado, abrir `/corretor/consultor` em 320, 360 e 390px.
Expected: `scrollWidth <= clientWidth` na página; todo alvo tocável com 44px; quadro de simulação e cartões sem estourar. Se a grade de cartões vazar, é `min-width: auto` do item de flex/grid — a saída é quebrar linha, não rolar de lado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/corretor/(painel)/consultor"
git commit -m "feat(consultor): tela do chat, com cartão, simulação e copiar pro cliente"
```

---

### Task 11: O sétimo tópico do menu

> **Skill a invocar antes:** `superpowers:test-driven-development`

**Files:**
- Modify: `src/app/corretor/(painel)/_componentes/navegacao.tsx`
- Modify: `src/app/corretor/(painel)/_componentes/navegacao.test.ts`
- Modify: `src/app/globals.css` (se o módulo novo ganhar cor própria)

**Interfaces:**
- Produces: destino `/corretor/consultor` em `GRUPOS_NAV`.

- [ ] **Step 1: Escrever o teste primeiro**

Acrescentar em `navegacao.test.ts`:

```ts
  it("Consultor é destino de menu, e o teto de sete continua valendo", () => {
    /*
     * O sétimo tópico bate EXATAMENTE no teto, e a escolha é deliberada:
     * ferramenta de uso diário que vive atrás de um clique extra não é usada
     * — foi o que aconteceu com o aviso de apelidos, que não moveu nada em
     * cinco dias porque morava dentro do editor de imóvel.
     *
     * O próximo destino que alguém quiser criar NÃO cabe: vira subtópico.
     */
    const itens = gruposVisiveis(true).flatMap((g) => g.itens);
    expect(itens.some((i) => i.href === "/corretor/consultor")).toBe(true);
    expect(itens.length).toBeLessThanOrEqual(7);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/corretor/(painel)/_componentes/navegacao.test.ts"`
Expected: FAIL — `/corretor/consultor` ainda não está no menu.

- [ ] **Step 3: Acrescentar o destino**

Em `GRUPOS_NAV`, no grupo "Trabalho", depois de Imóveis:

```tsx
      {
        /*
         * O sétimo destino, e o teto. Consultor é a ferramenta que responde
         * "qual imóvel serve para esta pessoa?" e "isso fecha?" — as duas
         * perguntas que o corretor faz todo dia e que nenhuma outra tela do
         * painel respondia.
         */
        href: "/corretor/consultor",
        label: "Consultor",
        icone: IconeConsultor,
      },
```

Criar `IconeConsultor` junto dos outros ícones do arquivo (um balão com uma casa dentro, `stroke="currentColor"`, `strokeWidth="1.8"`, sem `fill`).

- [ ] **Step 4: Rodar a suíte inteira de navegação**

Run: `npx vitest run "src/app/corretor/(painel)/_componentes/"`
Expected: PASS. Atenção às guardas vizinhas: "nenhum subtópico é também um tópico" e "gestor vê exatamente um destino a mais".

- [ ] **Step 5: Conferir a cor do módulo**

Se `moduloAtivo()` não reconhecer `/corretor/consultor`, ele herda o acento padrão. Decidir uma das duas, e escrever o motivo no código:
- **(a)** mapear para um módulo existente (o mais próximo é Imóveis), ou
- **(b)** criar `[data-modulo="consultor"]` no `globals.css`.

Se for (b): declarar `--color-acento`, `--color-acento-hover`, `--color-acento-lavado`, `--color-acento-linha`, `--color-acento-suave` com `light-dark()`, e rodar `npm run paleta` — ela cobra contraste AA nos três temas, separação de matiz e classe que o Tailwind não gerou.

Run: `npm run build && CHROMIUM_PATH=$(node -e "console.log(require('@playwright/test').chromium.executablePath())") npm run paleta`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/corretor/(painel)/_componentes/navegacao.tsx" "src/app/corretor/(painel)/_componentes/navegacao.test.ts" src/app/globals.css
git commit -m "feat(painel): Consultor vira o sétimo destino do menu"
```

---

### Task 12: A tela de parâmetros de crédito (gestor)

> **Skill a invocar antes:** `frontend-design:frontend-design`

**Files:**
- Create: `src/app/corretor/(painel)/admin/credito/page.tsx`
- Create: `src/app/corretor/(painel)/admin/credito/acoes.ts`
- Create: `src/app/corretor/(painel)/admin/credito/FormularioCredito.tsx`
- Modify: `src/app/corretor/(painel)/_componentes/navegacao.tsx` (subtópico de Administração)

**Interfaces:**
- Consumes: `exigirGestorNaPagina`, `exigirGestorNaAcao`, `getParametrosCredito`, `ParametrosCredito`.
- Produces: `salvarParametrosCredito(params): Promise<{ok:true} | {erro:string}>`.

- [ ] **Step 1: `acoes.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import type { ParametrosCredito } from "@/lib/credito/tipos";

/**
 * Editar os parâmetros de crédito.
 *
 * A decisão de QUEM pode é de `exigirGestorNaAcao()` com o cliente de SESSÃO;
 * a função do banco confere o papel de novo e valida faixa absurda. Duas
 * conferências de propósito: a de cá dá mensagem boa, a de lá vale mesmo que
 * alguém chame o PostgREST direto.
 */
export async function salvarParametrosCredito(
  p: ParametrosCredito,
): Promise<{ ok: true } | { erro: string }> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return guarda;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("atualizar_parametros_credito", {
    p_faixas: p.faixas as unknown as never,
    p_teto_fgts_imovel: p.tetoFgtsImovel,
    p_taxa_sbpe_anual: p.taxaSbpeAnual,
    p_prazo_maximo_meses: p.prazoMaximoMeses,
    p_comprometimento_maximo: p.comprometimentoMaximo,
    p_itbi_por_cidade: p.itbiPorCidade as unknown as never,
    p_conferido_em: p.conferidoEm,
  });

  if (error) return { erro: "Não consegui salvar. Tente de novo." };
  if (data !== true) return { erro: "Valor recusado. Confira taxa, prazo e comprometimento." };

  // O bloco de crédito entra no prompt a cada turno: a próxima resposta já
  // usa o número novo, sem redeploy.
  revalidatePath("/corretor/admin/credito");
  revalidatePath("/corretor/consultor");
  return { ok: true };
}
```

(Conferir a forma real de retorno de `exigirGestorNaAcao()` em `src/lib/guardas.ts:44` e adaptar o `if` — o formato acima assume `{erro: string}` no caminho negado.)

- [ ] **Step 2: `page.tsx` + `FormularioCredito.tsx`**

`page.tsx` chama `exigirGestorNaPagina()` (guarda em CADA `page.tsx` do segmento — layout não re-executa entre rotas irmãs), lê `getParametrosCredito()` e passa ao formulário.

O formulário mostra, do topo para baixo:
1. **A data da última conferência, em destaque**, com "faz N dias". É o número que decide se o resto vale.
2. As faixas do MCMV, uma linha por faixa (nome, renda-teto, subsídio, taxa), com botão de acrescentar e remover.
3. Teto do FGTS, taxa SBPE, prazo máximo, comprometimento máximo.
4. ITBI por cidade (par cidade → alíquota).
5. Barra de salvar fixa no polegar, com `Avisos` para sucesso e erro.

Ao salvar, `conferidoEm` vira **a data de hoje** por padrão, com o campo editável: quem revisou a tabela hoje está afirmando que conferiu hoje.

- [ ] **Step 3: Acrescentar o subtópico**

Em `GRUPOS_NAV`, dentro de Administração:

```tsx
          { href: "/corretor/admin/credito", label: "Crédito", icone: IconeCredito },
```

- [ ] **Step 4: Rodar tudo**

Run: `npx vitest run "src/app/corretor/(painel)/_componentes/" && npx tsc --noEmit && npx eslint "src/app/corretor/(painel)/admin/credito"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/corretor/(painel)/admin/credito" "src/app/corretor/(painel)/_componentes/navegacao.tsx"
git commit -m "feat(admin): tela de parâmetros de crédito, só para o gestor"
```

---

### Task 13: Medir a qualidade da resposta, verificar e registrar

> **Skills a invocar antes, NESTA ORDEM:** `error-analysis` → `write-judge-prompt` → `validate-evaluator`. Depois: `superpowers:verification-before-completion` → `superpowers:requesting-code-review`. E ao encerrar: `desktop-commander:obsidian-vault`.

Esta base já escreveu **quatro critérios de eval que reprovaram o comportamento CERTO** por serem inventados em vez de derivados dos dados. Por isso a ordem: ler transcrição real primeiro, categorizar a falha, e só então escrever critério.

**Files:**
- Create: `docs/superpowers/notas/2026-09-09-consultor-primeiras-medidas.md` (o que as transcrições mostraram)
- Create: `vault/10-notas/consultor-imobiliario-no-painel.md`
- Modify: `vault/20-mocs/MOC — CRM e Painel.md`
- Modify: `docs/MEMORIA.md`

- [ ] **Step 1: Exercitar o chat com dez perguntas reais**

Com a chave da OpenAI configurada, abrir `/corretor/consultor` e fazer, uma a uma, perguntas que cubram os quatro escopos:

1. "renda de 8 mil, casal sem filho, quer 2 dorm em Barueri — o que serve?"
2. "esse cliente tem 40 mil de entrada e 30 de FGTS, o Eternity fecha?"
3. "qual o mais barato que a gente tem?"
4. "cliente disse que tá caro, o que eu respondo?"
5. "ele quer saber quanto é o ITBI"
6. "o que precisa de documento pra dar entrada no financiamento?"
7. "tem algo pronto pra morar na Aldeia?"
8. "qual a metragem do apartamento de 3 dorm do Eternity?"
9. "o cliente perguntou do Dom Barueri, que não é nosso"
10. "manda uma mensagem pra ele sobre o Eternity"

**Salvar as dez transcrições** — elas são o insumo da análise de erro, e ler transcrição é medição de outro tipo, não o que se faz quando falta medição.

- [ ] **Step 2: Análise de erro (open coding, sem lista pronta)**

Invocar `error-analysis` e categorizar as falhas SEM dar a lista de categorias de antemão — dar a lista faz o modelo confirmar as hipóteses de quem a escreveu.

Ordenar por **CONVERSAS afetadas**, não por ocorrências: oito ocorrências numa conversa é um caso; quatro em quatro conversas é padrão.

Escrever o achado em `docs/superpowers/notas/2026-09-09-consultor-primeiras-medidas.md`, com a contagem.

- [ ] **Step 3: Escrever o juiz só para o que a análise apontou**

Invocar `write-judge-prompt` para as duas ou três falhas mais frequentes, e `validate-evaluator` para calibrar contra as notas humanas das dez transcrições. **Juiz no mesmo provedor do agente é admissível, mas carimbado** (`juizIndependente: false`) e com modelo diferente (`gpt-4.1` × `gpt-4.1-mini`).

Se a análise não apontar falha recorrente, **não escrever juiz nenhum**: critério decorativo é o defeito mais antigo desta base.

- [ ] **Step 4: Registrar o custo real**

Medir os tokens de entrada e saída de um turno típico (o prompt leva o catálogo inteiro) e escrever o número na seção "Riscos conhecidos" da spec. A conta divide o mesmo saldo do atendimento: sem crédito, a Sofia cai junto.

- [ ] **Step 5: Verificação antes de dizer "pronto"**

Invocar `superpowers:verification-before-completion` e rodar, na ordem:

```bash
npm ci
npx tsc --noEmit
npx vitest run
npm run build
npx eslint "src/lib/consultor" "src/lib/credito" "src/app/corretor/(painel)/consultor" "src/app/corretor/(painel)/admin/credito"
```

Expected: tudo verde. Guardas que precisam passar em especial: `migrations.test.ts`, `tabelasSeguras.test.ts`, `navegacao.test.ts`, `naoRolaDeLado.test.ts`, `chatBase.test.ts`.

- [ ] **Step 6: Revisão de código**

Invocar `superpowers:requesting-code-review` e depois `/code-review` sobre o diff da branch.

- [ ] **Step 7: Vault + MEMORIA (obrigatório pelo `AGENTS.md`)**

Invocar `desktop-commander:obsidian-vault` e criar `vault/10-notas/consultor-imobiliario-no-painel.md` com frontmatter completo (`title`, `tags` do vocabulário fechado em `vault/10-notas/vocabulario-de-tags.md`, `type`, `status`, `custou`, `codigo`, `summary`, `updated` com a data de hoje), linkada do `vault/20-mocs/MOC — CRM e Painel.md`.

Em `docs/MEMORIA.md`, uma seção nova com o que **custou tempo para descobrir** — não o que foi fácil. Candidatos que já se sabe agora:
- A `ChatBase` conhecia o vocabulário do Estúdio, e o segundo chat foi quem revelou.
- A tabela de parâmetros nasce seedada porque tela que nasce vazia é o padrão que já matou sete recursos aqui.
- O preço entra no prompt deste chat, e `semValores.ts` NÃO se aplica — registrado para ninguém "consertar".
- A IA não faz aritmética: extrai e pede; `financiamento.ts` calcula.

- [ ] **Step 8: Commit final**

```bash
git add docs/ vault/
git commit -m "docs: o consultor imobiliário — o que a primeira medição mostrou"
```

---

## Auto-revisão do plano

**Cobertura da spec** — cada seção tem tarefa:

| Seção da spec | Tarefa |
|---|---|
| Módulos `src/lib/consultor/` e `src/lib/credito/` | 3–9 |
| Tabelas 0101 e 0102, RLS, grants, seed | 2, 3 |
| Fluxo do turno | 9 |
| Bloco 1: catálogo completo com preço e ausência em voz alta | 6 |
| Bloco 2: parâmetros de crédito com data | 6, 8 |
| Bloco 3: objeções do corpus | 6, 10 (`buscarExemplosFewShot`) |
| Jurídico sem bloco de dado, com fonte obrigatória | 7 (regra 7 do prompt) |
| Cartão do imóvel (link por código) | 5, 6, 9, 10 |
| Quadro de simulação (conta em código, premissas visíveis) | 4, 9, 10 |
| Copiar pro cliente (`vozHumana`) | 9, 10 |
| Guardrails (slug, número, spec, prazo) | 7, 9 |
| Navegação: 7º tópico | 11 |
| Tela do gestor | 12 |
| Testes e guardas listados na spec | 2, 3, 10, 11, 13 |
| Riscos: custo medido | 13 Step 4 |

**Fora de escopo, confirmado ausente do plano:** RAG, chat público, API da Caixa, histórico compartilhado, voz.

**Consistência de tipos:** `ParametrosCredito`/`FaixaMcmv` (Task 3) usados igual em 4, 6, 7, 8, 9, 12. `EntradaSimulacao`/`Simulacao` (Task 4) usados em 5, 9, 10. `DadosDoConsultor` (Task 5) em 8, 9, 10. `MensagemDeChat<D>`/`PerguntaDeChat`/`ConversaDeChat` (Task 1) em 10. `cartaoDoImovel` (Task 6) em 9. `slugsValidos`/`numerosPermitidos`/`cortarCreditoInventado` (Task 7) em 9.

**Dois pontos que o executor precisa conferir no código antes de escrever** (marcados no corpo das tarefas, não são TODO do plano):
- assinatura real de `CabecalhoDeTela` (Task 10 Step 2);
- forma de retorno de `exigirGestorNaAcao()` em `src/lib/guardas.ts:44` (Task 12 Step 1).
