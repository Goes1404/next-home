# O fim do corretor dono — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status (28/09):** executado com adaptações — sem `preferido` (a 0113 foi descartada) e coluna dropada na 0129. Ver MEMORIA.

**Goal:** Tirar o conceito de corretor dono do imóvel, fazendo todo contato do site público passar pelo porteiro `/wa`, que roteia só para quem tem número conectado e manda a mensagem que o webhook reconhece.

**Architecture:** O porteiro (`src/app/wa/`) vira a porta ÚNICA de WhatsApp do site. Ele ganha duas formas: com imóvel (`/wa/<slug>`) e sem (`/wa`), ambas aceitando intenção (`?i=`) e corretor preferido (`?c=`). O reconhecedor de mensagem (`porteiro.ts`) passa a tolerar a intenção emendada e a frase geral do site. O tipo `Empreendimento` perde o campo `corretor`, e o compilador vira a guarda que acha todos os leitores. A coluna `empreendimentos.corretor_id` cai numa migration separada, DEPOIS de o código parar de lê-la.

**Tech Stack:** Next.js (App Router, Route Handlers), TypeScript, Supabase (Postgres + PostgREST), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-fim-do-corretor-dono-design.md`

## Global Constraints

- **Português em todo texto de usuário, comentário e mensagem de commit.** É a língua da base.
- **Nenhum módulo lido por componente `"use client"` pode importar `server-only`.** Constante compartilhada mora em módulo puro (a pedra de `limitesPdf.ts`, `pessoasTipos.ts`, `imagensTipos.ts`).
- **Toda classe de cor usada precisa existir em `src/app/globals.css`.** Classe inexistente vira NADA em silêncio; conferir com `grep -- "--color-<token>:" src/app/globals.css`.
- **Nada de rolagem lateral fora de conteúdo declarado** em `naoRolaDeLado.test.ts`.
- **Guarda nova é provocada antes de valer**, e a mordida é conferida por `md5sum` antes e depois: mordida que não altera o arquivo já enganou esta base duas vezes.
- **Script Python que escreve TypeScript usa string RAW (`r"..."`)** ou evita barra invertida: `\b` vira BACKSPACE no disco e o `grep` não mostra.
- **O repositorio guarda LF em TODO blob** (`core.autocrlf=true`, sem `.gitattributes`): medido em 16/09 sobre arquivos tocados e nao tocados. No DISCO um arquivo recem-baixado aparece com CRLF, entao script que edita por ancora precisa normalizar para casar. O formato em que o script regrava e indiferente ao git: salvar LF ou CRLF produz o mesmo blob e nenhum diff. **Nao trate fim de linha no disco como defeito.**
- **Número de migration livre:** `0113`. Conferido contra `supabase/migrations/` e contra `origin/main` em 16/09/2026. `RESERVADOS` em `src/lib/migrations.test.ts` está vazio.
- **Verificação de conclusão:** `npx tsc --noEmit`, `npx vitest run`, `node scripts/lintTeto.mjs`, `npx next build`. O único vermelho tolerado é `src/lib/imagens/carimbo.test.ts`, que falha nesta máquina por falta de fontconfig (provado em 16/09: um render de texto pelo `sharp` devolve um tom só).

---

### Task 1: O reconhecedor tolera a intenção emendada

O porteiro passa a mandar `Olá! Gostaria de mais informações do <Imóvel>. <intenção>`. Hoje `reconhecerMensagemDeAnuncio` trata tudo depois do prefixo como o nome, então o imóvel deixaria de ser reconhecido.

**Files:**
- Modify: `src/lib/whatsapp/porteiro.ts`
- Test: `src/lib/whatsapp/porteiro.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `export type ChaveIntencao = "saber" | "material" | "tabela" | "visita"`
  - `export const INTENCOES: Record<ChaveIntencao, string>`
  - `export function mensagemDeAnuncio(nomeImovel: string, intencao?: ChaveIntencao | null): string`
  - `reconhecerMensagemDeAnuncio(texto: string | null | undefined): string | null` (assinatura inalterada)

- [ ] **Step 1: Write the failing test**

Acrescente ao fim de `src/lib/whatsapp/porteiro.test.ts`:

```ts
describe("a intenção emendada não atrapalha o reconhecimento", () => {
  it("reconhece o imóvel com a intenção depois do nome", () => {
    const texto = mensagemDeAnuncio("Eternity Alphaville Tamboré", "visita");

    expect(texto).toBe(
      "Olá! Gostaria de mais informações do Eternity Alphaville Tamboré. Quero agendar uma visita.",
    );
    expect(reconhecerMensagemDeAnuncio(texto)).toBe("eternity alphaville tambore");
  });

  it("o nome longo do catálogo cabe com a intenção mais comprida", () => {
    // O nome mais longo do catálogo real tem 58 caracteres, e a combinação
    // com a intenção mais comprida passava de 120 no teto antigo.
    const nome = "Apartamento 2 Dorms a venda no Green Valley - Alphaville";
    const texto = mensagemDeAnuncio(nome, "material");

    expect(reconhecerMensagemDeAnuncio(texto)).toBe(
      "apartamento 2 dorms a venda no green valley alphaville",
    );
  });

  it("a mensagem sem intenção continua valendo igual", () => {
    expect(reconhecerMensagemDeAnuncio(mensagemDeAnuncio("Terra Alta"))).toBe("terra alta");
  });

  it("nome absurdamente longo é recusado", () => {
    const texto = mensagemDeAnuncio("a".repeat(90));

    expect(reconhecerMensagemDeAnuncio(texto)).toBeNull();
  });
});
```

Acrescente `mensagemDeAnuncio` ao `import` do topo do arquivo, se ainda não estiver lá.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/porteiro.test.ts`
Expected: FAIL. O primeiro caso falha porque `mensagemDeAnuncio` ainda não aceita segundo argumento, e o reconhecimento devolve `"eternity alphaville tambore quero agendar uma visita"`.

- [ ] **Step 3: Write minimal implementation**

Em `src/lib/whatsapp/porteiro.ts`, substitua a função `mensagemDeAnuncio` e a constante `PREFIXO_ANUNCIO` pelo bloco abaixo, e depois substitua `reconhecerMensagemDeAnuncio`:

```ts
/** As intenções que os botões do site levam no endereço (`?i=`). */
export type ChaveIntencao = "saber" | "material" | "tabela" | "visita";

