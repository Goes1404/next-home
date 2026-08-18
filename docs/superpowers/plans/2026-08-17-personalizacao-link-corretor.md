# Personalização do link pessoal do corretor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corretor sobe a própria foto de avatar, escolhe vídeo ou foto de
fundo pro link pessoal, e cura um punhado de "destaques" que aparecem
primeiro pra quem entra pelo link dele — o resto do catálogo segue atrás na
ordem padrão. A página pública dele perde a grade "Acompanhados por".

**Architecture:** Migration única (0015) adiciona as colunas/tabela/policies
necessárias. Toda mutação passa por Server Actions autenticadas
(`src/app/corretor/actions.ts` + `corretorSessao.ts`), lendo/gravando com o
cliente Supabase com sessão (RLS decide o resto). Upload de arquivo vai pro
bucket público `empreendimentos` já existente, sob `corretores/<id>/`. A
ordem personalizada é aplicada em `queries.ts`, no mesmo lugar que já monta
a listagem pública — nenhuma página nova, só dado adicional na consulta que
já existe.

**Tech Stack:** Next.js 16 (Server Actions, App Router), Supabase (Postgres
+ Storage + Auth), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-personalizacao-link-corretor-design.md`

## Global Constraints

- Migrations aplicadas direto no Supabase de produção (sem Docker/CLI local
  disponível), pelo mesmo caminho usado nesta sessão: conexão `pg` via
  Session Pooler, script descartável em scratchpad.
- `src/lib/supabase/types.ts` é editado à mão depois de cada migration —
  sem `gen types` local (Docker indisponível). Conferir contra
  `information_schema` antes de editar.
- Nenhuma nova dependência de npm (nada de lib de drag-and-drop — reordenar
  usa botões ↑/↓).
- Todo Server Action de mutação segue o padrão já estabelecido em
  `salvarPerfil`: `.select("id")` no update pra distinguir "0 linhas
  afetadas por falta de permissão" de sucesso silencioso.
- Commits em português, no mesmo estilo do restante do histórico deste
  repositório.

---

## File Structure

```
supabase/migrations/0015_personalizacao_link.sql   [novo]
src/lib/supabase/types.ts                          [editado à mão]
src/lib/types.ts                                   [+ FundoTipo, + campos em Corretor]
src/lib/corretorAtivo.ts                            [+ fundo_tipo, fundo_foto_url]
src/lib/queries.ts                                  [SELECT_CORRETOR/mapCorretor + ordenar() + destaques + remove getEmpreendimentosPorCorretor]
src/lib/midiaCorretor.ts                            [novo — validação pura, testável]
src/lib/midiaCorretor.test.ts                       [novo]
src/lib/queries.test.ts                             [novo — só a função ordenar()]
src/lib/corretorSessao.ts                           [+ getMeusDestaques]
src/app/corretor/actions.ts                         [+ enviarMidiaCorretor, + salvarDestaques]
src/app/corretor/(painel)/perfil/page.tsx            [avatar vira componente, + card de fundo]
src/app/corretor/(painel)/perfil/EditorAvatar.tsx    [novo]
src/app/corretor/(painel)/perfil/FundoLink.tsx       [novo]
src/app/corretor/(painel)/perfil/SeletorArquivo.tsx  [novo]
src/app/corretor/(painel)/links/page.tsx             [+ seção de destaques]
src/app/corretor/(painel)/links/EditarDestaques.tsx  [novo]
src/components/motion/HeroImageBackground.tsx        [novo]
src/app/(vitrine)/layout.tsx                         [vídeo ou foto]
src/app/(institucional)/layout.tsx                   [vídeo ou foto]
src/app/(institucional)/corretores/[slug]/page.tsx   [remove seção "Acompanhados por"]
```

---

### Task 1: Migration 0015 — banco e Storage

**Files:**
- Create: `supabase/migrations/0015_personalizacao_link.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: colunas `corretores.fundo_tipo` (`'video'|'foto'`, default
  `'video'`), `corretores.fundo_foto_url` (`text|null`); tabela
  `corretor_destaques(corretor_id uuid, empreendimento_slug text, posicao
  smallint)`; `grant update` liberando `video_url`, `fundo_tipo`,
  `fundo_foto_url` pro corretor autenticado; policies de RLS na tabela nova
  e em `storage.objects` para o bucket `empreendimentos`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Personalização do link pessoal: fundo em vídeo ou foto, e destaques do
-- catálogo escolhidos pelo próprio corretor.

alter table corretores
  add column fundo_tipo text not null default 'video'
    check (fundo_tipo in ('video', 'foto')),
  add column fundo_foto_url text;

-- video_url existe desde a 0010 mas nunca foi liberado por GRANT — até
-- agora só um script direto no banco conseguia setá-lo.
grant update (video_url, fundo_tipo, fundo_foto_url) on corretores to authenticated;

create table corretor_destaques (
  corretor_id uuid not null references corretores(id) on delete cascade,
  empreendimento_slug text not null references empreendimentos(slug) on delete cascade,
  posicao smallint not null,
  primary key (corretor_id, empreendimento_slug)
);

alter table corretor_destaques enable row level security;

-- Leitura pública: a ordem personalizada aparece pra QUALQUER visitante que
-- chegou pelo link do corretor, não só pra ele logado — a consulta que
-- monta a home/portfólio roda com o cliente anônimo.
create policy "destaques sao publicos"
  on corretor_destaques for select
  to anon, authenticated
  using (true);

create policy "corretor gerencia os proprios destaques"
  on corretor_destaques for all
  to authenticated
  using (corretor_id = corretor_atual())
  with check (corretor_id = corretor_atual());

grant select, insert, update, delete on corretor_destaques to authenticated;
grant select on corretor_destaques to anon;

-- Storage: corretor só escreve dentro da própria pasta no bucket público
-- já existente (empreendimentos), usado hoje pros vídeos de fundo.
create policy "corretor gerencia a propria pasta de midia"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = corretor_atual()::text
  )
  with check (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = corretor_atual()::text
  );
