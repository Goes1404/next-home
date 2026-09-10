# O contexto da IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devolver contexto à assistente — parar de gravar em branco as falas do cliente em conversa já atendida, dobrar a janela de histórico útil e impedir que o dossiê se apague sozinho.

**Architecture:** O sistema hoje confunde dois conceitos num campo só. `liberado_por_palavra_chave` responde "a IA pode falar AGORA?" (permissão, que vai e volta a cada fala do corretor) e é usado também para responder "esta conversa é atendimento?" (fato, que nunca deixa de ser verdade). Uma coluna nova, `whatsapp_conversas.atendida_em`, separa os dois: só a leitura de PRIVACIDADE passa a olhá-la; a decisão de FALAR (`motivoDoSilencio`) continua exatamente como está. Sobre isso vêm duas correções independentes: a janela de histórico sobe para 40 falas e descarta a marca de mensagem não gravada, e `salvarDossie` para de sobrescrever com `null`.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres + RLS), vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-contexto-da-ia-design.md`

## Global Constraints

- **O banco é o de PRODUÇÃO.** Não existe ambiente de teste. Toda migration é conferida antes com `begin; … rollback;`, e nos DOIS sentidos (o que passa a valer e o que continua valendo).
- **Migration nova é `0103`.** As `0101` e `0102` já estão commitadas (`f04fddf`). Colisão de número é pior que buraco — `src/lib/whatsapp/migrations.test.ts` tem lista `RESERVADOS`.
- **`src/lib/supabase/types.ts` é editado À MÃO.** Regenerar apaga as 34 uniões de CHECK escritas manualmente; toda coluna nova entra à mão em `Row`, `Insert` e `Update`.
- **`execute_sql` do MCP da Supabase é bloqueado para UPDATE em produção; `apply_migration` passa.**
- **Nenhuma mudança pode alterar `motivoDoSilencio`.** Ela decide se o cliente é atendido, e a opção "não retravar mais" foi explicitamente DESCARTADA pelo usuário.
- **Comentário de código neste projeto explica o PORQUÊ**, com o número medido junto, em português. Ver qualquer arquivo de `src/lib/whatsapp/`.
- Rodar `npx vitest run` (1477 testes hoje) e `npx tsc --noEmit` antes de cada commit.

---

### Task 1: A coluna `atendida_em` e o backfill (migration 0103)

**Files:**
- Create: `supabase/migrations/0103_conversa_atendida.sql`
- Modify: `src/lib/supabase/types.ts` (bloco `whatsapp_conversas`, ~linha 2053)

**Interfaces:**
- Consumes: nada.
- Produces: coluna `whatsapp_conversas.atendida_em timestamptz null`. As tarefas 2 e 3 dependem dela existir no banco E no tipo.

- [ ] **Step 1: Conferir o estado real antes de escrever a migration**

Rodar via MCP da Supabase (`execute_sql`, projeto `prhhrqyubjcafvucirri`):

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'whatsapp_conversas' and column_name in ('atendida_em','cliente_conhecido');

select count(*) as conversas_com_bot
from whatsapp_conversas c
where exists (select 1 from whatsapp_mensagens m where m.conversa_id = c.id and m.remetente = 'bot');
```

Esperado: `atendida_em` NÃO existe; `cliente_conhecido` existe; ~90 conversas com fala do bot. Anotar o número — é a expectativa do backfill no Step 4.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/0103_conversa_atendida.sql`:

```sql
-- 0103 — o FATO "esta conversa é atendimento", separado da PERMISSÃO
--
-- Medido em 10/09/2026: 1.007 de 3.181 falas do cliente (32%) em conversas
-- que o bot atende estão gravadas como
-- '[mensagem não gravada — conversa sem atendimento liberado]'.
--
-- A causa é o VAIVÉM. `decidirPorFalaDoCorretor` retrava a conversa a cada
-- fala do corretor que não é a palavra-chave, e ele manda ~373 por semana do
-- próprio celular (a instância roda no WhatsApp PESSOAL dele). Enquanto
-- travada, tudo que o cliente escreve vira a marca — para sempre. Quando
-- destrava, a IA lê um histórico furado, e furado de um lado só: a fala do
-- BOT nunca fica em branco, porque ele só fala liberado.
--
-- `liberado_por_palavra_chave` responde "a IA pode falar AGORA?" e vai e
-- volta. Esta coluna responde "esta conversa já foi atendimento?" e, uma vez
-- verdadeira, nunca deixa de ser. Só a decisão de PRIVACIDADE
-- (`conversaEhAtendimento`) passa a lê-la; `motivoDoSilencio` NÃO — quem
-- decide se a IA fala continua sendo o corretor.
--
-- Reusar `cliente_conhecido` para isto seria o erro: ela é lida por
-- `exigeLiberacaoExplicita`, então marcá-la desligaria o retravamento junto
-- — que é a opção descartada de propósito.