/**
 * Vocabulário FECHADO, escrito por nós.
 *
 * Ser fechado é o que permite ao reconhecedor tirar a intenção pelo fim
 * antes de ler o nome do imóvel: nada de adivinhar limite de frase, que não
 * funcionaria mesmo — o `!` de "Olá!" é a primeira pontuação do texto e o
 * prefixo atravessa duas frases.
 */
export const INTENCOES: Record<ChaveIntencao, string> = {
  saber: "Quero saber mais.",
  material: "Quero a descrição completa e as plantas.",
  tabela: "Quero a tabela de valores e condições.",
  visita: "Quero agendar uma visita.",
};

export function ehChaveIntencao(valor: string | null | undefined): valor is ChaveIntencao {
  return valor != null && Object.prototype.hasOwnProperty.call(INTENCOES, valor);
}

/**
 * A mensagem pronta que o clique pré-preenche no WhatsApp.
 *
 * O texto é DETERMINÍSTICO por imóvel de propósito: é ele que permite ao
 * webhook reconhecer "isto veio de uma peça nossa" sem nenhum metadado do
 * provedor — e o nome oficial do imóvel dentro dele é o que a Sofia já
 * resolve via focoDaConversa (nome + apelidos).
 *
 * A intenção vem DEPOIS do nome e é opcional: o anúncio do Meta continua
 * mandando a forma sem ela, byte por byte igual à de antes.
 */
export function mensagemDeAnuncio(
  nomeImovel: string,
  intencao?: ChaveIntencao | null,
): string {
  const base = `Olá! Gostaria de mais informações do ${nomeImovel.trim()}.`;
  return intencao ? `${base} ${INTENCOES[intencao]}` : base;
}

const PREFIXO_ANUNCIO = soLetrasEEspacos("Olá! Gostaria de mais informações do ");

const SUFIXOS_DE_INTENCAO = Object.values(INTENCOES).map(soLetrasEEspacos);

/**
 * Teto do NOME, não da mensagem.
 *
 * O teto antigo (120) valia sobre o texto inteiro e passou a ser pequeno
 * demais quando a intenção entrou: medido no catálogo real, a pior
 * combinação dá 137. Aqui ele protege exatamente o pedaço que vira
 * identificação de imóvel, e o nome mais longo do catálogo tem 58.
 */