```

- [ ] **Step 2: Aplicar no Supabase de produção**

Mesmo caminho já usado nesta sessão: script Node descartável em
`scratchpad/`, `pg` client via Session Pooler
(`aws-0-ca-central-1.pooler.supabase.com:5432`), `ssl: { rejectUnauthorized:
false }`. Rodar o SQL do Step 1 inteiro numa transação. Apagar o script do
scratchpad ao final.

- [ ] **Step 3: Conferir por introspecção**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'corretores' and column_name in ('fundo_tipo', 'fundo_foto_url');

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'corretores' and grantee = 'authenticated';

select tablename, policyname from pg_policies where tablename = 'corretor_destaques';
select policyname from pg_policies where tablename = 'objects' and schemaname = 'storage';
```

Esperado: as duas colunas presentes; `column_privileges` incluindo
`video_url`, `fundo_tipo`, `fundo_foto_url` para `authenticated`; as duas
policies de `corretor_destaques`; a policy nova de `storage.objects` na
lista (junto com quaisquer outras já existentes no bucket).

- [ ] **Step 4: Atualizar `src/lib/supabase/types.ts` à mão**

No bloco `corretores` (`Row`, `Insert`, `Update`), adicionar depois de
`foto_url`:

```ts
          fundo_foto_url: string | null
          fundo_tipo: string
```

(em `Insert`, ambos opcionais: `fundo_foto_url?: string | null` e
`fundo_tipo?: string`; em `Update` também opcionais).

Inserir um bloco novo de tabela, em ordem alfabética logo antes de
`corretores:` (depois de `cliques_whatsapp`):

```ts
      corretor_destaques: {
        Row: {
          corretor_id: string
          empreendimento_slug: string
          posicao: number
        }
        Insert: {
          corretor_id: string
          empreendimento_slug: string
          posicao: number
        }
        Update: {
          corretor_id?: string
          empreendimento_slug?: string
          posicao?: number
        }
        Relationships: [
          {
            foreignKeyName: "corretor_destaques_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corretor_destaques_empreendimento_slug_fkey"
            columns: ["empreendimento_slug"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["slug"]
          },
        ]
      }
```

Atualizar o comentário do topo do arquivo: "Última geração: depois da
0013" → "depois da 0015".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_personalizacao_link.sql src/lib/supabase/types.ts
git commit -m "Migration 0015: fundo vídeo/foto e destaques do catálogo por corretor"
```

---

### Task 2: Tipos e camada de leitura do corretor

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/corretorAtivo.ts`
- Modify: `src/lib/queries.ts` (`SELECT_CORRETOR`, `LinhaCorretor`, `mapCorretor`)

**Interfaces:**
- Consumes: colunas `fundo_tipo`/`fundo_foto_url` da Task 1.
- Produces: `Corretor.fundoTipo: FundoTipo`, `Corretor.fundoFotoUrl: string
  | null` — todo tipo que estende `Corretor` (`CorretorAtivo`,
  `CorretorPerfil`, `CorretorSessao`) ganha os dois campos automaticamente.

- [ ] **Step 1: `src/lib/types.ts`**

```ts
export type FundoTipo = "video" | "foto";

export type Corretor = {
  nome: string;
  creci: string;
  whatsapp: string;
  fotoUrl: string | null;
  videoUrl: string | null;
  fundoTipo: FundoTipo;
  fundoFotoUrl: string | null;
};
```

(substitui o `Corretor` atual, que não tem `fundoTipo`/`fundoFotoUrl`.)

- [ ] **Step 2: `src/lib/corretorAtivo.ts`**

```ts
  const { data } = await supabase
    .from("corretores")
    .select("id, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    creci: data.creci,
    whatsapp: data.whatsapp,
    fotoUrl: data.foto_url,
    videoUrl: data.video_url,
    fundoTipo: data.fundo_tipo as CorretorAtivo["fundoTipo"],
    fundoFotoUrl: data.fundo_foto_url,
  };
```

- [ ] **Step 3: `src/lib/queries.ts` — `SELECT_CORRETOR`, `LinhaCorretor`, `mapCorretor`**

```ts
export const SELECT_CORRETOR =
  "id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url, bio";

export type LinhaCorretor = {
  id: string;
  slug: string | null;
  nome: string;
  creci: string;
  whatsapp: string;
  foto_url: string | null;
  bio: string | null;
  video_url: string | null;
  fundo_tipo: string;
  fundo_foto_url: string | null;
};

export function mapCorretor(row: LinhaCorretor): CorretorPerfil {
  return {
    id: row.id,
    slug: row.slug!,
    nome: row.nome,
    creci: row.creci,
    whatsapp: row.whatsapp,
    fotoUrl: row.foto_url,
    videoUrl: row.video_url,
    fundoTipo: row.fundo_tipo as CorretorPerfil["fundoTipo"],
    fundoFotoUrl: row.fundo_foto_url,
    bio: row.bio,
  };
}
```

- [ ] **Step 4: `npx tsc --noEmit`**

