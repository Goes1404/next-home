# Personalização do link pessoal do corretor — Design

## Contexto

Hoje o corretor compartilha um link pessoal (`/?corretor=<slug>` ou
`/portfolio?corretor=<slug>`) que faz o site inteiro atribuir a ele qualquer
lead gerado durante a visita, mesmo em empreendimentos de outro responsável
(`src/lib/corretorAtivo.ts`). O link também troca o vídeo de fundo do site
por um vídeo próprio do corretor (`corretores.video_url`, adicionado numa
sessão anterior, mas nunca ficou editável pelo próprio corretor — só foi
setado direto no banco).

Falta: o corretor não controla nada disso pelo painel. `foto_url` (avatar) já
tem `grant update` liberado desde a migration 0006, mas a página
`/corretor/perfil` trava a edição ("CRECI e foto são gerenciados pela
administração da Next Home") e não existe upload de arquivo em lugar nenhum
do app — o único vídeo que já foi trocado nesta sessão foi via script direto
no Supabase Storage.

## Objetivo

1. Corretor sobe a própria foto de avatar pelo painel (upload de arquivo).
2. Corretor escolhe o fundo do link pessoal: vídeo (como hoje) OU foto
   estática — e sobe o arquivo pelo painel.
3. Corretor escolhe um punhado de empreendimentos como "destaques" do link
   dele, na ordem que quiser — quem entra pelo link vê esses primeiro; o
   resto do catálogo segue atrás, na ordem padrão da casa.
4. A página pública `/corretores/<slug>` perde a seção "Acompanhados por
   [nome]" (grade de empreendimentos) — fica só o cartão de perfil e os CTAs.

## Fora de escopo

- Capa/banner separado do avatar (decidido: só o avatar vira editável).
- Reprocessamento/otimização de imagem ou vídeo no servidor (sem
  transcodificação — o arquivo enviado é o arquivo servido).
- Drag-and-drop de biblioteca externa — reordenar destaques usa botões
  subir/descer, sem nova dependência.
- Editar CRECI (continua exclusivo da administração).

## Arquitetura

Três peças independentes, todas dentro do painel existente
(`src/app/corretor/(painel)/`):

```
┌─────────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────────┐
│  Upload de mídia         │   │  Fundo vídeo/foto         │   │  Destaques do catálogo     │
│  (Server Action +        │   │  (novo componente de      │   │  (nova tabela +            │
│   Supabase Storage)       │   │   fundo estático +        │   │   Server Actions +        │
│                           │   │   campo fundo_tipo)       │   │   ordenar() em queries.ts)│
└─────────────┬────────────┘   └─────────────┬─────────────┘   └─────────────┬─────────────┘
              │                               │                               │
              └──────────────┬────────────────┴───────────────┬───────────────┘
                              ▼                                ▼
                     corretores (colunas novas)      corretor_destaques (tabela nova)
```

## Banco de dados (migration 0015)

```sql
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

-- Leitura pública: a personalização da ordem do catálogo acontece para
-- QUALQUER visitante que chegou pelo link do corretor, não só pra ele
-- logado — a query que monta a home/portfólio roda com o cliente anônimo
-- (supabase/public.ts).
create policy "destaques sao publicos"
  on corretor_destaques for select
  to anon, authenticated
  using (true);

create policy "corretor gerencia os proprios destaques"
  on corretor_destaques for all
  to authenticated
  using (corretor_id in (select id from corretores where user_id = auth.uid()))
  with check (corretor_id in (select id from corretores where user_id = auth.uid()));
```

### Storage

Bucket `empreendimentos` (já público, já em uso para os vídeos de fundo).
Convenção de path: `corretores/<corretor_id>/<campo>-<timestamp>.<ext>`.

```sql
create policy "corretor le e escreve na propria pasta"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = (
      select id::text from corretores where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = (
      select id::text from corretores where user_id = auth.uid()
    )
  );
```

Leitura pública dos objetos já existe (bucket público) — não precisa de
policy nova para `select`.

## Componente 1 — Upload de mídia

**Server Action** (`src/app/corretor/actions.ts`):

```ts
type CampoMidia = "avatar" | "fundo_video" | "fundo_foto";

const LIMITES: Record<CampoMidia, { bytes: number; tipos: string[] }> = {
  avatar: { bytes: 5 * 1024 * 1024, tipos: ["image/jpeg", "image/png", "image/webp"] },
  fundo_foto: { bytes: 5 * 1024 * 1024, tipos: ["image/jpeg", "image/png", "image/webp"] },
  fundo_video: { bytes: 20 * 1024 * 1024, tipos: ["video/mp4"] },
};

const COLUNA: Record<CampoMidia, "foto_url" | "video_url" | "fundo_foto_url"> = {
  avatar: "foto_url",
  fundo_video: "video_url",
  fundo_foto: "fundo_foto_url",
};

export async function enviarMidiaCorretor(
  campo: CampoMidia,
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm>
```

- Lê `formData.get("arquivo")` como `File`.
- Valida `size`/`type` contra `LIMITES[campo]` — mensagem de erro específica
  ("Imagem até 5MB, JPG/PNG/WebP." ou "Vídeo até 20MB, MP4.").
- Monta o path `corretores/<user's corretor id>/${campo}-${Date.now()}.${ext}`
  (`ext` a partir do `type` do arquivo, não do nome — nome de arquivo do
  usuário não é confiável).
- `supabase.storage.from("empreendimentos").upload(path, file)`.
- Em caso de erro de upload: retorna `{ erro: "Não foi possível enviar o arquivo. Tente novamente." }`,
  sem tocar no banco.
- `supabase.storage.from("empreendimentos").getPublicUrl(path)` → URL pública.
- `update corretores set [COLUNA[campo]] = url where user_id = auth.uid()`
  (mesmo padrão de `.select("id")` para conferir que a linha foi afetada,
  como em `salvarPerfil`).
- Best-effort: se havia uma URL antiga nesse campo, apaga o objeto antigo do
  Storage (`storage.remove([pathAntigo])`) — extrai o path do que vem depois
  de `/object/public/empreendimentos/` na URL salva antes do update. Falha
  ao apagar não desfaz o restante (arquivo órfão é só espaço, não é bug
  visível).
- `revalidatePath` nas rotas afetadas pelo campo: `avatar` e `fundo_*` afetam
  `/corretor/perfil`, `/corretores/[slug]`, `/`, `/portfolio`,
  `/empreendimentos`.

**UI** (`src/app/corretor/(painel)/perfil/`):

- Bloco de avatar em `page.tsx` ganha um `<input type="file">` estilizado
  (componente cliente `SeletorArquivo`, reutilizado nos 3 campos) que
  dispara `enviarMidiaCorretor("avatar", ...)` via `useActionState`, com
  preview otimista da imagem escolhida antes da resposta do servidor.
- Novo card "Fundo do seu link": toggle Vídeo/Foto (dois botões,
  `fundo_tipo` atual pré-selecionado) + `SeletorArquivo` do tipo
  correspondente. Trocar o toggle só muda qual upload fica visível — o
  campo `fundo_tipo` em si só é salvo quando o corretor envia um arquivo
  daquele tipo (evita salvar "foto" sem nunca ter subido uma foto).
- Remove a frase "CRECI e foto são gerenciados pela administração da Next
  Home" — mantém só a nota sobre CRECI.

## Componente 2 — Fundo vídeo ou foto

**`src/components/motion/HeroImageBackground.tsx`** (novo, paralelo a
`HeroVideoBackground.tsx`):

```tsx
"use client";
export function HeroImageBackground({ src }: { src: string }) {
  const { definirFundo } = useGlassBackground();
  useEffect(() => {
    definirFundo(src);
    return () => definirFundo(null);
  }, [src, definirFundo]);

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
```

Sem lógica de `prefers-reduced-motion`/`saveData` (isso é específico de
vídeo autoplay) e sem registrar em `definirVideo` — usa o caminho `src`
estático que `GlassBackgroundProvider` já suporta (`GlassCanvas.tsx` já
prioriza `video` sobre `src` quando os dois existem; aqui só `src` é
setado).

**`(vitrine)/layout.tsx` e `(institucional)/layout.tsx`** — trocam:

```tsx
const corretorAtivo = await getCorretorAtivo();
const usaFotoDeFundo = corretorAtivo?.fundoTipo === "foto" && corretorAtivo.fundoFotoUrl;
```

```tsx
{usaFotoDeFundo
  ? <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
  : <HeroVideoBackground src={corretorAtivo?.videoUrl || HERO_VIDEO_URL} />}
```

**Tipos** (`src/lib/types.ts`): `Corretor` ganha `fundoTipo: "video" | "foto"`
e `fundoFotoUrl: string | null`.

**`src/lib/corretorAtivo.ts`**: adiciona `fundo_tipo, fundo_foto_url` no
`.select(...)` e no retorno.

**`src/lib/queries.ts`**: `SELECT_CORRETOR`, `LinhaCorretor` e `mapCorretor`
ganham os dois campos (mesmo padrão de `video_url`/`videoUrl` já existente).

## Componente 3 — Destaques do catálogo

**Reordenar sem drag-and-drop**: lista com botões ↑/↓ por item (sobe/desce
uma posição) e "remover". Adicionar item é um combobox de busca por nome
(reaproveitando a lista de empreendimentos que `/corretor/links` já busca
via `getEmpreendimentos()`). Limite de 15 itens — o botão "adicionar" some
ao atingir o teto, com a mensagem "Máximo de 15 destaques.".

**Onde mora**: nova seção em `/corretor/links/page.tsx`, acima da lista de
"Um imóvel específico" — é a mesma tela onde o corretor já vê e copia os
links, faz sentido editar o que aquele link mostra ali mesmo. Componente
cliente novo `EditarDestaques.tsx`.

**Server Actions** (`src/app/corretor/actions.ts`):

```ts
export async function salvarDestaques(slugs: string[]): Promise<ResultadoAcao>
```

Recebe a lista já na ordem final (o cliente reordena em memória com os
botões ↑/↓ e manda o array inteiro a cada mudança — no máximo 15 linhas,
recalcular tudo é mais simples e mais barato de testar do que um PATCH
incremental). Implementação: apaga todas as linhas do corretor logado em
`corretor_destaques` e insere de novo com `posicao = index`, dentro da mesma
chamada (Postgres via supabase-js não abre transação explícita aqui — como
é sempre "apaga tudo + insere tudo" para um único `corretor_id`, uma falha a
meio do caminho na pior hipótese zera a lista, nunca deixa entradas
duplicadas ou com posição inconsistente; o corretor vê a lista vazia e
refaz).

```ts
export async function getMeusDestaques(): Promise<string[]>
```

Usado pela UI para pré-carregar a lista atual (slugs em ordem).

**Aplicar a ordem** (`src/lib/queries.ts`):

`buscarPublicados()` já busca `corretorAtivo` em paralelo. Quando existe,
busca também `corretor_destaques` desse corretor (`order by posicao`) e
guarda um `Map<slug, posicao>`. Esse mapa é passado para `ordenar()`:

```ts
function ordenar(
  lista: Empreendimento[],
  modo: Ordenacao,
  destaquesCorretor?: Map<string, number>,
): Empreendimento[] {
  const copia = [...lista];
  if (modo === "destaque" && destaquesCorretor?.size) {
    return copia.sort((a, b) => {
      const posA = destaquesCorretor.get(a.slug);
      const posB = destaquesCorretor.get(b.slug);
      if (posA != null && posB != null) return posA - posB;
      if (posA != null) return -1;
      if (posB != null) return 1;
      return Number(b.destaque) - Number(a.destaque); // ordem padrão de sempre
    });
  }
  // ...resto igual (recentes, preco_asc, preco_desc, destaque sem corretor)
}
```

Só se aplica no modo `"destaque"` (o padrão da listagem pública) — se um
dia existir um seletor de ordenação visível pro visitante (não existe
hoje), uma escolha explícita de "menor preço" continua vencendo.

Item do destaque cujo empreendimento foi despublicado/excluído: o `join`
implícito não existe (é um `Map` construído a partir de duas queries
separadas) — um slugórfão no mapa simplesmente não casa com nenhum item de
`lista` e não aparece. Sem necessidade de limpeza — o `on delete cascade`
da FK já remove a linha de `corretor_destaques` quando o empreendimento é
excluído de verdade; despublicar (`publicado = false`) não exclui a linha,
e o destaque só volta a aparecer se o empreendimento for republicado.

## Página pública do corretor

`src/app/(institucional)/corretores/[slug]/page.tsx`: remove a chamada a
`getEmpreendimentosPorCorretor` e toda a `<section>` "Acompanhados por
{nome}" (linhas 45, 134–154 do arquivo atual). O botão "Ver portfólio
completo" continua indo para `/portfolio?corretor=<slug>`, que agora reflete
os destaques dele.

`getEmpreendimentosPorCorretor` em `queries.ts` fica sem uso — remove
junto (grep antes de remover para confirmar que nenhum outro lugar chama).

## Erros e validação

| Situação | Comportamento |
|---|---|
| Arquivo maior que o limite | Rejeitado no client (atributo `accept`/checagem em JS antes de enviar, feedback imediato) **e** no server (`enviarMidiaCorretor` sempre revalida — o client-side é conveniência, não segurança). |
| Tipo de arquivo não suportado | Mesma dupla checagem client+server. |
| Upload falha (rede, Storage fora) | Mensagem genérica de erro, nada muda no banco, corretor tenta de novo. |
| `update` na tabela `corretores` afeta 0 linhas | Mesmo padrão de `salvarPerfil`: "Sem permissão para editar este cadastro." — não deveria acontecer (RLS já garante a própria linha) mas o `.select("id")` de conferência fica pela mesma razão documentada em `salvarPerfil`. |
| Destaque duplicado (mesmo slug adicionado duas vezes) | UI impede pelo próprio combobox (remove da lista de opções o que já foi adicionado). |
| 16º destaque | Botão "adicionar" desabilitado/oculto ao atingir 15. |
| Empreendimento excluído que estava nos destaques de alguém | `on delete cascade` limpa a linha automaticamente — não precisa de tratamento na aplicação. |

## Testes

- `mensagem`/validação de mídia: função pura `validarMidia(campo, {size, type})`
  extraída de dentro da action, testada com Vitest para os 3 campos × casos
  de tamanho/tipo válido e inválido.
- `ordenar()` com `destaquesCorretor`: casos — sem destaques (comportamento
  atual preservado), destaques cobrindo só parte da lista, destaque
  apontando pra slug que não está mais em `lista` (deve ser ignorado sem
  erro).
- Visual (browser, como no ajuste do card de leads): toggle vídeo/foto no
  perfil, upload de avatar com preview, adicionar/reordenar/remover
  destaques, e checagem final na página `/portfolio?corretor=<slug-de-teste>`
  de que a ordem bate com os destaques configurados.

## Impacto em código existente

- `src/lib/types.ts`: `Corretor` ganha 2 campos.
- `src/lib/corretorAtivo.ts`: select + retorno.
- `src/lib/queries.ts`: `SELECT_CORRETOR`, `LinhaCorretor`, `mapCorretor`,
  `ordenar()`, `buscarPublicados()`; remove `getEmpreendimentosPorCorretor`.
- `src/lib/supabase/types.ts`: colunas novas de `corretores` + tabela nova
  `corretor_destaques` (edição manual, Docker indisponível pro `gen types`
  — mesmo procedimento já seguido nesta sessão).
- `src/app/corretor/actions.ts`: `enviarMidiaCorretor`, `salvarDestaques`,
  `getMeusDestaques` (esta pode morar em `corretorSessao.ts` em vez de
  `actions.ts`, por consistência com `getMeusTemplates` — decisão de
  implementação, não muda o design).
- `src/app/corretor/(painel)/perfil/page.tsx` + `FormularioPerfil.tsx`:
  upload de avatar, card de fundo, remove aviso sobre foto.
- `src/app/corretor/(painel)/links/page.tsx`: nova seção de destaques.
- `src/app/(institucional)/corretores/[slug]/page.tsx`: remove seção
  "Acompanhados por".
- `src/app/(vitrine)/layout.tsx`, `src/app/(institucional)/layout.tsx`:
  escolha vídeo/foto.
- Novo: `src/components/motion/HeroImageBackground.tsx`,
  `src/app/corretor/(painel)/perfil/SeletorArquivo.tsx`,
  `src/app/corretor/(painel)/links/EditarDestaques.tsx`.
- Nova migration `supabase/migrations/0015_personalizacao_link.sql`
  (colunas, tabela, grants, RLS, policies de Storage) — aplicada direto no
  Supabase de produção, como as anteriores desta sessão.