alter table public.whatsapp_conversas
  add column if not exists atendida_em timestamptz;

comment on column public.whatsapp_conversas.atendida_em is
  'Quando a IA atendeu esta conversa pela primeira vez. Carimbada UMA vez (nunca reescrita: reescrever faria a marca mentir sobre o inicio do atendimento, o mesmo motivo de corretor_whatsapp_instancias.desconectado_em). Lida so por conversaEhAtendimento (privacidade); NUNCA por motivoDoSilencio.';

-- Backfill: conversa em que o bot já falou É atendimento, e o histórico dela
-- não pode continuar sendo furado. Não toca em liberado_por_palavra_chave —
-- ou seja, não desmuta ninguém.
update public.whatsapp_conversas c
set atendida_em = b.primeira
from (
  select conversa_id, min(created_at) as primeira
  from public.whatsapp_mensagens
  where remetente = 'bot'
  group by conversa_id
) b
where b.conversa_id = c.id
  and c.atendida_em is null;
```

- [ ] **Step 3: Ensaiar a migration em transação, nos DOIS sentidos**

Antes, fora de transação, guardar a linha de base:

```sql
select count(*) filter (where liberado_por_palavra_chave) as liberadas,
       count(*) filter (where cliente_conhecido)          as conhecidas
from public.whatsapp_conversas;
```

Depois, o ensaio (`execute_sql` aceita: é `select` dentro de `begin/rollback`):

```sql
begin;

alter table public.whatsapp_conversas add column if not exists atendida_em timestamptz;

update public.whatsapp_conversas c
set atendida_em = b.primeira
from (select conversa_id, min(created_at) as primeira
      from public.whatsapp_mensagens where remetente='bot' group by conversa_id) b
where b.conversa_id = c.id and c.atendida_em is null;

-- o que passa a valer: conversa com bot ganhou carimbo
select count(*) filter (where atendida_em is not null) as carimbadas,
       count(*) filter (where atendida_em is null)     as sem_carimbo
from public.whatsapp_conversas;

-- o que CONTINUA valendo: ninguém foi desmutado
select count(*) filter (where liberado_por_palavra_chave) as liberadas,
       count(*) filter (where cliente_conhecido)          as conhecidas
from public.whatsapp_conversas;

rollback;
```

Esperado: `carimbadas` bate com o número do Step 1; `liberadas` e `conhecidas` idênticas à linha de base.

- [ ] **Step 4: Aplicar a migration**

Via MCP da Supabase, `apply_migration` com nome `0103_conversa_atendida` e o conteúdo do arquivo. Depois conferir:

```sql
select count(*) filter (where atendida_em is not null) from public.whatsapp_conversas;
```

Esperado: o número do Step 1.

- [ ] **Step 5: Declarar a coluna em `src/lib/supabase/types.ts`**

No bloco `whatsapp_conversas`, acrescentar `atendida_em` nos TRÊS lugares, ao lado de `cliente_conhecido`:

```ts
        Row: {
          atendida_em: string | null
          cliente_conhecido: boolean
          // … resto igual
        }
        Insert: {
          atendida_em?: string | null
          cliente_conhecido?: boolean
          // … resto igual
        }
        Update: {
          atendida_em?: string | null
          cliente_conhecido?: boolean
          // … resto igual
        }
```

- [ ] **Step 6: Conferir tipos e testes**

```bash
npx tsc --noEmit
npx vitest run src/lib/whatsapp/migrations.test.ts
```

Esperado: ambos passam.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0103_conversa_atendida.sql src/lib/supabase/types.ts
git commit -m "feat(db): atendida_em separa o FATO do atendimento da PERMISSAO de falar (0103)

32% das falas do cliente em conversas atendidas estavam gravadas em branco:
a conversa retrava a cada fala do corretor e, travada, o texto nao e
guardado. A coluna nova e lida so pela privacidade; motivoDoSilencio nao a
enxerga, entao ninguem e desmutado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A quarta porta em `conversaEhAtendimento`

**Files:**
- Modify: `src/lib/whatsapp/privacidadeDaConversa.ts:65-75`
- Modify: `src/lib/whatsapp/repositorio.ts:93-140` (`ConversaPersistida`, `SELECT_CONVERSA`, `mapConversa`)
- Test: `src/lib/whatsapp/privacidadeDaConversa.test.ts`

**Interfaces:**
- Consumes: coluna `atendida_em` da Task 1.
- Produces:
  - `ConversaPersistida.atendidaEm: string | null`
  - `conversaEhAtendimento(conversa: { liberadoPorPalavraChave: boolean; clienteConhecido?: boolean | null; origem?: string | null; atendidaEm?: string | null }): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `src/lib/whatsapp/privacidadeDaConversa.test.ts`:

```ts
describe("a quarta porta: conversa que a IA já atendeu", () => {
  /*
   * Medido em 10/09/2026: 1.007 de 3.181 falas do cliente (32%) em conversas
   * que o bot atende estavam gravadas em branco. A causa é o VAIVÉM — a
   * conversa retrava a cada fala do corretor, e travada não guarda texto.
   * O atendimento é um FATO: uma vez que a IA atendeu, atendeu.
   */
  it("conversa já atendida guarda texto mesmo depois de retravada", () => {
    expect(
      conversaEhAtendimento({
        liberadoPorPalavraChave: false,
        clienteConhecido: false,
        origem: "organica",
        atendidaEm: "2026-09-08T16:10:00.000Z",
      }),
    ).toBe(true);
  });

  it("conversa nunca atendida e nunca liberada continua sem guardar texto", () => {
    expect(
      conversaEhAtendimento({
        liberadoPorPalavraChave: false,
        clienteConhecido: false,
        origem: "organica",
        atendidaEm: null,
      }),
    ).toBe(false);
  });

  it("o campo ausente é o mesmo que nunca atendida — chamador antigo não vira porta aberta", () => {
    expect(
      conversaEhAtendimento({ liberadoPorPalavraChave: false, origem: "organica" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/privacidadeDaConversa.test.ts
```

Esperado: FAIL no primeiro teste — `conversaEhAtendimento` ainda ignora `atendidaEm` e devolve `false`.

- [ ] **Step 3: Implementar a quarta porta**

Em `src/lib/whatsapp/privacidadeDaConversa.ts`, trocar a assinatura e o corpo:

```ts
export function conversaEhAtendimento(conversa: {
  liberadoPorPalavraChave: boolean;
  clienteConhecido?: boolean | null;
  origem?: string | null;
  /**
   * A IA já atendeu esta conversa alguma vez (0103).
   *
   * É a porta que fecha o buraco medido em 10/09/2026: a conversa RETRAVA a
   * cada fala do corretor (`decidirPorFalaDoCorretor`), e enquanto travada o
   * texto do cliente não era guardado — 1.007 falas em branco, 32% do total,
   * e numa conversa 14 de 21. Atendimento é FATO: uma vez atendida, atendida.
   *
   * Ela NÃO participa de `exigeLiberacaoExplicita` nem de
   * `motivoDoSilencio`, e é isso que a separa de `clienteConhecido`: quem
   * decide se a IA FALA continua sendo o corretor.
   */
  atendidaEm?: string | null;
}): boolean {
  return (
    conversa.liberadoPorPalavraChave ||
    conversa.clienteConhecido === true ||
    conversa.origem === "campanha" ||
    Boolean(conversa.atendidaEm)
  );
}
```

E atualizar o comentário do cabeçalho da função, onde ele diz "Três portas, e qualquer uma basta" — agora são quatro, e a quarta merece a frase: "4. a IA já atendeu esta conversa alguma vez (o atendimento é fato, não permissão)".

- [ ] **Step 4: Levar a coluna até `ConversaPersistida`**

Em `src/lib/whatsapp/repositorio.ts`, três edições:

```ts
// 1) no type ConversaPersistida, depois de clienteConhecido:
  /**
   * Quando a IA atendeu esta conversa pela primeira vez (0103), ou null.
   *
   * Lida SÓ pela privacidade (`conversaEhAtendimento`). Não entra em
   * `motivoDoSilencio` nem em `exigeLiberacaoExplicita` de propósito: é o
   * FATO do atendimento, não a PERMISSÃO de falar.
   */
  atendidaEm: string | null;
```

```ts
// 2) SELECT_CONVERSA:
const SELECT_CONVERSA =
  "id, lead_id, telefone_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, origem, e_teste, cliente_conhecido, atendida_em";
```

```ts
// 3) mapConversa: na assinatura do row
  atendida_em?: string | null;
// e no objeto devolvido, depois de clienteConhecido:
    atendidaEm: row.atendida_em ?? null,
```

- [ ] **Step 5: Rodar tudo**

```bash
npx vitest run
npx tsc --noEmit
```

Esperado: tudo passa. Se algum teste montar um `ConversaPersistida` literal, o compilador cobra `atendidaEm` — acrescentar `atendidaEm: null` nesses fixtures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/privacidadeDaConversa.ts src/lib/whatsapp/privacidadeDaConversa.test.ts src/lib/whatsapp/repositorio.ts
git commit -m "feat(ia): conversa ja atendida guarda texto mesmo depois de retravada

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: O webhook carimba `atendida_em`, e a guarda que prova a separação