Espera-se erro só se algum outro lugar constrói um `Corretor` sem os dois
campos novos — conferir e corrigir cada ocorrência (provavelmente nenhuma
fora de `corretorAtivo.ts`/`queries.ts`, que já foram os dois únicos
lugares que montam `Corretor` a partir do banco).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/corretorAtivo.ts src/lib/queries.ts
git commit -m "Corretor ganha fundoTipo e fundoFotoUrl"
```

---

### Task 3: Ordem personalizada do catálogo — lógica e testes

**Files:**
- Modify: `src/lib/queries.ts` (`ordenar`, `getEmpreendimentos`, remove `getEmpreendimentosPorCorretor`)
- Create: `src/lib/queries.test.ts`

**Interfaces:**
- Consumes: `corretor_destaques` (Task 1), `getCorretorAtivo()`.
- Produces: `export function ordenar(lista, modo, destaquesCorretor?):
  Empreendimento[]` — exportada pela primeira vez, pra ser testável
  isoladamente.

- [ ] **Step 1: Exportar e estender `ordenar()`**

```ts
export function ordenar(
  lista: Empreendimento[],
  modo: Ordenacao,
  destaquesCorretor?: Map<string, number>,
): Empreendimento[] {
  const copia = [...lista];

  if (modo === "recentes") {
    return copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  if (modo === "preco_asc" || modo === "preco_desc") {
    const sinal = modo === "preco_asc" ? 1 : -1;
    return copia.sort((a, b) => {
      if (a.precoAPartir == null) return b.precoAPartir == null ? 0 : 1;
      if (b.precoAPartir == null) return -1;
      return (a.precoAPartir - b.precoAPartir) * sinal;
    });
  }

  if (destaquesCorretor?.size) {
    return copia.sort((a, b) => {
      const posA = destaquesCorretor.get(a.slug);
      const posB = destaquesCorretor.get(b.slug);
      if (posA != null && posB != null) return posA - posB;
      if (posA != null) return -1;
      if (posB != null) return 1;
      return Number(b.destaque) - Number(a.destaque);
    });
  }

  // "destaque": destacados primeiro, depois a ordem curada do cadastro (já
  // aplicada pelo `.order("ordem")` da query).
  return copia.sort((a, b) => Number(b.destaque) - Number(a.destaque));
}
```

- [ ] **Step 2: Buscar os destaques do corretor ativo em `getEmpreendimentos`**

Adicionar logo acima de `getEmpreendimentos`:

```ts
async function buscarDestaquesCorretorAtivo(): Promise<Map<string, number> | undefined> {
  const corretorAtivo = await getCorretorAtivo();
  if (!corretorAtivo) return undefined;

  const supabase = createClient();
  const { data } = await supabase
    .from("corretor_destaques")
    .select("empreendimento_slug, posicao")
    .eq("corretor_id", corretorAtivo.id)
    .order("posicao");

  if (!data || data.length === 0) return undefined;
  return new Map(data.map((d) => [d.empreendimento_slug, d.posicao]));
}
```

E trocar o corpo de `getEmpreendimentos`:

```ts
export async function getEmpreendimentos(
  filtros?: FiltrosEmpreendimento,
  ordenacao: Ordenacao = "destaque",
): Promise<Empreendimento[]> {
  const [todos, destaquesCorretor] = await Promise.all([
    buscarPublicados(),
    buscarDestaquesCorretorAtivo(),
  ]);
  const filtrados = filtros ? todos.filter((e) => bate(e, filtros)) : todos;
  return ordenar(filtrados, ordenacao, destaquesCorretor);
}
```

- [ ] **Step 3: Escrever os testes**

`src/lib/queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ordenar } from "./queries";
import type { Empreendimento } from "./types";

function item(over: Partial<Empreendimento> & { slug: string }): Empreendimento {
  return {
    nome: over.slug,
    tagline: "",
    descricao: "",
    status: "pronto_para_morar",
    tipo: "apartamento",
    finalidade: "venda",
    cidade: "",
    bairro: "",
    endereco: "",
    precoAPartir: null,
    iptu: null,
    condominioValor: null,
    construtora: null,
    totalUnidades: null,
    totalTorres: null,
    totalAndares: null,
    entregaPrevista: null,
    destaque: false,
    lat: null,
    lng: null,
    criadoEm: "2026-01-01T00:00:00Z",
    capa: { tipo: "foto", url: "", alt: "", largura: 1, altura: 1, blurDataUrl: null },
    ...over,
  } as Empreendimento;
}