const TETO_DO_NOME = 80;
```

E depois:

```ts
export function reconhecerMensagemDeAnuncio(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = soLetrasEEspacos(texto);
  if (!limpo.startsWith(PREFIXO_ANUNCIO)) return null;

  let nome = limpo.slice(PREFIXO_ANUNCIO.length).trim();
  for (const sufixo of SUFIXOS_DE_INTENCAO) {
    if (sufixo && nome.endsWith(sufixo)) {
      nome = nome.slice(0, -sufixo.length).trim();
      break;
    }
  }

  if (nome.length < 3 || nome.length > TETO_DO_NOME) return null;
  return nome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/porteiro.test.ts`
Expected: PASS, incluindo os casos que já existiam no arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/porteiro.ts src/lib/whatsapp/porteiro.test.ts
git commit -m "feat(porteiro): a mensagem leva a intencao, e o nome sai por sufixo fechado"
```

---

### Task 2: A frase geral do site, reconhecida por código

Home, rodapé e botão flutuante não têm imóvel. Eles precisam de uma mensagem que o webhook aceite sem nome de imóvel dentro.

**Files:**
- Modify: `src/lib/whatsapp/porteiro.ts`
- Test: `src/lib/whatsapp/porteiro.test.ts`

**Interfaces:**
- Consumes: `soLetrasEEspacos` (interno), `ConviteDeEntrada` (já existe).
- Produces:
  - `export const MENSAGEM_DO_SITE: string`
  - `export function mensagemDoSite(intencao?: ChaveIntencao | null): string`
  - `reconhecerConviteDeEntrada` passa a devolver `{ via: "mensagem_do_site", imovel: null }` para essa frase.
  - `ConviteDeEntrada["via"]` ganha o valor `"mensagem_do_site"`.

- [ ] **Step 1: Write the failing test**

```ts
describe("a frase geral do site é reconhecida por código", () => {
  it("quem escreve a frase do site é convidado, sem imóvel", () => {
    const convite = reconhecerConviteDeEntrada({
      texto: mensagemDoSite(),
      palavrasEntradaCliente: null,
    });

    expect(convite).toEqual({ via: "mensagem_do_site", imovel: null });
  });

  it("vale mesmo com a intenção emendada", () => {
    const convite = reconhecerConviteDeEntrada({
      texto: mensagemDoSite("visita"),
      palavrasEntradaCliente: null,
    });

    expect(convite?.via).toBe("mensagem_do_site");
  });

  it("não depende de configuração por corretor", () => {
    // A instância sem frases cadastradas é o caso comum: só uma das
    // instâncias tem `palavras_entrada_cliente` preenchida.
    const convite = reconhecerConviteDeEntrada({
      texto: mensagemDoSite(),
      palavrasEntradaCliente: "",
    });

    expect(convite).not.toBeNull();
  });

  it("uma saudação qualquer continua sem convite", () => {
    expect(
      reconhecerConviteDeEntrada({ texto: "oi, tudo bem?", palavrasEntradaCliente: null }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/porteiro.test.ts`
Expected: FAIL com `mensagemDoSite is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `src/lib/whatsapp/porteiro.ts`, acrescente depois de `mensagemDeAnuncio`:

```ts
/**
 * A frase que o site manda quando não há imóvel no contexto.
 *
 * Reconhecida por CÓDIGO, não por `palavras_entrada_cliente`. A razão é
 * dependência: aquele campo é configuração POR CORRETOR e hoje só uma
 * instância o tem preenchido. Fazer o funil do site depender de um campo
 * que cada corretor preenche à mão constrói o mesmo silêncio que a 0111
 * causou — funciona para quem configurou e morre calado para o resto. A
 * mensagem é NOSSA, então reconhecê-la é decisão de código.
 */
export const MENSAGEM_DO_SITE = "Olá! Vim pelo site da Next Home.";

export function mensagemDoSite(intencao?: ChaveIntencao | null): string {
  return intencao ? `${MENSAGEM_DO_SITE} ${INTENCOES[intencao]}` : MENSAGEM_DO_SITE;
}

const PREFIXO_DO_SITE = soLetrasEEspacos(MENSAGEM_DO_SITE);
```

Troque o tipo do convite:

```ts
export type ConviteDeEntrada = {
  via: "mensagem_do_anuncio" | "mensagem_do_site" | "frase_de_entrada";
  /** O imóvel citado, quando o texto é o nosso e o traz. */
  imovel: string | null;
};
```

E acrescente o ramo em `reconhecerConviteDeEntrada`, ANTES do ramo de `frase_de_entrada` e DEPOIS do de anúncio:

```ts
  if (params.texto && soLetrasEEspacos(params.texto).startsWith(PREFIXO_DO_SITE)) {
    /*
     * `imovel: null` de propósito, como no ramo da frase de entrada: quem
     * resolve o imóvel a partir da conversa é o `focoDaConversa`, na
     * mensagem seguinte. Chutar aqui poria o imóvel ERRADO na ficha.
     */
    return { via: "mensagem_do_site", imovel: null };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/porteiro.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no caller breaks on the new union member**

Run: `npx tsc --noEmit`
Expected: 0 erros. Se algum `switch` sobre `convite.via` reclamar de caso faltando, acrescente o caso tratando igual a `frase_de_entrada`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/porteiro.ts src/lib/whatsapp/porteiro.test.ts
git commit -m "feat(porteiro): a frase do site e reconhecida por codigo, nao por configuracao"
```

---

### Task 3: O sorteio aceita corretor preferido

O link pessoal `?corretor=<slug>` grava um cookie. O porteiro precisa preferir esse corretor, sem transformar a preferência em filtro.

**Files:**
- Create: `supabase/migrations/0113_sorteio_com_corretor_preferido.sql` (DESCARTADA no merge de 28/09: vale o sorteio da 0117 de produção, sem `preferido` — ver MEMORIA)
- Test: `src/lib/whatsapp/sorteioPreferido.test.ts`

**Interfaces:**
- Produces: função SQL `public.sortear_corretor_whatsapp(preferido uuid default null) returns table(corretor_id uuid, telefone text)`.

- [ ] **Step 1: Write the failing test**

Crie `src/lib/whatsapp/sorteioPreferido.test.ts`. É guarda de código-fonte, porque não há banco de teste nesta base:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte sobre a última definição da função no diretório
 * de migrations. Banco de teste não existe aqui, e a regressão seria
 * calada: o link pessoal pararia de preferir alguém sem nada ficar
 * vermelho.
 */
function ultimaDefinicaoDeSorteio(): string {
  const dir = "supabase/migrations";
  const arquivos = readdirSync(dir)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  let ultima = "";
  for (const arquivo of arquivos) {
    const sql = readFileSync(`${dir}/${arquivo}`, "utf8");
    const corte = sql.toLowerCase().lastIndexOf("function public.sortear_corretor_whatsapp");
    if (corte >= 0) ultima = sql.slice(corte);
  }
  return ultima;
}

describe("o sorteio do porteiro", () => {
  const def = ultimaDefinicaoDeSorteio();

  it("aceita um corretor preferido, com default null", () => {
    expect(def).toMatch(/preferido\s+uuid\s+default\s+null/i);
  });

  it("usa o preferido como ORDENAÇÃO, nunca como filtro", () => {
    // Preferência entra no `order by`. Se entrasse no `where`, o link
    // pessoal de um corretor desconectado devolveria destino nenhum — o
    // erro que a roleta de leads ja cometeu uma vez.
    const ordem = def.slice(def.toLowerCase().indexOf("order by"));
    expect(ordem).toContain("preferido");

    const onde = def.slice(
      def.toLowerCase().indexOf("where"),
      def.toLowerCase().indexOf("order by"),
    );
    expect(onde).not.toContain("preferido");
  });

  it("continua exigindo numero conectado", () => {
    expect(def).toMatch(/status_conexao\s*=\s*'conectado'/);
    expect(def).toMatch(/telefone_conectado\s+is\s+not\s+null/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/sorteioPreferido.test.ts`
Expected: FAIL — a definição atual não tem `preferido`.

- [ ] **Step 3: Write the migration**

Crie `supabase/migrations/0113_sorteio_com_corretor_preferido.sql`:

```sql
-- 0113 — o sorteio do porteiro aceita um corretor PREFERIDO.
--
-- O link pessoal `?corretor=<slug>` grava um cookie de 30 dias, e o
-- porteiro passa a olhar esse cookie antes de sortear. A preferencia entra
-- no ORDER BY, nunca no WHERE: o conjunto continua sendo o de quem tem
-- numero conectado, porque a funcao devolve um DESTINO e destino
-- desconectado nao existe. Tratar a preferencia como filtro faria o link
-- pessoal de um corretor desconectado devolver destino nenhum.
--
-- O parametro tem `default null` para o chamador existente (a rota
-- `/wa/<campanha>`) seguir valendo sem alteracao.

create or replace function public.sortear_corretor_whatsapp(preferido uuid default null)
returns table(corretor_id uuid, telefone text)
language sql
security definer
set search_path to 'public'
as $function$
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
   order by
     (c.id is distinct from preferido) asc,
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.arquivado_em is null
         and l.etapa not in ('perdido', 'fechado')
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1
$function$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/sorteioPreferido.test.ts src/lib/migrations.test.ts`
Expected: PASS nos dois arquivos.

- [ ] **Step 5: Apply the migration to production**

A migration é aditiva e idempotente (`create or replace`), então pode subir antes do código.

```bash
set -a; . ./.env.local; set +a
node -e "const fs=require('fs');fs.writeFileSync(process.env.TEMP+'/m.json',JSON.stringify({query:fs.readFileSync('supabase/migrations/0113_sorteio_com_corretor_preferido.sql','utf8')}))"
curl -s -X POST "https://api.supabase.com/v1/projects/prhhrqyubjcafvucirri/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" \
  --data @"$TEMP/m.json"
```

Confira nos DOIS sentidos, como manda a régua da 0077:

```sql
-- sem preferido, continua devolvendo alguem conectado
select * from public.sortear_corretor_whatsapp();
-- com preferido inexistente, NAO devolve vazio
select * from public.sortear_corretor_whatsapp('00000000-0000-0000-0000-000000000000');
```

Expected: as duas devolvem uma linha.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0113_sorteio_com_corretor_preferido.sql src/lib/whatsapp/sorteioPreferido.test.ts
git commit -m "feat(0113): o sorteio do porteiro prefere o corretor do link pessoal"
```

---

### Task 4: O módulo puro que monta o link do porteiro

Todo componente do site precisa do mesmo endereço. Duas montagens do mesmo link divergem, e o módulo precisa ser puro porque os componentes são `"use client"`.

**Files:**
- Create: `src/lib/whatsapp/linkDoPorteiro.ts`
- Test: `src/lib/whatsapp/linkDoPorteiro.test.ts`

**Interfaces:**
- Consumes: `ChaveIntencao` de `./porteiro`.
- Produces: `export function linkDoPorteiro(params: { imovelSlug?: string | null; intencao?: ChaveIntencao | null; corretorSlug?: string | null }): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { linkDoPorteiro } from "./linkDoPorteiro";

describe("o endereço do porteiro", () => {
  it("sem imóvel, é a porta geral", () => {
    expect(linkDoPorteiro({})).toBe("/wa");
  });

  it("com imóvel, é a porta do imóvel", () => {
    expect(linkDoPorteiro({ imovelSlug: "terra-alta" })).toBe("/wa/terra-alta");
  });

  it("leva a intenção quando há uma", () => {
    expect(linkDoPorteiro({ imovelSlug: "terra-alta", intencao: "visita" })).toBe(
      "/wa/terra-alta?i=visita",
    );
  });

  it("leva o corretor escolhido, e junta com a intenção", () => {
    expect(linkDoPorteiro({ corretorSlug: "bruna", intencao: "saber" })).toBe(
      "/wa?c=bruna&i=saber",
    );
  });

  it("escapa o que vem do cadastro", () => {
    expect(linkDoPorteiro({ imovelSlug: "casa & cia" })).toBe("/wa/casa%20%26%20cia");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/linkDoPorteiro.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ChaveIntencao } from "./porteiro";

/**
 * O endereço do porteiro, montado num lugar só.
 *
 * Todo ponto de WhatsApp do site público aponta para cá. Duas montagens do
 * mesmo link divergem no primeiro ajuste — é o defeito que esta base
 * registra desde `montarResumo` —, e a divergência aqui seria calada: o
 * botão funcionaria, a conversa abriria, e só o CRM não veria nada.
 *
 * Módulo PURO, sem `server-only`: quem chama é `"use client"`.
 */
export function linkDoPorteiro(params: {
  imovelSlug?: string | null;
  intencao?: ChaveIntencao | null;
  corretorSlug?: string | null;
}): string {
  const base = params.imovelSlug
    ? `/wa/${encodeURIComponent(params.imovelSlug)}`
    : "/wa";

  const busca = new URLSearchParams();
  if (params.corretorSlug) busca.set("c", params.corretorSlug);
  if (params.intencao) busca.set("i", params.intencao);

  const query = busca.toString();
  return query ? `${base}?${query}` : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/linkDoPorteiro.test.ts`
Expected: PASS. Se o caso do escape falhar, confira que `encodeURIComponent` produz `casa%20%26%20cia` e ajuste a expectativa do teste ao valor real, não o contrário.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/linkDoPorteiro.ts src/lib/whatsapp/linkDoPorteiro.test.ts
git commit -m "feat(porteiro): um lugar so monta o endereco do porteiro"
```

---

### Task 5: A rota do porteiro aceita intenção, cookie e a porta geral

**Files:**
- Modify: `src/app/wa/[campanha]/route.ts`
- Create: `src/app/wa/route.ts`
- Create: `src/lib/whatsapp/destinoDoPorteiro.ts`
- Test: `src/lib/whatsapp/destinoDoPorteiro.test.ts`

**Interfaces:**
- Consumes: `mensagemDeAnuncio`, `mensagemDoSite`, `ehChaveIntencao`, `resolverCampanha` (Task 1 e 2); `sortear_corretor_whatsapp(preferido)` (Task 3).
- Produces: `export function destinoDoPorteiro(params: { telefone: string | null | undefined; nomeImovel: string | null; intencao: ChaveIntencao | null; slugImovel: string | null }): { tipo: "whatsapp"; url: string } | { tipo: "escape"; caminho: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { destinoDoPorteiro } from "./destinoDoPorteiro";

describe("para onde o porteiro manda", () => {
  it("com telefone e imóvel, abre o WhatsApp com a mensagem do imóvel", () => {
    const d = destinoDoPorteiro({
      telefone: "5511999999999",
      nomeImovel: "Terra Alta",
      intencao: "visita",
      slugImovel: "terra-alta",
    });

    expect(d.tipo).toBe("whatsapp");
    expect(d.tipo === "whatsapp" && d.url).toContain("wa.me/5511999999999");
    expect(decodeURIComponent(d.tipo === "whatsapp" ? d.url : "")).toContain(
      "Gostaria de mais informações do Terra Alta. Quero agendar uma visita.",
    );
  });

  it("sem imóvel, manda a frase geral do site", () => {
    const d = destinoDoPorteiro({
      telefone: "5511999999999",
      nomeImovel: null,
      intencao: null,
      slugImovel: null,
    });

    expect(decodeURIComponent(d.tipo === "whatsapp" ? d.url : "")).toContain(
      "Vim pelo site da Next Home.",
    );
  });

  it("sem ninguém conectado, escapa para o contato, não para a página do imóvel", () => {
    // A página do imóvel não tem formulário, e depois desta obra ela só tem
    // botões que voltam ao porteiro: seria pingue-pongue.
    const d = destinoDoPorteiro({
      telefone: null,
      nomeImovel: "Terra Alta",
      intencao: null,
      slugImovel: "terra-alta",
    });

    expect(d).toEqual({ tipo: "escape", caminho: "/contato" });
  });

  it("telefone curto demais conta como ninguém conectado", () => {
    const d = destinoDoPorteiro({
      telefone: "551199",
      nomeImovel: null,
      intencao: null,
      slugImovel: null,
    });

    expect(d.tipo).toBe("escape");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/destinoDoPorteiro.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

Crie `src/lib/whatsapp/destinoDoPorteiro.ts`:

```ts
import { mensagemDeAnuncio, mensagemDoSite, type ChaveIntencao } from "./porteiro";

/**
 * A decisão do porteiro, isolada da rota para ter teste sem rede.
 *
 * O escape NÃO é mais a página do imóvel. Ela não tem formulário — o
 * público só existe em `/contato` e `/anunciar-imovel` — e, depois que os
 * botões dela passaram a apontar para cá, mandar o visitante de volta seria
 * pingue-pongue. `/contato` tem formulário, cria lead por `/api/leads` e já
 * passa pela roleta.
 */
export type DestinoDoPorteiro =
  | { tipo: "whatsapp"; url: string }
  | { tipo: "escape"; caminho: string };

export function destinoDoPorteiro(params: {
  telefone: string | null | undefined;
  nomeImovel: string | null;
  intencao: ChaveIntencao | null;
  slugImovel: string | null;
}): DestinoDoPorteiro {
  const telefone = params.telefone?.replace(/\D/g, "") ?? "";
  if (telefone.length < 10) return { tipo: "escape", caminho: "/contato" };

  const texto = params.nomeImovel
    ? mensagemDeAnuncio(params.nomeImovel, params.intencao)
    : mensagemDoSite(params.intencao);

  return { tipo: "whatsapp", url: `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/destinoDoPorteiro.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the existing route**

Em `src/app/wa/[campanha]/route.ts`:

1. Troque os imports para incluir o que falta:

```ts
import { ehChaveIntencao, mensagemDeAnuncio, resolverCampanha } from "@/lib/whatsapp/porteiro";
import { destinoDoPorteiro } from "@/lib/whatsapp/destinoDoPorteiro";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
```

`mensagemDeAnuncio` deixa de ser usada diretamente pela rota; remova-a do import se o lint reclamar.

2. Depois de `const url = new URL(req.url);`, leia intenção e corretor preferido:

```ts
  const bruto = url.searchParams.get("i");
  const intencao = ehChaveIntencao(bruto) ? bruto : null;

  /*
   * O corretor do link pessoal entra como PREFERÊNCIA no sorteio, nunca
   * como filtro: se ele não tem número conectado, o clique não pode morrer.
   * `?c=` vence o cookie, porque é escolha explícita na página.
   */
  const escolhido = url.searchParams.get("c");
  const doCookie = escolhido ? null : await getCorretorAtivo();
```

3. Troque a chamada do sorteio para passar o preferido. Só o `?c=` precisa
resolver slug para id; o cookie já vem com o id dentro:

```ts
  // O cookie já traz o ID resolvido (`CorretorAtivo = Corretor & { id }`),
  // então só o caminho do `?c=` custa uma consulta.
  let preferidoId: string | null = doCookie?.id ?? null;
  if (escolhido) {
    const { data } = await supabase
      .from("corretores")
      .select("id")
      .eq("slug", escolhido)
      .maybeSingle<{ id: string }>();
    preferidoId = data?.id ?? null;
  }

  const { data: sorteio } = await supabase
    .rpc("sortear_corretor_whatsapp", { preferido: preferidoId })
    .maybeSingle<{ corretor_id: string; telefone: string }>();
```

4. Troque o bloco final de decisão pelo destino calculado:

```ts
  const destino = destinoDoPorteiro({
    telefone: sorteio?.telefone,
    nomeImovel: alvo.nome,
    intencao,
    slugImovel: alvo.slug,
  });

  if (destino.tipo === "escape") {
    await registrarClique(null);
    return NextResponse.redirect(new URL(destino.caminho, url.origin), 302);
  }

  await registrarClique(sorteio?.corretor_id ?? null);
  return NextResponse.redirect(destino.url, 302);
```

- [ ] **Step 6: Create the general door**

Crie `src/app/wa/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createServiceClient } from "@/lib/supabase/service";
import { destinoDoPorteiro } from "@/lib/whatsapp/destinoDoPorteiro";
import { ehChaveIntencao } from "@/lib/whatsapp/porteiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A porta GERAL do porteiro: `/wa`, sem imóvel.
 *
 * Home, rodapé, botão flutuante e cartão de corretor não têm imóvel no
 * contexto, e o reconhecedor de anúncio exige o nome de um. Aqui a mensagem
 * é a frase geral do site, que `porteiro.ts` reconhece por código.
 *
 * O resto é igual à porta do imóvel: sorteia entre quem tem número
 * conectado, prefere o corretor do link pessoal, registra o clique e nunca
 * termina em tela quebrada.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = createServiceClient();

  const bruto = url.searchParams.get("i");
  const intencao = ehChaveIntencao(bruto) ? bruto : null;

  const escolhido = url.searchParams.get("c");
  const doCookie = escolhido ? null : await getCorretorAtivo();

  // O cookie já traz o ID resolvido (`CorretorAtivo = Corretor & { id }`),
  // então só o caminho do `?c=` custa uma consulta.
  let preferidoId: string | null = doCookie?.id ?? null;
  if (escolhido) {
    const { data } = await supabase
      .from("corretores")
      .select("id")
      .eq("slug", escolhido)
      .maybeSingle<{ id: string }>();
    preferidoId = data?.id ?? null;
  }

  const { data: sorteio } = await supabase
    .rpc("sortear_corretor_whatsapp", { preferido: preferidoId })
    .maybeSingle<{ corretor_id: string; telefone: string }>();

  const destino = destinoDoPorteiro({
    telefone: sorteio?.telefone,
    nomeImovel: null,
    intencao,
    slugImovel: null,
  });

  // Fire-and-forget seria perder o clique se a função for congelada logo
  // após o redirect; o insert é aguardado de propósito (custa ~1 RTT).
  await supabase.from("cliques_whatsapp").insert({
    corretor_id: destino.tipo === "whatsapp" ? (sorteio?.corretor_id ?? null) : null,
    empreendimento_id: null,
    origem: "site",
    url_origem: url.pathname + url.search,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  return destino.tipo === "escape"
    ? NextResponse.redirect(new URL(destino.caminho, url.origin), 302)
    : NextResponse.redirect(destino.url, 302);
}
```

- [ ] **Step 7: Verify types and tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/whatsapp/`
Expected: 0 erros de tipo, todos os testes de `src/lib/whatsapp/` passando.

- [ ] **Step 8: Commit**

```bash
git add src/app/wa src/lib/whatsapp/destinoDoPorteiro.ts src/lib/whatsapp/destinoDoPorteiro.test.ts
git commit -m "feat(porteiro): porta geral /wa, intencao, cookie e escape para o contato"
```

---

### Task 6: A página do imóvel para de falar com o dono

**Files:**
- Modify: `src/components/empreendimento/Hero.tsx`
- Modify: `src/components/empreendimento/Contato.tsx`
- Modify: `src/components/empreendimento/Localizacao.tsx`
- Modify: `src/components/empreendimento/BookDigital.tsx`
- Modify: `src/app/(vitrine)/empreendimentos/[slug]/SecoesDoImovel.tsx`
- Modify: `src/components/mapa/CardFlutuanteImovel.tsx`

**Interfaces:**
- Consumes: `linkDoPorteiro` (Task 4).
- Produces: nenhum componente do imóvel lê `e.corretor`.

- [ ] **Step 1: Replace the four link builders**

Em cada arquivo, troque a montagem de `wa.me` pelo endereço do porteiro. O mapeamento de intenção é o da tabela do spec:

`Hero.tsx`:

```tsx
  const link = linkDoPorteiro({ imovelSlug: e.slug, intencao: "saber" });
  const linkDescricao = linkDoPorteiro({ imovelSlug: e.slug, intencao: "material" });
```

`Contato.tsx`:

```tsx
  const link = linkDoPorteiro({ imovelSlug: e.slug, intencao: "tabela" });
```

`Localizacao.tsx`:

```tsx
  // Quem olha o mapa está decidindo se vale a ida — é o momento da visita.
  const linkVisita = linkDoPorteiro({ imovelSlug: e.slug, intencao: "visita" });
```

`BookDigital.tsx`:

```tsx
  const linkWhatsappBook = linkDoPorteiro({ imovelSlug: e.slug, intencao: "material" });
```

`SecoesDoImovel.tsx` (linha 69, dentro do `WhatsappCta`): troque a montagem por `linkDoPorteiro({ imovelSlug: e.slug, intencao: "tabela" })` e ajuste a prop conforme a Task 7 deixar o `WhatsappCta`.

`CardFlutuanteImovel.tsx`: troque as três linhas (`foneLimpo`, `textoZap`, `zapLink`) por:

```tsx
  // O número chumbado `5511972207204` saiu junto: número de gente dentro do
  // código é o que faz o contato ir para um celular que o sistema não vê.
  const zapLink = linkDoPorteiro({ imovelSlug: imovel.slug, intencao: "saber" });
```

Remova os imports que ficarem órfãos (`linkWhatsappPara`, `normalizarWhatsapp`) em cada arquivo — o lint acusa.

- [ ] **Step 2: Replace the identity block**

Em `Contato.tsx`, o bloco mostra foto, nome e "Corretor responsável · CRECI" de `e.corretor`. Troque a fonte para o corretor do cookie, que a página já lê:

1. A página `src/app/(vitrine)/empreendimentos/[slug]/page.tsx` já chama `getCorretorAtivo()` indiretamente via `getEmpreendimentoBySlug`. Passe o corretor ativo como prop opcional para `Contato`:

```tsx
type Props = { empreendimento: Empreendimento; corretorAtivo?: CorretorAtivo | null };
```

2. Dentro, renderize o bloco de identidade só quando houver corretor ativo:

```tsx
      {corretorAtivo && (
        // Quem chegou pelo link pessoal de alguém continua vendo aquela
        // pessoa. Quem chegou pela busca vê a imobiliária: sem dono, não há
        // rosto certo para mostrar, e inventar um seria escolher por acaso.
        <div>…bloco atual, com `corretorAtivo` no lugar de `e.corretor`…</div>
      )}
```

3. Quando não houver, mostre a imobiliária, usando `site.nome` de `@/lib/site`.

- [ ] **Step 3: Verify the compiler is quiet**

Run: `npx tsc --noEmit`
Expected: 0 erros. Os erros que aparecerem apontam leitores de `e.corretor` que faltaram — conserte-os aqui, não depois.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`
Expected: só o vermelho conhecido de `carimbo.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/components/empreendimento src/components/mapa/CardFlutuanteImovel.tsx "src/app/(vitrine)/empreendimentos/[slug]/SecoesDoImovel.tsx"
git commit -m "feat(imovel): o contato da pagina passa pelo porteiro, sem corretor dono"
```

---

### Task 7: O resto do site também passa pelo porteiro

**Files:**
- Modify: `src/components/home/CtaFinal.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/components/layout/WhatsappCta.tsx`
- Modify: `src/components/corretores/CardCorretor.tsx`

**Interfaces:**
- Consumes: `linkDoPorteiro` (Task 4).
- Produces: `WhatsappCta` deixa de receber `corretor`; passa a receber `imovelSlug?: string | null` e `intencao?: ChaveIntencao | null`.

- [ ] **Step 1: Change WhatsappCta's contract**

```tsx
type WhatsappCtaProps = {
  /** Quando há imóvel no contexto, o porteiro manda a mensagem dele. */
  imovelSlug?: string | null;
  intencao?: ChaveIntencao | null;
};

export function WhatsappCta({ imovelSlug, intencao }: WhatsappCtaProps) {
  const link = linkDoPorteiro({ imovelSlug, intencao });
  const rotulo = "Falar no WhatsApp";
  …
}
```

O rótulo deixa de nomear a pessoa, porque quem atende é decidido no clique.

- [ ] **Step 2: Update the three remaining callers**

`CtaFinal.tsx` e `Footer.tsx`: troque a montagem condicional por `linkDoPorteiro({ intencao: "saber" })`. Some o ramo que usava `corretorAtivo.whatsapp` e o que usava `linkWhatsapp(...)`.

`CardCorretor.tsx`: o visitante escolheu uma pessoa, então o link leva o slug dela:

```tsx
  const whatsapp = linkDoPorteiro({ corretorSlug: corretor.slug, intencao: "saber" });
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros de tipo; só o vermelho conhecido.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/CtaFinal.tsx src/components/layout src/components/corretores/CardCorretor.tsx
git commit -m "feat(site): home, rodape, botao flutuante e cartao de corretor pelo porteiro"
```

---

### Task 8: As duas páginas públicas de corretor

**Files:**
- Modify: `src/app/(institucional)/corretores/[slug]/page.tsx`
- Modify: `src/app/(institucional)/corretores/page.tsx`
- Modify: `src/components/corretores/CardCorretor.tsx`

**Interfaces:**
- Consumes: `getEmpreendimentos()` (já existe, devolve o catálogo publicado).
- Produces: nenhuma página lê `getAtuacaoPorCorretor` nem `getEmpreendimentosPorCorretor`.

- [ ] **Step 1: The broker page shows the whole catalog**

Em `src/app/(institucional)/corretores/[slug]/page.tsx`, troque `getEmpreendimentosPorCorretor(corretor.id)` por `getEmpreendimentos()`.

Ajuste o texto da seção para não prometer posse. Onde hoje diz algo como "imóveis de <nome>", passe a dizer:

```tsx
<p>Todo corretor da Next Home apresenta o catálogo inteiro.</p>
```

- [ ] **Step 2: The list drops "atua em"**

Em `src/app/(institucional)/corretores/page.tsx`:

1. Tire `getAtuacaoPorCorretor` do `Promise.all` e do import.
2. Troque a conta de `imoveisAcompanhados`:

```tsx
  const imoveis = await getEmpreendimentos();
  // Sem posse, o número que descreve a equipe é o tamanho do catálogo que
  // qualquer um deles apresenta.
  const imoveisAcompanhados = imoveis.length;
```

3. Tire a prop `atuacao` de `<CardCorretor />`.

Em `CardCorretor.tsx`, remova a prop `atuacao`, a função `resumoAtuacao` e o import de `AtuacaoCorretor`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: tudo limpo fora o vermelho conhecido.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(institucional)/corretores" src/components/corretores/CardCorretor.tsx
git commit -m "feat(corretores): sem posse, a pagina do corretor mostra o catalogo inteiro"
```

---

### Task 9: O tipo perde o corretor, e o catálogo perde o embed

Esta é a tarefa em que o compilador vira a guarda: se algum leitor escapou das tarefas 6, 7 e 8, ele aparece aqui.

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/catalogo/selects.ts`
- Modify: `src/lib/queries.ts`
- Modify: `src/lib/supabase/mappers.ts`
- Modify: `src/lib/catalogo/cache.ts`
- Test: `src/app/semCorretorDono.test.ts`

**Interfaces:**
- Produces: `Empreendimento` sem o campo `corretor`; `SELECT_EMPREENDIMENTO` sem o embed.

- [ ] **Step 1: Write the failing guard**

Crie `src/app/semCorretorDono.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de codigo-fonte: o site publico nao monta `wa.me`.
 *
 * A regressao seria calada — o botao funcionaria, a conversa abriria, e so
 * o CRM nao veria nada, porque mensagem montada a mao nao passa pelo
 * reconhecedor do porteiro. Foi esse o estado medido em 16/09/2026: 21 dos
 * 25 publicados apontavam para um numero sem instancia.
 *
 * O PAINEL fica fora do recorte de proposito: ali quem manda e o corretor
 * logado, pelo proprio numero, para quem ja e lead.
 */
const RAIZES = [
  path.join(process.cwd(), "src/components"),
  path.join(process.cwd(), "src/app/(vitrine)"),
  path.join(process.cwd(), "src/app/(institucional)"),
];

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /[.]tsx?$/.test(e.name) && !/[.]test[.]/.test(e.name) ? [p] : [];
  });
}

/** Comentario que CITA o padrao nao e uso dele. */
function semComentarios(fonte: string): string {
  const semBloco = fonte.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "");
  return semBloco
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

describe("o site publico nao monta wa.me por conta propria", () => {
  const todos = RAIZES.flatMap(arquivos);

  it("a varredura encontra arquivos", () => {
    // Piso de ocorrencias: varredura que para de achar arquivo aprova tudo
    // calada, que e exatamente o defeito que esta guarda persegue.
    expect(todos.length).toBeGreaterThan(50);
  });

  it("nenhum arquivo do site publico cita wa.me nem linkWhatsappPara", () => {
    const culpados = todos
      .filter((arq) => {
        const fonte = semComentarios(fs.readFileSync(arq, "utf8"));
        return fonte.includes("wa.me") || fonte.includes("linkWhatsappPara(");
      })
      .map((arq) => path.relative(process.cwd(), arq));

    expect(culpados).toEqual([]);
  });
});
```

- [ ] **Step 2: Run guard to verify it fails or passes honestly**

Run: `npx vitest run src/app/semCorretorDono.test.ts`
Expected: PASS, se as tarefas 6 e 7 foram completas. Se FALHAR, a lista de culpados mostra exatamente o que ficou para trás — conserte antes de seguir.

- [ ] **Step 3: Remove the field from the type**

Em `src/lib/types.ts`, remova a linha `corretor: Corretor;` de `Empreendimento`. Mantenha o tipo `Corretor`, que segue servindo `CorretorPerfil` e as páginas da equipe.

- [ ] **Step 4: Run the compiler as the second guard**

Run: `npx tsc --noEmit`
Expected: os erros restantes são leitores esquecidos. Conserte cada um; nenhum deve exigir decisão nova.

- [ ] **Step 5: Remove the embed and the dead functions**

1. `src/lib/catalogo/selects.ts`: apague a linha do embed de `SELECT_EMPREENDIMENTO`:

```
  corretor:corretores!empreendimentos_corretor_id_fkey(id, nome, creci, whatsapp, foto_url, video_url),
```

Apague também o comentário longo acima dela, que explica a chave estrangeira ambígua: ele descreve um problema que deixou de existir, e comentário que descreve mecanismo inexistente é pior que comentário nenhum.

2. `src/lib/queries.ts`: apague o mesmo embed e o mesmo comentário; apague `comCorretorAtivo` (o `lista.map((e) => ({ ...e, corretor: corretorAtivo }))`) e seus chamadores; apague `getAtuacaoPorCorretor`, `getEmpreendimentosPorCorretor` e o tipo `AtuacaoCorretor`.

3. `src/lib/catalogo/cache.ts`: apague `atuacaoPorCorretor` e `empreendimentosDoCorretor`.

4. `src/lib/supabase/mappers.ts`: apague o campo `corretor` de `mapEmpreendimento`, o campo `corretor` de `LinhaEmpreendimento` e o placeholder de corretor que existe para "evitar a UI quebrar por dado ausente".

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit && npx vitest run && node scripts/lintTeto.mjs && npx next build`
Expected: tudo limpo fora o vermelho conhecido.

- [ ] **Step 7: Commit**

```bash
git add src/lib src/app/semCorretorDono.test.ts
git commit -m "refactor(catalogo): o imovel deixa de carregar corretor, e o embed sai do select"
```

---

### Task 10: Deploy 1 e a prova em produção

A migration da coluna NÃO entra aqui. O embed precisa ter parado de rodar antes de a chave estrangeira cair.

- [ ] **Step 1: Confirm what production is serving**

```bash
curl -s https://next-home-drab.vercel.app/api/versao
git ls-remote origin refs/heads/main
```

Confira que o commit servido é ancestral do seu HEAD. Se não for, alguém subiu por fora: merje o que está no ar ANTES de seguir, nunca `--force`.

- [ ] **Step 2: Push to the three branches**

```bash
for r in ingestao-de-midia claude/modernizar-plataforma-imobiliaria-2tm13q main; do
  git merge-base --is-ancestor "origin/$r" HEAD && git push origin "HEAD:$r"
done
```

- [ ] **Step 3: Wait for the production record and prove it**

```bash
until curl -s https://next-home-drab.vercel.app/api/versao | grep -q "$(git rev-parse --short=7 HEAD)"; do sleep 20; done
```

Consultar cedo demais imita exatamente uma recusa: o registro `Production` nasce cerca de 75 s depois do `Preview`.

- [ ] **Step 4: Smoke the public routes**

```bash
B=https://next-home-drab.vercel.app
for r in / /empreendimentos /financiamento /corretores /sobre /mapa /regioes/alphaville; do
  printf "%-24s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' "$B$r")"
done
curl -s -o /dev/null -w "porteiro do imovel: %{http_code}\n" "$B/wa/eternity-alphaville"
curl -s -o /dev/null -w "porta geral:        %{http_code}\n" "$B/wa"
```

Expected: 200 nas páginas e 302 nas duas portas do porteiro. **Atenção:** cada chamada ao porteiro grava uma linha em `cliques_whatsapp`. Duas linhas de teste são aceitáveis; não varra o catálogo inteiro por HTTP.

---

### Task 11: A migration que dropa a coluna

Só depois de a Task 10 estar no ar e provada.

**Files:**
- Create: `supabase/migrations/0114_empreendimento_sem_corretor_dono.sql`

- [ ] **Step 1: Confirm nothing reads the column anymore**

```bash
grep -rn "corretor_id" src --include=*.ts --include=*.tsx | grep -v "leads\|cliques\|whatsapp\|admin\|anotacoes" | grep -v "\.test\."
```

Expected: nenhuma linha referente a `empreendimentos`.

- [ ] **Step 2: Write the migration**

```sql
-- 0114 — o imovel deixa de ter corretor dono.
--
-- Decisao de produto de 16/09/2026. A medicao que motivou: 21 dos 25
-- publicados apontavam o botao de WhatsApp para um corretor sem numero
-- conectado, porque o contato vinha do cadastro em vez de vir do porteiro.
--
-- A coluna e DROPADA, nao renomeada. Foi levantado que renomear para
-- `cadastrado_por` preservaria o historico de quem cadastrou cada imovel a
-- custo zero; a decisao foi dropar, reafirmada depois da ressalva.
--
-- Esta migration so pode rodar DEPOIS de o codigo ter parado de usar o
-- embed `corretor:corretores!empreendimentos_corretor_id_fkey`, senao o
-- catalogo inteiro cai no instante em que a chave estrangeira deixa de
-- existir.

alter table public.empreendimentos drop column if exists corretor_id;
```

- [ ] **Step 3: Verify the guard on migrations**

Run: `npx vitest run src/lib/migrations.test.ts`
Expected: PASS.

- [ ] **Step 4: Apply and confirm in both directions**

```sql
-- some
select count(*) from information_schema.columns
 where table_schema='public' and table_name='empreendimentos' and column_name='corretor_id';
-- e o catalogo continua respondendo
select count(*) from empreendimentos where publicado;
```

Expected: `0` na primeira, `25` na segunda.

- [ ] **Step 5: Commit and deploy 2**

```bash
git add supabase/migrations/0114_empreendimento_sem_corretor_dono.sql
git commit -m "feat(0114): empreendimento deixa de ter corretor dono"
```

Suba nas três branches e prove como na Task 10, com o smoke completo.

---

### Task 12: Vault e MEMORIA

O AGENTS.md exige: toda tarefa que gere decisão ou mudança de arquitetura termina atualizando o vault.

**Files:**
- Create: `vault/10-notas/o-imovel-nao-tem-mais-corretor-dono.md`
- Modify: `vault/20-mocs/MOC — Front Público.md`
- Modify: `docs/MEMORIA.md`

- [ ] **Step 1: Write the vault note**

Frontmatter completo, com `tags` do vocabulário fechado (`front`, `whatsapp`, `decisao`), `custou: alto`, `codigo` listando `src/lib/whatsapp/linkDoPorteiro.ts` e `src/app/wa/route.ts`, e `updated` com a data do dia.

O corpo cobre, com os números medidos: os 21 de 25 apontando para número sem instância; o site que não usava o porteiro em lugar nenhum; a lição de que conexão é filtro onde a função devolve destino e preferência onde ela devolve dono; o pingue-pongue que a obra criaria sem trocar o escape; e a armadilha de delimitar o nome por pontuação quando o prefixo atravessa duas frases.

- [ ] **Step 2: Link it from the MOC**

Acrescente uma linha em `vault/20-mocs/MOC — Front Público.md`, no formato das que já estão lá.

- [ ] **Step 3: Append the MEMORIA section**

Título: `## O imóvel não tem mais corretor dono (16/09/2026)`. Acrescente no FIM do arquivo. Escreva com acentuação, e confira os bytes depois (`python -c "import io; print(io.open('docs/MEMORIA.md','rb').read()[-200:])"`), porque o console desta máquina embaralha a saída sem embaralhar o arquivo.

- [ ] **Step 4: Verify the doc-reading tests**

Run: `npx vitest run src/lib/migrations.test.ts src/lib/imagens/pedidoDoCadastro.test.ts src/components/motion/fundoEncaixa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vault docs/MEMORIA.md
git commit -m "docs: o fim do corretor dono, e o porteiro como porta unica do site"
```