**Files:**
- Modify: `src/lib/whatsapp/repositorio.ts` (função nova, logo depois de `marcarConversaComoAtendimento:879`)
- Modify: `src/app/api/webhooks/whatsapp/route.ts:720` (logo depois do `gravarMensagem` do bot)
- Test: `src/lib/whatsapp/privacidadeDaConversa.test.ts`

**Interfaces:**
- Consumes: `ConversaPersistida.atendidaEm` (Task 2).
- Produces: `marcarConversaAtendida(conversaId: string): Promise<void>`.

- [ ] **Step 1: Escrever a guarda central — o par que prova a separação**

Acrescentar em `src/lib/whatsapp/privacidadeDaConversa.test.ts`, importando `exigeLiberacaoExplicita` de `./modoBot`:

```ts
describe("FATO e PERMISSÃO se separaram — a guarda central", () => {
  /*
   * Sem os DOIS lados, este teste não distingue esta correção da opção que
   * foi DESCARTADA ("conversa atendida não retrava mais"). Um lado sozinho
   * passaria nas duas.
   */
  const jaAtendida = {
    liberadoPorPalavraChave: false,
    clienteConhecido: false,
    origem: "organica" as const,
    atendidaEm: "2026-09-08T16:10:00.000Z",
  };

  it("o FATO é reconhecido: o texto volta a ser guardado", () => {
    expect(conversaEhAtendimento(jaAtendida)).toBe(true);
  });

  it("a PERMISSÃO não muda: a fala do corretor continua retravando", () => {
    // exigeLiberacaoExplicita não conhece `atendidaEm`, e é isso que mantém
    // o corretor no controle de quando a IA fala — numa linha que é o
    // WhatsApp pessoal dele (o caso real da conversa da mãe).
    expect(
      exigeLiberacaoExplicita({ origemConversa: "organica", jaEraDoCrm: false }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — os dois têm de passar**

```bash
npx vitest run src/lib/whatsapp/privacidadeDaConversa.test.ts
```

Esperado: PASS nos dois. O primeiro veio da Task 2; o segundo é a invariante que não podia ter sido quebrada. Se o segundo falhar, a Task 2 mexeu no que não devia — parar e revisar antes de seguir.

- [ ] **Step 3: Escrever `marcarConversaAtendida`**

Em `src/lib/whatsapp/repositorio.ts`, logo depois de `marcarConversaComoAtendimento`:

```ts
/**
 * Carimba o FATO: a IA atendeu esta conversa (0103).
 *
 * `.is("atendida_em", null)` não é otimização — é o que impede a marca de
 * mentir. Reescrevendo a cada resposta, o começo do atendimento seria sempre
 * "agora", e a coluna deixaria de responder a pergunta que ela existe para
 * responder. Mesmo motivo de `desconectado_em` (0071).
 *
 * Diferente de `marcarConversaComoAtendimento`, esta função NÃO toca em
 * `cliente_conhecido` nem em `liberado_por_palavra_chave`: ela não dá
 * permissão nenhuma, só registra o que aconteceu.
 */
export async function marcarConversaAtendida(conversaId: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("whatsapp_conversas")
    .update({ atendida_em: new Date().toISOString() })
    .eq("id", conversaId)
    .is("atendida_em", null);

  if (error) console.error("[conversa] falha ao carimbar atendida_em:", error.message);
}
```

- [ ] **Step 4: Chamar no webhook, depois de a mensagem do bot ser gravada**

Em `src/app/api/webhooks/whatsapp/route.ts`, acrescentar `marcarConversaAtendida` ao import de `@/lib/whatsapp/repositorio` e, logo APÓS o bloco `const mensagemDoBot = await gravarMensagem({...});`:

```ts
    /*
     * A partir daqui esta conversa é atendimento para sempre (0103). O
     * carimbo vem DEPOIS da gravação de propósito: antes, uma falha no envio
     * deixaria marcada como atendida uma conversa em que ninguém falou.
     *
     * Custa um update por conversa na vida inteira — da segunda resposta em
     * diante o `.is(null)` não casa com linha nenhuma.
     */
    await marcarConversaAtendida(conversa.id);
    conversa.atendidaEm = conversa.atendidaEm ?? new Date().toISOString();