describe("ordenar — modo destaque com destaques de corretor", () => {
  it("sem mapa de destaques, mantém o comportamento padrão (destacados primeiro)", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b", destaque: true })];
    const resultado = ordenar(lista, "destaque");
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("itens no mapa vêm primeiro, na ordem do mapa", () => {
    const lista = [
      item({ slug: "a", destaque: true }),
      item({ slug: "b" }),
      item({ slug: "c" }),
    ];
    const destaques = new Map([
      ["c", 0],
      ["b", 1],
    ]);
    const resultado = ordenar(lista, "destaque", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["c", "b", "a"]);
  });

  it("slug no mapa que não existe mais na lista é ignorado sem erro", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b" })];
    const destaques = new Map([
      ["fantasma", 0],
      ["b", 1],
    ]);
    const resultado = ordenar(lista, "destaque", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("mapa vazio se comporta como ausente", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b", destaque: true })];
    const resultado = ordenar(lista, "destaque", new Map());
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("ordenação explícita (preco_asc) ignora o mapa de destaques", () => {
    const lista = [
      item({ slug: "a", precoAPartir: 300000 }),
      item({ slug: "b", precoAPartir: 100000 }),
    ];
    const destaques = new Map([["a", 0]]);
    const resultado = ordenar(lista, "preco_asc", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- queries.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Remover `getEmpreendimentosPorCorretor`**

```bash
grep -rn "getEmpreendimentosPorCorretor" src/
```

Remover a função de `queries.ts` (linha ~228 em diante) só depois de
confirmar, no grep, que o único outro lugar que a chama é
`src/app/(institucional)/corretores/[slug]/page.tsx` — que a Task 8 vai
editar para não chamá-la mais. Se a Task 8 ainda não rodou nesta sessão de
execução, adiar este passo específico para o fim da Task 8 em vez de
quebrar o build agora.

- [ ] **Step 6: `npm test && npx tsc --noEmit`**

Expected: sem regressão nos testes existentes (`mensagem.test.ts` etc.),
sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries.ts src/lib/queries.test.ts
git commit -m "Ordem do catálogo respeita os destaques do corretor ativo"
```

---

### Task 4: Upload de mídia — validação e Server Action

**Files:**
- Create: `src/lib/midiaCorretor.ts`
- Create: `src/lib/midiaCorretor.test.ts`
- Modify: `src/app/corretor/actions.ts`

**Interfaces:**
- Produces: `CampoMidia`, `validarMidia(campo, arquivo): string | null`,
  `extensaoPorTipo(tipo): string`, `enviarMidiaCorretor(campo, estado,
  formData): Promise<EstadoForm>` (Server Action).
- Consumes: `EstadoForm` (já existe em `actions.ts`), `exigirSessao()` (já
  existe em `actions.ts`).

- [ ] **Step 1: `src/lib/midiaCorretor.ts`**

```ts
/** Os três campos de mídia que o corretor pode substituir pelo painel. */
export type CampoMidia = "avatar" | "fundo_video" | "fundo_foto";

type LimiteMidia = { bytes: number; tipos: string[]; rotuloTipos: string };

export const LIMITES_MIDIA: Record<CampoMidia, LimiteMidia> = {
  avatar: {
    bytes: 5 * 1024 * 1024,
    tipos: ["image/jpeg", "image/png", "image/webp"],
    rotuloTipos: "JPG, PNG ou WebP",
  },
  fundo_foto: {
    bytes: 5 * 1024 * 1024,
    tipos: ["image/jpeg", "image/png", "image/webp"],
    rotuloTipos: "JPG, PNG ou WebP",
  },
  fundo_video: {
    bytes: 20 * 1024 * 1024,
    tipos: ["video/mp4"],
    rotuloTipos: "MP4",
  },
};

/** `null` quando o arquivo passa nas duas checagens — tamanho e tipo. */
export function validarMidia(
  campo: CampoMidia,
  arquivo: { size: number; type: string },
): string | null {
  const limite = LIMITES_MIDIA[campo];
  if (!limite.tipos.includes(arquivo.type)) {
    return `Formato não suportado. Use ${limite.rotuloTipos}.`;
  }
  if (arquivo.size > limite.bytes) {
    const mb = Math.round(limite.bytes / (1024 * 1024));
    return `Arquivo muito grande. Máximo ${mb}MB.`;
  }
  return null;
}

const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/** Extensão a partir do MIME type real do arquivo — nunca do nome digitado pelo usuário. */
export function extensaoPorTipo(tipo: string): string {
  return EXTENSAO_POR_TIPO[tipo] ?? "bin";
}

/** Path do objeto no bucket a partir da URL pública salva antes do upload. */
export function caminhoDoStorage(url: string): string | null {
  const marcador = "/object/public/empreendimentos/";
  const indice = url.indexOf(marcador);
  return indice === -1 ? null : url.slice(indice + marcador.length);
}
```

- [ ] **Step 2: `src/lib/midiaCorretor.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { caminhoDoStorage, extensaoPorTipo, validarMidia } from "./midiaCorretor";

describe("validarMidia", () => {
  it("aceita um avatar dentro do limite", () => {
    expect(validarMidia("avatar", { size: 1024, type: "image/jpeg" })).toBeNull();
  });

  it("rejeita tipo não suportado", () => {
    expect(validarMidia("avatar", { size: 1024, type: "image/gif" })).toMatch(/Formato/);
  });

  it("rejeita avatar maior que 5MB", () => {
    expect(
      validarMidia("avatar", { size: 6 * 1024 * 1024, type: "image/jpeg" }),
    ).toMatch(/Máximo 5MB/);
  });

  it("aceita vídeo mp4 até 20MB", () => {
    expect(
      validarMidia("fundo_video", { size: 19 * 1024 * 1024, type: "video/mp4" }),
    ).toBeNull();
  });

  it("rejeita vídeo maior que 20MB", () => {
    expect(
      validarMidia("fundo_video", { size: 21 * 1024 * 1024, type: "video/mp4" }),
    ).toMatch(/Máximo 20MB/);
  });

  it("rejeita foto de fundo em formato de vídeo", () => {
    expect(validarMidia("fundo_foto", { size: 1024, type: "video/mp4" })).toMatch(/Formato/);
  });
});

describe("extensaoPorTipo", () => {
  it("mapeia tipos conhecidos", () => {
    expect(extensaoPorTipo("image/jpeg")).toBe("jpg");
    expect(extensaoPorTipo("video/mp4")).toBe("mp4");
  });

  it("cai para 'bin' em tipo desconhecido", () => {
    expect(extensaoPorTipo("application/x-nada")).toBe("bin");
  });
});

describe("caminhoDoStorage", () => {
  it("extrai o path depois do marcador do bucket público", () => {
    const url =
      "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/corretores/abc/avatar-123.jpg";
    expect(caminhoDoStorage(url)).toBe("corretores/abc/avatar-123.jpg");
  });

  it("retorna null pra URL que não é do bucket esperado", () => {
    expect(caminhoDoStorage("https://outro-dominio.com/imagem.jpg")).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar os testes**

Run: `npm test -- midiaCorretor.test.ts`
Expected: 10/10 PASS.

- [ ] **Step 4: `enviarMidiaCorretor` em `src/app/corretor/actions.ts`**

Adicionar aos imports do topo:

```ts
import { caminhoDoStorage, extensaoPorTipo, validarMidia, type CampoMidia } from "@/lib/midiaCorretor";
```

Adicionar a função (perto de `salvarPerfil`, mesma seção de perfil):

```ts
/**
 * Upload de avatar ou fundo (vídeo ou foto) pro Storage, e grava a URL
 * pública na coluna certa. `campo` decide tudo: qual limite de
 * tamanho/tipo vale, em qual coluna a URL entra, e — pros dois campos de
 * fundo — qual `fundo_tipo` a mudança implica (subir um vídeo de fundo
 * troca `fundo_tipo` pra 'video' mesmo que estivesse em 'foto', e
 * vice-versa; não existe um "trocar o tipo" sem enviar o arquivo daquele
 * tipo — evita `fundo_tipo` apontando pra uma URL que nunca existiu).
 */
export async function enviarMidiaCorretor(
  campo: CampoMidia,
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo." };
  }

  const erroValidacao = validarMidia(campo, arquivo);
  if (erroValidacao) return { erro: erroValidacao };

  const { data: linhaAtual } = await supabase
    .from("corretores")
    .select("id, foto_url, video_url, fundo_foto_url")
    .eq("user_id", user.id)
    .single();

  if (!linhaAtual) {
    return { erro: "Sem permissão para editar este cadastro. Fale com quem administra o site." };
  }

  const caminho = `corretores/${linhaAtual.id}/${campo}-${Date.now()}.${extensaoPorTipo(arquivo.type)}`;
  const { error: erroUpload } = await supabase.storage
    .from("empreendimentos")
    .upload(caminho, arquivo);

  if (erroUpload) {
    return { erro: "Não foi possível enviar o arquivo. Tente novamente." };
  }

  const { data: urlPublica } = supabase.storage.from("empreendimentos").getPublicUrl(caminho);

  const resultado =
    campo === "avatar"
      ? await supabase
          .from("corretores")
          .update({ foto_url: urlPublica.publicUrl })
          .eq("user_id", user.id)
          .select("id")
      : campo === "fundo_video"
        ? await supabase
            .from("corretores")
            .update({ video_url: urlPublica.publicUrl, fundo_tipo: "video" })
            .eq("user_id", user.id)
            .select("id")
        : await supabase
            .from("corretores")
            .update({ fundo_foto_url: urlPublica.publicUrl, fundo_tipo: "foto" })
            .eq("user_id", user.id)
            .select("id");

  if (resultado.error || !resultado.data || resultado.data.length === 0) {
    await supabase.storage.from("empreendimentos").remove([caminho]);
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  const urlAntiga =
    campo === "avatar"
      ? linhaAtual.foto_url
      : campo === "fundo_video"
        ? linhaAtual.video_url
        : linhaAtual.fundo_foto_url;

  if (urlAntiga) {
    const caminhoAntigo = caminhoDoStorage(urlAntiga);
    if (caminhoAntigo) await supabase.storage.from("empreendimentos").remove([caminhoAntigo]);
  }

  revalidatePath("/corretor/perfil");
  revalidatePath("/corretores");
  revalidatePath("/", "layout");
  revalidatePath("/portfolio", "layout");
  revalidatePath("/empreendimentos", "layout");

  return { ok: "Enviado com sucesso." };
}
```

- [ ] **Step 5: `npx tsc --noEmit && npm run lint`**

Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/midiaCorretor.ts src/lib/midiaCorretor.test.ts src/app/corretor/actions.ts
git commit -m "Upload de avatar e fundo (vídeo ou foto) pro Storage"
```

---

### Task 5: UI de upload no perfil

**Files:**
- Create: `src/app/corretor/(painel)/perfil/SeletorArquivo.tsx`
- Create: `src/app/corretor/(painel)/perfil/EditorAvatar.tsx`
- Create: `src/app/corretor/(painel)/perfil/FundoLink.tsx`
- Modify: `src/app/corretor/(painel)/perfil/page.tsx`

**Interfaces:**
- Consumes: `enviarMidiaCorretor` (Task 4), `corretor.fotoUrl`,
  `corretor.fundoTipo` (Task 2).

- [ ] **Step 1: `SeletorArquivo.tsx` — input de arquivo genérico, envia sozinho ao escolher**

```tsx
"use client";

import { useActionState, useRef } from "react";
import type { EstadoForm } from "@/app/corretor/actions";

export function SeletorArquivo({
  action,
  accept,
  rotulo,
  dica,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  accept: string;
  rotulo: string;
  dica: string;
}) {
  const [estado, dispatch, pendente] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={dispatch}>
      <label className="text-fluid-sm inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-mist-200 transition-colors hover:border-brand-300">
        {pendente ? "Enviando…" : rotulo}
        <input
          type="file"
          name="arquivo"
          accept={accept}
          disabled={pendente}
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
      <p className="text-fluid-xs mt-1 text-mist-500">{dica}</p>
      {estado?.erro && <p className="text-fluid-xs mt-1 text-red-300">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-xs mt-1 text-brand-200">{estado.ok}</p>}
    </form>
  );
}
```

- [ ] **Step 2: `EditorAvatar.tsx`**

```tsx
"use client";

import Image from "next/image";
import { enviarMidiaCorretor } from "@/app/corretor/actions";
import { iniciais } from "@/lib/format";
import { SeletorArquivo } from "./SeletorArquivo";

export function EditorAvatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        {fotoUrl ? (
          <Image
            src={fotoUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover ring-2 ring-brand-400/60 shadow-[0_0_15px_rgba(47,214,164,0.3)]"
          />
        ) : (
          <span
            aria-hidden
            className="font-display flex h-18 w-18 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-azure-500 text-xl font-bold text-white ring-2 ring-brand-400/60 shadow-[0_0_15px_rgba(47,214,164,0.3)]"
          >
            {iniciais(nome)}
          </span>
        )}
        <span
          title="Conta Ativa"
          className="absolute bottom-0 right-0 h-4.5 w-4.5 rounded-full bg-[#25D366] ring-2 ring-ink-950 shadow-[0_0_8px_#25D366]"
        />
      </div>

      <SeletorArquivo
        action={enviarMidiaCorretor.bind(null, "avatar")}
        accept="image/jpeg,image/png,image/webp"
        rotulo="Trocar foto"
        dica="Imagem até 5MB (JPG, PNG ou WebP)."
      />
    </div>
  );
}
```

- [ ] **Step 3: `FundoLink.tsx`**

```tsx
"use client";

import { useState } from "react";
import { enviarMidiaCorretor } from "@/app/corretor/actions";
import type { FundoTipo } from "@/lib/types";
import { SeletorArquivo } from "./SeletorArquivo";

const BOTAO_BASE = "text-fluid-sm rounded-full px-4 py-2 font-medium transition-colors";
const BOTAO_ATIVO = "bg-brand-500 text-white";
const BOTAO_INATIVO = "border border-white/15 text-mist-300 hover:border-white/30";

export function FundoLink({ fundoTipo }: { fundoTipo: FundoTipo }) {
  const [tipo, setTipo] = useState<FundoTipo>(fundoTipo);

  return (
    <div>
      <p className="font-display text-mist-50">Fundo do seu link</p>
      <p className="text-fluid-sm mt-1 mb-4 text-mist-400">
        O que aparece atrás do site pra quem entra pelo seu link pessoal.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTipo("video")}
          className={`${BOTAO_BASE} ${tipo === "video" ? BOTAO_ATIVO : BOTAO_INATIVO}`}
        >
          Vídeo
        </button>
        <button
          type="button"
          onClick={() => setTipo("foto")}
          className={`${BOTAO_BASE} ${tipo === "foto" ? BOTAO_ATIVO : BOTAO_INATIVO}`}
        >
          Foto
        </button>
      </div>

      <div className="mt-4">
        {tipo === "video" ? (
          <SeletorArquivo
            action={enviarMidiaCorretor.bind(null, "fundo_video")}
            accept="video/mp4"
            rotulo="Trocar vídeo"
            dica="Vídeo até 20MB (MP4)."
          />
        ) : (
          <SeletorArquivo
            action={enviarMidiaCorretor.bind(null, "fundo_foto")}
            accept="image/jpeg,image/png,image/webp"
            rotulo="Trocar foto de fundo"
            dica="Imagem até 5MB (JPG, PNG ou WebP)."
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx` — trocar o bloco de avatar estático e remover o aviso**

Substituir todo o `<div className="mt-8 flex items-center gap-5 ...">`
(avatar + badges + aviso) por:

```tsx
      <div className="mt-8 rounded-2xl border border-brand-400/20 bg-gradient-to-r from-brand-950/40 via-ink-900/60 to-ink-900/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        <EditorAvatar nome={corretor.nome} fotoUrl={corretor.fotoUrl} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-500/20 border border-brand-400/30 px-2.5 py-0.5 text-fluid-xs font-semibold text-brand-200">
            CRECI {corretor.creci}
          </span>
          <span className="rounded-full bg-azure-500/20 border border-azure-400/30 px-2.5 py-0.5 text-fluid-xs font-medium text-azure-200">
            Perfil Público Ativo
          </span>
        </div>
        <p className="text-fluid-xs mt-2 text-mist-400">
          O CRECI é gerenciado pela administração da Next Home.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <FundoLink fundoTipo={corretor.fundoTipo} />
      </div>
```

Adicionar os imports:

```tsx
import { EditorAvatar } from "./EditorAvatar";
import { FundoLink } from "./FundoLink";
```

Remove o import de `Image` e `iniciais` de `page.tsx` se ficarem sem uso
depois da troca (agora vivem só em `EditorAvatar.tsx`).

- [ ] **Step 5: Rodar visualmente**

Subir o dev server (ou reaproveitar um já rodando, como no ajuste do card
de leads), abrir `/corretor/perfil` autenticado — se não houver conta de
teste disponível, montar uma rota temporária fora de `_`/underscore (como
`teste-perfil-tmp`) que renderiza `EditorAvatar`/`FundoLink` com props
mocadas, do mesmo jeito que a rota `teste-leads-tmp` foi usada pro bug do
card de leads. Conferir: troca de foto mostra preview atualizado depois do
upload, toggle Vídeo/Foto troca o seletor visível, mensagens de erro
aparecem pra arquivo grande/tipo errado. Apagar a rota temporária ao
terminar.

- [ ] **Step 6: `npx tsc --noEmit && npm run lint`**

- [ ] **Step 7: Commit**

```bash
git add src/app/corretor/\(painel\)/perfil/
git commit -m "Upload de avatar e escolha de fundo (vídeo/foto) no painel"
```

---

### Task 6: Fundo estático (foto) nos layouts públicos

**Files:**
- Create: `src/components/motion/HeroImageBackground.tsx`
- Modify: `src/app/(vitrine)/layout.tsx`
- Modify: `src/app/(institucional)/layout.tsx`

**Interfaces:**
- Consumes: `useGlassBackground()` (`definirFundo`), `corretorAtivo.fundoTipo`/`fundoFotoUrl` (Task 2).

- [ ] **Step 1: `HeroImageBackground.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useGlassBackground } from "@/components/glass/GlassBackground";

/**
 * Fundo estático por trás do hero, alternativa ao `HeroVideoBackground`
 * quando o corretor escolheu uma foto em vez de vídeo. Registra a imagem no
 * `GlassBackgroundProvider` pra os painéis de vidro refratarem — o próprio
 * `GlassCanvas` carrega a textura a partir da URL, sem precisar deste
 * elemento (ver `definirFundo` em `GlassBackground.tsx`).
 */
export function HeroImageBackground({ src }: { src: string }) {
  const { definirFundo } = useGlassBackground();

  useEffect(() => {
    definirFundo(src);
    return () => definirFundo(null);
  }, [src, definirFundo]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed decorativo, mesmo padrão do HeroVideoBackground (não passa por otimização do next/image).
    <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
  );
}
```

- [ ] **Step 2: `src/app/(vitrine)/layout.tsx`**

```tsx
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { HERO_VIDEO_URL } from "@/lib/site";

import { getCorretorAtivo } from "@/lib/corretorAtivo";

export default async function VitrineLayout({ children }: { children: React.ReactNode }) {
  const corretorAtivo = await getCorretorAtivo();
  const usaFotoDeFundo = corretorAtivo?.fundoTipo === "foto" && corretorAtivo.fundoFotoUrl;
  const videoUrl = corretorAtivo?.videoUrl || HERO_VIDEO_URL;

  return (
    <GlassBackgroundProvider>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-brand-900 via-ink-950 to-ink-950">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          videoUrl && <HeroVideoBackground src={videoUrl} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/35 to-ink-950" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
```

(mantém os comentários já existentes no arquivo — só a lógica de escolha de
fundo muda.)

- [ ] **Step 3: `src/app/(institucional)/layout.tsx`**

Mesma troca:

```tsx
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
```

```tsx
  const corretorAtivo = await getCorretorAtivo();
  const usaFotoDeFundo = corretorAtivo?.fundoTipo === "foto" && corretorAtivo.fundoFotoUrl;
  const videoUrl = corretorAtivo?.videoUrl || HERO_VIDEO_URL;
```

```tsx
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-brand-900 via-ink-950 to-ink-950">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          videoUrl && <HeroVideoBackground src={videoUrl} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/35 to-ink-950" />
      </div>
```

- [ ] **Step 4: Testar visualmente**

Numa rota de teste temporária (mesmo esquema da Task 5), ou setando o
cookie `corretor_ativo` manualmente via devtools pra um corretor de teste
com `fundo_tipo='foto'` no banco: confirmar que a foto aparece full-bleed
no lugar do vídeo, e que os painéis de vidro (`GlassSurface`) continuam
refratando alguma coisa (não caem no gradiente genérico) — usar o Chrome
DevTools MCP como no ajuste do card de leads.

- [ ] **Step 5: `npx tsc --noEmit && npm run lint`**

- [ ] **Step 6: Commit**

```bash
git add src/components/motion/HeroImageBackground.tsx src/app/\(vitrine\)/layout.tsx src/app/\(institucional\)/layout.tsx
git commit -m "Fundo do link pessoal aceita foto estática, além de vídeo"
```

---

### Task 7: Destaques do catálogo — Server Actions e UI

**Files:**
- Modify: `src/lib/corretorSessao.ts` (`getMeusDestaques`)
- Modify: `src/app/corretor/actions.ts` (`salvarDestaques`)
- Create: `src/app/corretor/(painel)/links/EditarDestaques.tsx`
- Modify: `src/app/corretor/(painel)/links/page.tsx`

**Interfaces:**
- Consumes: `corretor_destaques` (Task 1), `getEmpreendimentos()` (já
  existe, já usado por `links/page.tsx`).
- Produces: `getMeusDestaques(): Promise<string[]>` (slugs em ordem),
  `salvarDestaques(slugs: string[]): Promise<ResultadoAcao>`.

- [ ] **Step 1: `getMeusDestaques` em `corretorSessao.ts`**

```ts
/**
 * Slugs dos destaques do corretor logado, na ordem escolhida — quem entra
 * pelo link dele vê esses primeiro (ver `ordenar()` em `queries.ts`).
 */
export async function getMeusDestaques(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretor_destaques")
    .select("empreendimento_slug")
    .order("posicao");

  if (error) throw new Error(`Falha ao carregar os destaques: ${error.message}`);
  return (data ?? []).map((d) => d.empreendimento_slug);
}
```

(sem `.eq("corretor_id", ...)` explícito — mesmo padrão de `getMeusLeads`:
o filtro é a policy de RLS da Task 1, que só deixa o corretor ver as
próprias linhas.)

- [ ] **Step 2: `salvarDestaques` em `actions.ts`**

```ts
/**
 * Substitui a lista inteira de destaques do corretor logado. Sempre
 * apaga-e-recria em vez de um PATCH incremental: são no máximo 15 linhas, e
 * o cliente já manda o array final a cada mudança (adicionar, remover ou
 * reordenar) — mais simples de acertar do que reconciliar um diff.
 */
export async function salvarDestaques(slugs: string[]): Promise<ResultadoAcao> {
  const { supabase, user } = await exigirSessao();

  if (slugs.length > 15) {
    return { erro: "Máximo de 15 destaques." };
  }

  const { data: corretor } = await supabase
    .from("corretores")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!corretor) {
    return { erro: "Sem permissão para editar este cadastro. Fale com quem administra o site." };
  }

  const { error: erroApagar } = await supabase
    .from("corretor_destaques")
    .delete()
    .eq("corretor_id", corretor.id);

  if (erroApagar) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  if (slugs.length === 0) {
    revalidatePath("/corretor/links");
    return {};
  }

  const { error: erroInserir } = await supabase.from("corretor_destaques").insert(
    slugs.map((slug, index) => ({
      corretor_id: corretor.id,
      empreendimento_slug: slug,
      posicao: index,
    })),
  );

  if (erroInserir) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  revalidatePath("/corretor/links");
  return {};
}
```

- [ ] **Step 3: `EditarDestaques.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { salvarDestaques } from "@/app/corretor/actions";

type Item = { slug: string; nome: string };

export function EditarDestaques({
  itens,
  destaquesIniciais,
}: {
  itens: Item[];
  destaquesIniciais: string[];
}) {
  const [ordem, setOrdem] = useState<string[]>(destaquesIniciais);
  const [adicionar, setAdicionar] = useState("");
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const porSlug = new Map(itens.map((i) => [i.slug, i.nome]));
  const disponiveis = itens.filter((i) => !ordem.includes(i.slug));

  function persistir(nova: string[]) {
    setOrdem(nova);
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await salvarDestaques(nova);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  function mover(index: number, direcao: -1 | 1) {
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= ordem.length) return;
    const nova = [...ordem];
    [nova[index], nova[alvo]] = [nova[alvo], nova[index]];
    persistir(nova);
  }

  function remover(slug: string) {
    persistir(ordem.filter((s) => s !== slug));
  }

  function adicionarItem() {
    if (!adicionar || ordem.length >= 15) return;
    persistir([...ordem, adicionar]);
    setAdicionar("");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
      <p className="font-display text-mist-50">Destaques do seu link</p>
      <p className="text-fluid-sm mt-1 mb-4 text-mist-400">
        Quem entra pelo seu link vê estes primeiro, nesta ordem. O resto do
        catálogo segue atrás, na ordem padrão.
      </p>

      {ordem.length === 0 && (
        <p className="text-fluid-sm text-mist-500">
          Nenhum destaque ainda — todo o catálogo aparece na ordem padrão.
        </p>
      )}

      <ol className="space-y-2">
        {ordem.map((slug, i) => (
          <li
            key={slug}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-950/50 px-4 py-2.5"
          >
            <span className="text-fluid-sm text-mist-100">{porSlug.get(slug) ?? slug}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="rounded-lg p-1.5 text-mist-400 hover:text-mist-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === ordem.length - 1}
                aria-label="Descer"
                className="rounded-lg p-1.5 text-mist-400 hover:text-mist-100 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remover(slug)}
                aria-label="Remover"
                className="rounded-lg p-1.5 text-mist-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      {ordem.length < 15 ? (
        <div className="mt-4 flex gap-2">
          <select
            value={adicionar}
            onChange={(e) => setAdicionar(e.target.value)}
            className="text-fluid-sm flex-1 rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          >
            <option value="">Adicionar empreendimento…</option>
            {disponiveis.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={adicionarItem}
            disabled={!adicionar}
            className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      ) : (
        <p className="text-fluid-xs mt-3 text-mist-500">Máximo de 15 destaques.</p>
      )}

      {pendente && <p className="text-fluid-xs mt-2 text-mist-500">Salvando…</p>}
      {erro && <p className="text-fluid-xs mt-2 text-red-300">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `links/page.tsx` — nova seção**

Adicionar import:

```tsx
import { EditarDestaques } from "./EditarDestaques";
import { getMeusDestaques } from "@/lib/corretorSessao";
```

No corpo da função, buscar em paralelo com o resto:

```tsx
  const [empreendimentos, destaques] = await Promise.all([
    getEmpreendimentos(),
    getMeusDestaques(),
  ]);
```

(remove a linha antiga `const empreendimentos = await getEmpreendimentos();`)

E inserir a seção nova entre "Portfólio completo" e "Um imóvel específico":

```tsx
      <section className="mt-10">
        <EditarDestaques
          itens={empreendimentos.map((e) => ({ slug: e.slug, nome: e.nome }))}
          destaquesIniciais={destaques}
        />
      </section>
```

- [ ] **Step 5: Testar visualmente**

Adicionar 2-3 destaques, reordenar com ↑/↓, remover um, confirmar que
persiste ao recarregar a página (RSC lê `getMeusDestaques()` de novo). Numa
segunda aba anônima com o cookie `corretor_ativo` daquele corretor,
conferir em `/portfolio` que os destaques aparecem primeiro, na ordem
escolhida.

- [ ] **Step 6: `npx tsc --noEmit && npm run lint && npm test`**

- [ ] **Step 7: Commit**

```bash
git add src/lib/corretorSessao.ts src/app/corretor/actions.ts src/app/corretor/\(painel\)/links/
git commit -m "Corretor escolhe e reordena os destaques do próprio link"
```

---

### Task 8: Remover "Acompanhados por" da página pública

**Files:**
- Modify: `src/app/(institucional)/corretores/[slug]/page.tsx`
- Modify: `src/lib/queries.ts` (remover `getEmpreendimentosPorCorretor`, se a Task 3 não fez ainda)

- [ ] **Step 1: Remover a busca e a seção**

Em `CorretorPage`, remover:

```tsx
  const empreendimentos = await getEmpreendimentosPorCorretor(corretor.id);
```

e toda a seção:

```tsx
      {empreendimentos.length > 0 && (
        <section className="mx-auto mt-20 w-full max-w-5xl">
          ...
        </section>
      )}
```

Remover os imports que ficam sem uso: `CardEmpreendimento`,
`getEmpreendimentosPorCorretor` (mantém `getCorretorPorSlug`).

- [ ] **Step 2: Remover `getEmpreendimentosPorCorretor` de `queries.ts`**

Se a Task 3 (Step 5) já não removeu — confirmar com
`grep -rn "getEmpreendimentosPorCorretor" src/` que não sobra nenhuma
chamada antes de apagar a função.

- [ ] **Step 3: `npx tsc --noEmit && npm run lint`**

- [ ] **Step 4: Testar visualmente**

Abrir `/corretores/<slug>` de um corretor com empreendimentos atribuídos —
confirmar que a página termina no CTA/botão "Ver portfólio completo", sem
grade de imóveis abaixo, e que o restante (avatar, bio, WhatsApp) continua
igual.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(institucional\)/corretores/\[slug\]/page.tsx src/lib/queries.ts
git commit -m "Remove a grade de empreendimentos da página pública do corretor"
```

---

### Task 9: Verificação final

**Files:** nenhum novo — só validação.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: todos os testes PASS (incluindo os novos de `queries.test.ts` e
`midiaCorretor.test.ts`).

- [ ] **Step 2: Typecheck e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erro.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui, todas as rotas geradas, sem warning novo
relacionado a este trabalho.

- [ ] **Step 4: Checklist visual (browser)**

- `/corretor/perfil`: trocar avatar, trocar entre vídeo/foto de fundo,
  mensagens de erro pra arquivo inválido.
- `/corretor/links`: adicionar/reordenar/remover destaques, limite de 15.
- `/portfolio?corretor=<slug-de-teste>`: destaques aparecem primeiro, resto
  do catálogo segue a ordem padrão.
- `/corretores/<slug-de-teste>`: sem a grade "Acompanhados por".
- Fundo em foto: painéis de vidro (`GlassSurface`) continuam refratando
  algo, sem cair no gradiente genérico.

- [ ] **Step 5: Finalizar a branch**

Anunciar: "Usando a skill finishing-a-development-branch pra concluir este
trabalho." Seguir essa skill (verificar testes, apresentar opções de
merge/PR, executar a escolha).