```

A segunda linha importa: `conversa` continua sendo usado no mesmo turno (dossiê, avisos), e sem ela o objeto em memória seguiria dizendo `null`.

- [ ] **Step 5: Rodar tudo**

```bash
npx vitest run
npx tsc --noEmit
```

Esperado: tudo passa.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/repositorio.ts src/lib/whatsapp/privacidadeDaConversa.test.ts "src/app/api/webhooks/whatsapp/route.ts"
git commit -m "feat(ia): o webhook carimba atendida_em na primeira resposta da IA

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A janela vira 40 falas com texto

**Files:**
- Modify: `src/lib/whatsapp/repositorio.ts:980-1005` (`historicoRecente`)
- Create: `src/lib/whatsapp/janelaDeHistorico.test.ts`

**Interfaces:**
- Consumes: `TEXTO_NAO_GUARDADO` de `./privacidadeDaConversa`.
- Produces: `historicoRecente(conversaId: string, limite?: number)` com padrão **40** e sem a marca.

- [ ] **Step 1: Escrever o teste que lê o código-fonte**

`historicoRecente` vai ao banco, e não há banco de teste. A guarda é da mesma família de `escalaDoPainel.test.ts` e `gravacaoDeMensagem.test.ts`: lê o fonte e cobra a regra, porque a regressão falha CALADA — a IA continua respondendo, só que sem lembrar do que foi dito.

Criar `src/lib/whatsapp/janelaDeHistorico.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";

/**
 * Medido em 10/09/2026 sobre 5.744 mensagens reais: a janela de 20 entregava
 * 9,5 falas ÚTEIS (cliente+bot com texto) por conversa longa. O resto era
 * marca em branco e fala do corretor. Com 40 e sem a marca: 21,8.
 */
const fonte = readFileSync(new URL("./repositorio.ts", import.meta.url), "utf8");

function corpoDe(nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\nexport ", inicio + 1);
  return fonte.slice(inicio, fim === -1 ? undefined : fim);
}

describe("a janela de histórico", () => {
  const corpo = corpoDe("historicoRecente");

  it("pede 40 mensagens, não 20", () => {
    expect(corpo).toMatch(/limite = 40/);
  });

  it("descarta a marca de mensagem não gravada na própria consulta", () => {
    // Ela não ensina nada e ocupa linha da janela: 88 das 315 falas medidas
    // eram a própria marca.
    expect(corpo).toContain("TEXTO_NAO_GUARDADO");
    expect(corpo).toMatch(/\.neq\(\s*"conteudo"/);
  });

  it("a marca não é copiada como literal — vem de privacidadeDaConversa", () => {
    // Com um literal aqui, mudar o texto lá faria o filtro parar de casar e o
    // buraco voltaria sem nenhum teste vermelho.
    expect(fonte).not.toContain(`"${TEXTO_NAO_GUARDADO}"`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/janelaDeHistorico.test.ts
```

Esperado: FAIL nos dois primeiros — hoje é `limite = 20` e não há `.neq`.

- [ ] **Step 3: Implementar**

Em `src/lib/whatsapp/repositorio.ts`, trocar `historicoRecente` e o comentário acima dela:

```ts
/**
 * Últimas mensagens para dar memória ao agente — sem isso ele repete a
 * saudação a cada turno.
 *
 * Eram 12, viraram 20, e 20 ainda era pouco. Medido em 10/09/2026 sobre
 * 5.744 mensagens reais: das 20 que entravam, só **9,5** eram falas úteis
 * (cliente ou bot, com texto). O resto era marca de mensagem não gravada e
 * fala do CORRETOR — a instância roda no WhatsApp pessoal dele, então numa
 * conversa longa a janela da IA é ocupada pela conversa humana.
 *
 * Com 40 e sem a marca, a média sobe para 21,8. A marca sai na PRÓPRIA
 * consulta porque ela não ensina nada e ocupava lugar: 88 das 315 falas
 * medidas eram ela mesma.
 *
 * O dossiê é extraído desta mesma consulta (ver o webhook), então ele também
 * passa a enxergar o dobro — o que ataca pela raiz o campo que sumia quando o
 * assunto saía da janela.
 */
export async function historicoRecente(
  conversaId: string,
  limite = 40,
): Promise<{ remetente: "cliente" | "bot" | "corretor"; texto: string }[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo")
    .eq("conversa_id", conversaId)
    .neq("conteudo", TEXTO_NAO_GUARDADO)
    .order("created_at", { ascending: false })
    .limit(limite);

  return (data ?? []).reverse().map((m) => ({ remetente: m.remetente, texto: m.conteudo }));
}
```

Acrescentar `TEXTO_NAO_GUARDADO` ao import já existente de `./privacidadeDaConversa` no topo do arquivo (ele importa `conteudoParaGravar` e `resumoParaGravar`).

- [ ] **Step 4: Rodar tudo**

```bash
npx vitest run
npx tsc --noEmit
```

Esperado: tudo passa.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/repositorio.ts src/lib/whatsapp/janelaDeHistorico.test.ts
git commit -m "feat(ia): a janela de historico vira 40 falas com texto

Das 20 que entravam, so 9,5 eram falas uteis - o resto era marca de mensagem
nao gravada e fala do corretor. Com 40 e sem a marca: 21,8. O dossie sai da
mesma consulta e passa a enxergar o dobro.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: O dossiê para de se apagar

**Files:**
- Create: `src/lib/whatsapp/mesclaDossie.ts`
- Create: `src/lib/whatsapp/mesclaDossie.test.ts`
- Modify: `src/lib/whatsapp/repositorio.ts:1294-1315` (`salvarDossie`)

**Interfaces:**
- Consumes: `DossieClienteIA` de `./types`.
- Produces: `mesclarDossie(anterior: DossieClienteIA | null, novo: DossieClienteIA): LinhaDossie`, com

```ts
export type LinhaDossie = {
  orcamento_min: number | null;
  orcamento_max: number | null;
  forma_pagamento: string | null;
  perfil_familiar: string | null;
  urgencia_mudanca: string | null;
  exigencias_especificas: string[];
  objecoes_identificadas: string[];
  temperatura_score: number;
  temperatura_label: string;
  resumo_executivo: string;
  proximo_passo_sugerido: string;
};
```

A função é PURA e mora em módulo próprio de propósito: a régua de "o que apaga o quê" precisa de teste, e todo o resto de `repositorio.ts` vai ao banco.

- [ ] **Step 1: Escrever os testes**

Criar `src/lib/whatsapp/mesclaDossie.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mesclarDossie } from "./mesclaDossie";
import type { DossieClienteIA } from "./types";

const base = (over: Partial<DossieClienteIA> = {}): DossieClienteIA =>
  ({
    id: "d1",
    leadId: "l1",
    orcamentoMin: null,
    orcamentoMax: null,
    rendaMensal: null,
    regiaoInteresse: null,
    dormitoriosMin: null,
    formaPagamento: null,
    profissao: null,
    compraEmConjunto: null,
    perfilFamiliar: null,
    urgenciaMudanca: null,
    exigenciasEspecificas: [],
    objecoesIdentificadas: [],
    temperaturaScore: 0,
    temperaturaLabel: "frio",
    resumoExecutivo: "",
    proximoPassoSugerido: "",
    createdAt: null,
    updatedAt: null,
    ...over,
  }) as unknown as DossieClienteIA;

describe("mesclarDossie", () => {
  /*
   * O defeito, medido em 10/09/2026: `salvarDossie` fazia upsert com TODAS as
   * colunas, e a extração só enxerga a janela de histórico. Quando o assunto
   * saía da janela, o campo voltava null e o upsert apagava o que o cliente
   * já tinha dito. Estado do banco: 16 dossiês para 131 leads, com orçamento
   * 0/16 e forma de pagamento 0/16.
   */
  it("null NÃO apaga o que o cliente já disse", () => {
    const anterior = base({ orcamentoMax: 600000, formaPagamento: "financiado" });
    const novo = base({ orcamentoMax: null, formaPagamento: null });

    const linha = mesclarDossie(anterior, novo);

    expect(linha.orcamento_max).toBe(600000);
    expect(linha.forma_pagamento).toBe("financiado");
  });

  it("valor novo SUBSTITUI o antigo — ele corrigiu o que tinha dito", () => {
    const linha = mesclarDossie(base({ orcamentoMax: 600000 }), base({ orcamentoMax: 400000 }));
    expect(linha.orcamento_max).toBe(400000);
  });

  it("sem dossiê anterior, escreve o que veio", () => {
    const linha = mesclarDossie(null, base({ orcamentoMax: 400000 }));
    expect(linha.orcamento_max).toBe(400000);
  });

  it("temperatura SEMPRE sobrescreve: é leitura do momento, não fato acumulado", () => {
    // Preservar o score antigo faria o termostato de evolucaoConversa comparar
    // com um número que já não existe.
    const linha = mesclarDossie(
      base({ temperaturaScore: 80, temperaturaLabel: "quente" }),
      base({ temperaturaScore: 30, temperaturaLabel: "frio" }),
    );
    expect(linha.temperatura_score).toBe(30);
    expect(linha.temperatura_label).toBe("frio");
  });

  it("lista vazia não apaga; lista nova substitui", () => {
    const anterior = base({ objecoesIdentificadas: ["preco"] });

    expect(
      mesclarDossie(anterior, base({ objecoesIdentificadas: [] })).objecoes_identificadas,
    ).toEqual(["preco"]);

    // Substitui, não soma: união acumularia objeção já superada, e objeção
    // morta manda a IA tratar um problema que o cliente já esqueceu.
    expect(
      mesclarDossie(anterior, base({ objecoesIdentificadas: ["prazo"] })).objecoes_identificadas,
    ).toEqual(["prazo"]);
  });

  it("texto vazio não apaga o resumo anterior", () => {
    const linha = mesclarDossie(base({ resumoExecutivo: "quer 3 dorm em Alphaville" }), base());
    expect(linha.resumo_executivo).toBe("quer 3 dorm em Alphaville");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/mesclaDossie.test.ts
```

Esperado: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/whatsapp/mesclaDossie.ts`:

```ts
import type { DossieClienteIA } from "./types";

/**
 * O que o dossiê novo pode apagar do antigo — e o que não pode.
 *
 * ## O defeito, medido em 10/09/2026
 *
 * `salvarDossie` fazia `upsert` com TODAS as colunas, e a extração só
 * enxerga a janela de histórico. Quando o assunto saía da janela, o campo
 * voltava `null` e o upsert **sobrescrevia o que o cliente já tinha dito** —
 * a memória longa se apagava sozinha. Estado do banco: 16 dossiês para 131
 * leads, com orçamento 0/16 e forma de pagamento 0/16.
 *
 * `leads` ganhou essa guarda em 24/08 (renda e orçamento).
 * `lead_observacoes_ia` nunca ganhou, e é justamente ela que deveria
 * sobreviver à janela.
 *
 * ## As duas exceções, deliberadas
 *
 * - **Temperatura sempre sobrescreve.** Score e rótulo são leitura do
 *   MOMENTO, não fato acumulado: preservar o score antigo faria o termostato
 *   de `evolucaoConversa` comparar com um número que já não existe.
 * - **Lista vazia não apaga; lista não-vazia SUBSTITUI.** União acumularia
 *   objeção já superada, e objeção morta no dossiê manda a IA tratar um
 *   problema que o cliente já esqueceu.
 *
 * É função pura e mora sozinha porque a régua de "o que apaga o quê" precisa
 * de teste, e todo o resto de `repositorio.ts` vai ao banco.
 */

export type LinhaDossie = {
  orcamento_min: number | null;
  orcamento_max: number | null;
  forma_pagamento: string | null;
  perfil_familiar: string | null;
  urgencia_mudanca: string | null;
  exigencias_especificas: string[];
  objecoes_identificadas: string[];
  temperatura_score: number;
  temperatura_label: string;
  resumo_executivo: string;
  proximo_passo_sugerido: string;
};

/** O valor novo só vale se ele existe; senão, fica o que já estava lá. */
function preservando<T>(novo: T | null | undefined, anterior: T | null | undefined): T | null {
  return novo !== null && novo !== undefined ? novo : (anterior ?? null);
}

function texto(novo: string | null | undefined, anterior: string | null | undefined): string {
  return novo?.trim() ? novo : (anterior ?? "");
}

function lista(novo: string[] | null | undefined, anterior: string[] | null | undefined): string[] {
  return novo && novo.length > 0 ? novo : (anterior ?? []);
}

export function mesclarDossie(
  anterior: DossieClienteIA | null,
  novo: DossieClienteIA,
): LinhaDossie {
  return {
    orcamento_min: preservando(novo.orcamentoMin, anterior?.orcamentoMin),
    orcamento_max: preservando(novo.orcamentoMax, anterior?.orcamentoMax),
    forma_pagamento: preservando(novo.formaPagamento, anterior?.formaPagamento),
    perfil_familiar: preservando(novo.perfilFamiliar, anterior?.perfilFamiliar),
    urgencia_mudanca: preservando(novo.urgenciaMudanca, anterior?.urgenciaMudanca),
    exigencias_especificas: lista(novo.exigenciasEspecificas, anterior?.exigenciasEspecificas),
    objecoes_identificadas: lista(novo.objecoesIdentificadas, anterior?.objecoesIdentificadas),
    // Sempre a leitura de agora — ver o cabeçalho.
    temperatura_score: novo.temperaturaScore,
    temperatura_label: novo.temperaturaLabel,
    resumo_executivo: texto(novo.resumoExecutivo, anterior?.resumoExecutivo),
    proximo_passo_sugerido: texto(novo.proximoPassoSugerido, anterior?.proximoPassoSugerido),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/lib/whatsapp/mesclaDossie.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Ligar em `salvarDossie`**

Em `src/lib/whatsapp/repositorio.ts`, acrescentar `import { mesclarDossie } from "./mesclaDossie";` e trocar o começo de `salvarDossie` (o bloco `doLead` no fim da função continua idêntico, sem tocar):

```ts
/** Um dossiê por lead (`unique` na 0018) — cada análise ATUALIZA a anterior. */
export async function salvarDossie(leadId: string, dossie: DossieClienteIA): Promise<void> {
  const supabase = createServiceClient();

  /*
   * A leitura do dossiê atual acontece AQUI, não no chamador. O webhook já
   * tem um `dossieAnterior` em mãos, mas recebê-lo por parâmetro faria a
   * guarda depender de o chamador lembrar de passá-lo — e é exatamente o
   * esquecimento de um chamador que este projeto já pagou caro (foi o que
   * tirou `interacaoId` dos parâmetros de `gravarMensagem`).
   *
   * Custa uma consulta a mais por mensagem respondida, e ela roda DEPOIS do
   * envio, fora do que o cliente espera.
   */
  const anterior = await buscarDossieAtual(leadId);

  await supabase.from("lead_observacoes_ia").upsert(
    {
      lead_id: leadId,
      ...mesclarDossie(anterior, dossie),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lead_id" },
  );
```

- [ ] **Step 6: Rodar tudo**

```bash
npx vitest run
npx tsc --noEmit
```

Esperado: tudo passa.

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp/mesclaDossie.ts src/lib/whatsapp/mesclaDossie.test.ts src/lib/whatsapp/repositorio.ts
git commit -m "feat(ia): o dossie para de se apagar - null nao sobrescreve

16 dossies para 131 leads, com orcamento 0/16: o upsert reescrevia todas as
colunas com o que a extracao viu na janela, e o que saia da janela virava
null. leads tinha essa guarda desde 24/08; lead_observacoes_ia nao tinha.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Provar em campo e registrar

**Files:**
- Modify: `src/lib/whatsapp/aiAgent.ts` (`PROMPT_VERSAO` e a nota de versão do cabeçalho)
- Modify: `docs/MEMORIA.md`
- Modify: `vault/10-notas/o-contexto-que-a-ia-realmente-ve.md`
- Modify: `vault/10-notas/privacidade-apaga-o-que-a-ia-depois-precisa.md`

**Interfaces:**
- Consumes: tudo das tarefas 1 a 5.
- Produces: nada de código; é a prova e o registro.

- [ ] **Step 1: Rerodar a medição de campo**

Reexportar as conversas (a mesma consulta da investigação de 10/09: `conversa_id, remetente, conteudo, created_at` das conversas com 2+ falas de bot e de cliente nos últimos 45 dias) para `<scratchpad>/conversas.json` e rodar:

```bash
npx tsx scripts/traces/medirContexto.ts <scratchpad>/conversas.json <scratchpad>/catalogo.json
```

**O que este número mede e o que não mede:** `medirContexto.ts` lê o BANCO, e as falas já gravadas em branco continuam em branco — são irrecuperáveis. O que tem de subir é a linha "no prompt e aproveitáveis", por causa da janela de 40. O efeito do carimbo `atendida_em` só aparece em mensagens NOVAS, e é a consulta do Step 2.

- [ ] **Step 2: Conferir o carimbo em produção**

```sql
select count(*) filter (where atendida_em is not null) as atendidas,
       count(*) filter (where atendida_em is not null and not liberado_por_palavra_chave)
         as atendidas_e_retravadas
from whatsapp_conversas;
```

Esperado: `atendidas_e_retravadas` > 0 — são exatamente as conversas que antes perdiam o texto e agora não perdem mais. Zero significa que o backfill da Task 1 não rodou.

- [ ] **Step 3: Subir `PROMPT_VERSAO`**

Em `src/lib/whatsapp/aiAgent.ts`, trocar para `"2026.09-v36"` com o comentário na mesma linha dizendo o que mudou: o texto do prompt não mudou — mudou o que ele RECEBE (histórico de 40 falas sem a marca, e dossiê que não se apaga). É essa marca que separa o antes e o depois em `ia_interacoes`; sem ela a medição do efeito não existe. Acrescentar também a nota de versão no cabeçalho do arquivo, ao lado das outras.

- [ ] **Step 4: Registrar em `docs/MEMORIA.md` e no vault**

Nova seção na `docs/MEMORIA.md` com o antes/depois medido. Nas duas notas do vault, `updated: 2026-09-10` e a seção "candidatos de conserto (não decididos)" trocada pelo que foi feito, com a régua que fica:

> **Um campo não pode responder duas perguntas.** `liberado_por_palavra_chave`
> respondia "a IA pode falar agora?" (permissão, que vai e volta) e, de
> carona, "esta conversa é atendimento?" (fato, que nunca deixa de ser
> verdade). As duas discordam o tempo todo, e quem pagou foi o histórico.

- [ ] **Step 5: Verificação completa**

```bash
npx vitest run
npx tsc --noEmit
npx next build
```

Esperado: os três verdes.

- [ ] **Step 6: Commit**

```bash
git add docs/MEMORIA.md vault/ src/lib/whatsapp/aiAgent.ts
git commit -m "docs: o contexto da IA, antes e depois medido (v36)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
