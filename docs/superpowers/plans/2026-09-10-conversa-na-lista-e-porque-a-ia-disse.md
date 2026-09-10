# A conversa na lista, e o "por quê" da IA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** clicar no card em Pessoas abre a conversa numa gaveta sobre a lista, e cada resposta da IA passa a poder explicar por que foi dita.

**Architecture:** o chat que já existe (`ConversasClient.Chat`) é extraído para arquivo próprio e passa a ser montado em dois lugares — a tela de Conversas e uma gaveta em Pessoas. O "por quê" é uma coluna `jsonb` nova em `ia_interacoes`, escrita no mesmo insert da telemetria a partir de dados que o turno de atendimento já calcula.

**Tech Stack:** Next.js (App Router), React 19, Tailwind v4, Supabase (Postgres + Realtime + RLS), vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-conversa-na-lista-e-porque-a-ia-disse-design.md`

## Global Constraints

- **Migration nova é `0105`.** Conferido livre em todas as branches remotas (a mais alta em cada uma é `0104`). `migrations.test.ts` reprova prefixo duplicado e buraco não declarado.
- **Tabela/coluna nova nunca é escrita pelo cliente anônimo.** Conferir `information_schema.column_privileges` antes de escrever `grant`; conferir que `anon` segue sem privilégio (varredura da 0082). Conferir **nos dois sentidos** — o que fecha E o que continua funcionando (régua da 0077).
- **`types.ts` é editado à mão.** Regenerar apagaria as 34 uniões de CHECK do banco.
- **Toda guarda nova é provocada antes de entrar**, com o defeito real, e a mordida é conferida por `md5` — já houve nesta base mordida que não alterou o arquivo e fez a guarda parecer aprovada.
- **Classe de cor que não existe vira NADA em silêncio.** Antes de usar token, `grep` no `globals.css`.
- **Nó portalado do painel repete `data-rota="painel"` e `data-modulo`** na própria raiz — custom property não herda fora da árvore do DOM.
- **Nada de `git push`** ao final desta entrega (instrução do usuário).
- Comandos: `npx vitest run <arquivo>` para um teste, `npm test` para todos, `npx tsc --noEmit` para tipos, `npm run build` para o build.

---

### Task 1: extrair o chat para arquivo próprio

Mecânica pura. Nenhuma linha de lógica muda — é isso que torna o commit revisável.

**Files:**
- Create: `src/app/corretor/(painel)/conversas/Chat.tsx`
- Modify: `src/app/corretor/(painel)/conversas/ConversasClient.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `Chat` (componente), `Balao`, `ConversaResumo`, `MensagemRow`, `ConversaRow`, `Estado`, `estadoDa(conversa)`, `deRow(row)`, `deMensagemRow(row)`, `mesclar(atual, novas)`, `telefoneLegivel(e164)`, `quandoNaLista(iso)`, `rotuloDoDia(iso)`, `iniciais(conversa)` — todos exportados de `Chat.tsx`.

- [ ] **Step 1: mapear o que sai**

Rodar, e guardar a saída para conferir depois:

```bash
grep -n "^function \|^export function \|^type \|^export type \|^const hora\|^const diaCurto\|^const diaLongo\|^const ESTILO_BALAO" "src/app/corretor/(painel)/conversas/ConversasClient.tsx"
wc -l "src/app/corretor/(painel)/conversas/ConversasClient.tsx"
```

Vai para `Chat.tsx`: `Chat`, `FichaLead`, `SeletorDeMidia`, `Balao`, `ladoDo`, `audioTocavel`, `imagemVisivel`, `telefoneLegivel`, `quandoNaLista`, `rotuloDoDia`, `iniciais`, `deRow`, `deMensagemRow`, `mesclar`, `estadoDa`, os tipos `ConversaResumo`/`MensagemRow`/`ConversaRow`/`Estado`, e as constantes de formatação (`hora`, `diaCurto`, `diaLongo`, `ESTILO_BALAO`).

Fica em `ConversasClient.tsx`: só `ConversasClient` (a casca com lista, Realtime da caixa e reconcílio).

- [ ] **Step 2: criar `Chat.tsx` com o conteúdo movido**

Cabeçalho do arquivo novo:

```tsx
"use client";

/**
 * O chat de uma conversa — os balões, o teclado, a ficha do lead e a
 * avaliação 👍/👎.
 *
 * Mora em arquivo próprio porque tem DOIS donos: a tela de Conversas
 * (`ConversasClient`) e a gaveta que abre sobre a lista de Pessoas. Antes
 * ele vivia dentro do `ConversasClient`, e montá-lo em Pessoas exigiria
 * arrastar a lista, o Realtime da caixa inteira e o reconcílio junto.
 *
 * A extração foi feita SEM mudar uma linha de lógica, em commit próprio:
 * misturar mudança de comportamento com mudança de arquivo torna
 * impossível saber qual das duas quebrou.
 */
```

Mover os blocos **verbatim** (cortar e colar, sem reescrever), acrescentando `export` em: `Chat`, `Balao`, `ConversaResumo`, `MensagemRow`, `ConversaRow`, `Estado`, `estadoDa`, `deRow`, `deMensagemRow`, `mesclar`, `telefoneLegivel`, `quandoNaLista`, `rotuloDoDia`, `iniciais`.

Levar junto os imports que esses blocos usam (`cn`, as actions de `./acoes`, `assumirConversaComIA`, `ETAPA_LABEL`, `useAvisos`, hooks do React).

- [ ] **Step 3: `ConversasClient.tsx` passa a importar**

Trocar as definições removidas por:

```tsx
import {
  Chat,
  deMensagemRow,
  deRow,
  estadoDa,
  mesclar,
  quandoNaLista,
  telefoneLegivel,
  iniciais,
  type ConversaResumo,
  type ConversaRow,
  type Estado,
  type MensagemRow,
} from "./Chat";
```

`ConversasClient.tsx` reexporta `ConversaResumo`, porque `conversas/page.tsx` importa o tipo de lá:

```tsx
export type { ConversaResumo } from "./Chat";
```

- [ ] **Step 4: conferir que nada mudou de comportamento**

```bash
npx tsc --noEmit
npm test
npm run build
```

Esperado: os três verdes. Se `tsc` reclamar de símbolo faltando, é import esquecido — não é hora de "melhorar" nada.

Conferir também que a casca encolheu de verdade:

```bash
wc -l "src/app/corretor/(painel)/conversas/ConversasClient.tsx" "src/app/corretor/(painel)/conversas/Chat.tsx"
```

- [ ] **Step 5: commit**

```bash
git add "src/app/corretor/(painel)/conversas/Chat.tsx" "src/app/corretor/(painel)/conversas/ConversasClient.tsx"
git commit -m "refactor(conversas): o chat sai para arquivo próprio, sem mudar lógica"
```

---

### Task 2: a conversa travada explica em vez de repetir o placeholder

**Files:**
- Create: `src/lib/whatsapp/conversaSemTexto.ts`
- Create: `src/lib/whatsapp/conversaSemTexto.test.ts`
- Modify: `src/app/corretor/(painel)/conversas/Chat.tsx`

**Interfaces:**
- Consumes: `TEXTO_NAO_GUARDADO` de `@/lib/whatsapp/privacidadeDaConversa`; `Chat` da Task 1.
- Produces: `naoFoiGravada(conteudo: string): boolean`, `todasSemTexto(mensagens: {conteudo: string}[]): boolean`, `agruparNaoGravadas<T extends {conteudo: string}>(mensagens: T[]): (T | {tipo: "lacuna"; quantas: number})[]`.

- [ ] **Step 1: escrever o teste que falha**

`src/lib/whatsapp/conversaSemTexto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";
import { agruparNaoGravadas, naoFoiGravada, todasSemTexto } from "./conversaSemTexto";

const semTexto = (id: string) => ({ id, conteudo: TEXTO_NAO_GUARDADO });
const comTexto = (id: string, conteudo: string) => ({ id, conteudo });

describe("naoFoiGravada", () => {
  it("reconhece o marcador pela constante, nunca por literal copiado", () => {
    expect(naoFoiGravada(TEXTO_NAO_GUARDADO)).toBe(true);
    expect(naoFoiGravada("Oi, tudo bem?")).toBe(false);
  });
});

describe("todasSemTexto", () => {
  it("é verdade quando a conversa inteira é marcador", () => {
    expect(todasSemTexto([semTexto("a"), semTexto("b")])).toBe(true);
  });

  it("é falso quando UMA mensagem tem texto — aí os balões valem a pena", () => {
    expect(todasSemTexto([semTexto("a"), comTexto("b", "oi")])).toBe(false);
  });

  it("conversa vazia não é conversa travada: é conversa sem mensagem", () => {
    expect(todasSemTexto([])).toBe(false);
  });
});

describe("agruparNaoGravadas", () => {
  it("colapsa cada sequência de não gravadas numa lacuna com a contagem", () => {
    const itens = agruparNaoGravadas([
      comTexto("1", "oi"),
      semTexto("2"),
      semTexto("3"),
      semTexto("4"),
      comTexto("5", "tudo bem?"),
    ]);

    expect(itens).toEqual([
      { id: "1", conteudo: "oi" },
      { tipo: "lacuna", quantas: 3 },
      { id: "5", conteudo: "tudo bem?" },
    ]);
  });

  it("não junta sequências separadas por mensagem com texto", () => {
    const itens = agruparNaoGravadas([semTexto("1"), comTexto("2", "oi"), semTexto("3")]);
    expect(itens).toEqual([
      { tipo: "lacuna", quantas: 1 },
      { id: "2", conteudo: "oi" },
      { tipo: "lacuna", quantas: 1 },
    ]);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/conversaSemTexto.test.ts
```

Esperado: FAIL — `Failed to resolve import "./conversaSemTexto"`.

- [ ] **Step 3: implementar**

`src/lib/whatsapp/conversaSemTexto.ts`:

```ts
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";

/**
 * A conversa que nunca foi liberada guarda a linha, não o texto
 * (`privacidadeDaConversa.ts`). No Live Chat isso vira uma parede do mesmo
 * marcador repetido — e o placeholder, que existe para a linha em branco
 * não parecer defeito, repetido cinquenta vezes deixa de informar.
 *
 * Módulo PURO: quem decide o que guardar é o webhook, quem decide como
 * mostrar é a tela, e a comparação com o marcador tem de ser a mesma nos
 * dois lados. Comparar com o literal copiado é como duas cópias do mesmo
 * texto divergem no dia em que alguém melhora a frase.
 */
export function naoFoiGravada(conteudo: string): boolean {
  return conteudo === TEXTO_NAO_GUARDADO;
}

/** Nenhuma mensagem tem texto: em vez de balões, a tela explica. */
export function todasSemTexto(mensagens: { conteudo: string }[]): boolean {
  return mensagens.length > 0 && mensagens.every((m) => naoFoiGravada(m.conteudo));
}

export type Lacuna = { tipo: "lacuna"; quantas: number };

/**
 * Cada sequência de não gravadas vira UMA linha com a contagem. O que tem
 * texto continua balão — conversa mista é o caso comum de quem liberou no
 * meio, e esconder o que existe seria pior que mostrar o que falta.
 */
export function agruparNaoGravadas<T extends { conteudo: string }>(
  mensagens: T[],
): (T | Lacuna)[] {
  const saida: (T | Lacuna)[] = [];
  for (const m of mensagens) {
    if (!naoFoiGravada(m.conteudo)) {
      saida.push(m);
      continue;
    }
    const ultimo = saida.at(-1);
    if (ultimo && "tipo" in ultimo) ultimo.quantas += 1;
    else saida.push({ tipo: "lacuna", quantas: 1 });
  }
  return saida;
}
```

- [ ] **Step 4: rodar e ver passar**

```bash
npx vitest run src/lib/whatsapp/conversaSemTexto.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: usar no `Chat.tsx`**

No corpo do chat, ANTES de mapear os balões: quando `todasSemTexto(mensagens)`, no lugar da lista vai o cartão explicativo. Quando não, o `map` passa a ser sobre `agruparNaoGravadas(mensagens)`, e o item `{tipo:"lacuna"}` vira uma linha central discreta.

```tsx
{todasSemTexto(mensagens) ? (
  <div className="mx-auto my-8 max-w-sm rounded-xl bg-wa-entrada p-4 text-center shadow-[0_1px_2px_rgba(11,20,26,0.2)]">
    <p className="text-wa-texto text-fluid-sm font-medium">Esta conversa não foi guardada</p>
    <p className="text-wa-meta mt-2 text-[13px] leading-relaxed">
      O número da instância é o seu WhatsApp pessoal. Enquanto ninguém autoriza uma conversa,
      o sistema guarda que ela existe e <strong>não guarda o texto</strong>.
    </p>
    <p className="text-wa-meta mt-2 text-[13px] leading-relaxed">
      Ao liberar, a IA passa a responder e as mensagens daqui em diante ficam gravadas.
      O que já passou continua sem texto — ele nunca chegou ao banco.
    </p>
    {/* o botão que já existe no cabeçalho, repetido onde a pergunta nasce */}
  </div>
) : (
  agruparNaoGravadas(mensagens).map((item) =>
    "tipo" in item ? (
      <p key={`lacuna-${...}`} className="text-wa-meta my-2 text-center text-[12px]">
        {item.quantas} {item.quantas === 1 ? "mensagem não gravada" : "mensagens não gravadas"}
      </p>
    ) : (
      <Balao key={item.id} mensagem={item} comRabo={...} onErro={onErro} />
    ),
  )
)}
```

Chave da lacuna: usar o índice do `map` (`lacuna-${indice}`) — a lacuna não tem id próprio e a lista é reconstruída a cada render.

O `comRabo` hoje compara com a mensagem anterior da lista; ao agrupar, comparar com o item anterior **do array agrupado** (lacuna quebra a sequência, e é isso que se quer: depois de um buraco, o rabinho volta).

- [ ] **Step 6: conferir tokens de cor**

```bash
grep -n "wa-entrada\|wa-meta\|wa-texto" src/app/globals.css | head
```

Esperado: os três existem (são os tokens do WhatsApp da reforma de 04/09). Classe de cor inexistente vira NADA em silêncio.

- [ ] **Step 7: verificar**

```bash
npx tsc --noEmit
npm test
```

- [ ] **Step 8: commit**

```bash
git add src/lib/whatsapp/conversaSemTexto.ts src/lib/whatsapp/conversaSemTexto.test.ts "src/app/corretor/(painel)/conversas/Chat.tsx"
git commit -m "feat(conversas): conversa nunca liberada explica em vez de repetir o placeholder"
```

---

### Task 3: o Realtime de UMA conversa

**Files:**
- Create: `src/app/corretor/(painel)/conversas/useConversaAoVivo.ts`

**Interfaces:**
- Consumes: `deMensagemRow`, `mesclar`, `type MensagemRow`, `type MensagemConversa` (da Task 1 / de `./acoes`).
- Produces: `useConversaAoVivo({ conversaId, aoInserir, aoAtualizar })` — hook sem retorno.

- [ ] **Step 1: escrever o hook**

```ts
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { deMensagemRow, type MensagemRow } from "./Chat";
import type { MensagemConversa } from "./acoes";

/**
 * Tempo real de UMA conversa — o que a gaveta de Pessoas precisa.
 *
 * `ConversasClient` assina a caixa INTEIRA (canal `conversas-live`, sem
 * filtro: a RLS já recorta por corretor e um `in.(...)` com a carteira toda
 * estoura o parâmetro). A gaveta não tem lista nem contador de não lidas
 * para manter — assinar tudo seria pagar o preço de um recurso que ela não
 * usa.
 *
 * O nome do canal leva o id de propósito: dois canais com o MESMO nome no
 * mesmo cliente Supabase é a classe de defeito que só aparece quando
 * alguém abre as duas telas em abas irmãs, e que falha calada.
 */
export function useConversaAoVivo({
  conversaId,
  aoInserir,
  aoAtualizar,
}: {
  conversaId: string | null;
  aoInserir: (m: MensagemConversa) => void;
  aoAtualizar: (m: MensagemConversa) => void;
}) {
  useEffect(() => {
    if (!conversaId) return;
    const supabase = createClient();
    const filtro = { schema: "public", table: "whatsapp_mensagens", filter: `conversa_id=eq.${conversaId}` };
    const canal = supabase
      .channel(`conversa-live:${conversaId}`)
      .on("postgres_changes", { event: "INSERT", ...filtro }, (payload) =>
        aoInserir(deMensagemRow(payload.new as MensagemRow)),
      )
      // Ack de entrega (0051) e vínculo de telemetria chegam como UPDATE.
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (payload) =>
        aoAtualizar(deMensagemRow(payload.new as MensagemRow)),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
    // As funções vêm de `useCallback` no chamador; sem isso o canal seria
    // derrubado e reassinado a cada render.
  }, [conversaId, aoInserir, aoAtualizar]);
}
```

- [ ] **Step 2: verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: verde. (Não há teste unitário: o que este hook faz é assinar um websocket — testar mock de canal mediria o mock. O que prova que funciona é a Task 4 na tela.)

- [ ] **Step 3: commit**

```bash
git add "src/app/corretor/(painel)/conversas/useConversaAoVivo.ts"
git commit -m "feat(conversas): hook de tempo real para uma conversa só"
```

---

### Task 4: a gaveta em Pessoas

**Files:**
- Create: `src/app/corretor/(painel)/pessoas/GavetaConversa.tsx`
- Modify: `src/app/corretor/(painel)/pessoas/ListaPessoas.tsx`
- Modify: `src/app/corretor/(painel)/pessoas/page.tsx`
- Modify: `src/app/corretor/(painel)/pessoas/acoes.ts`
- Modify: `src/app/corretor/(painel)/navegacao.test.ts`

**Interfaces:**
- Consumes: `Chat`, `estadoDa`, `type ConversaResumo` (Task 1); `useConversaAoVivo` (Task 3); `lerMensagens`, `marcarConversaLida` de `conversas/acoes`.
- Produces: `GavetaConversa({ conversa, aoFechar, podeEnviar })`; `carregarConversaDaPessoa(conversaId)` em `pessoas/acoes.ts`.

- [ ] **Step 1: a action que traz a conversa**

Em `pessoas/acoes.ts` (a lista traz `conversaId`, mas não o resumo que o `Chat` exige):

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import type { ConversaResumo } from "../conversas/Chat";

/**
 * O resumo da conversa que a gaveta abre. O filtro por corretor é explícito
 * pela mesma razão da 0031: a policy foi aberta para o gestor, e sem ele o
 * `maybeSingle()` passa a receber N linhas justamente na tela dele.
 */
export async function carregarConversaDaPessoa(conversaId: string): Promise<ConversaResumo | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select(
      "id, telefone_cliente, nome_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, ultima_mensagem, ultima_interacao_em, lead_id, nao_lidas",
    )
    .eq("id", conversaId)
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    telefone: data.telefone_cliente,
    nome: data.nome_cliente,
    botAtivo: data.bot_ativo,
    liberada: data.liberado_por_palavra_chave,
    pausadoAte: data.pausado_humano_ate,
    ultimaMensagem: data.ultima_mensagem,
    ultimaInteracaoEm: data.ultima_interacao_em,
    temLead: Boolean(data.lead_id),
    naoLidas: data.nao_lidas,
  };
}
```

- [ ] **Step 2: a gaveta**

`pessoas/GavetaConversa.tsx` — portal no `<body>`, com os dois atributos na raiz:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { moduloAtivo } from "../navegacao";
import { Chat, estadoDa, mesclar, type ConversaResumo, type Estado } from "../conversas/Chat";
import { useConversaAoVivo } from "../conversas/useConversaAoVivo";
import { lerMensagens, marcarConversaLida, type MensagemConversa } from "../conversas/acoes";

/**
 * A conversa sobre a lista, sem sair dela.
 *
 * Mora em portal no `<body>` porque o cabeçalho do painel tem
 * `backdrop-filter`, e `backdrop-filter` cria containing block: um
 * `position: fixed` dentro dele fica preso ao vidro em vez da viewport —
 * a armadilha que este projeto já pisou seis vezes.
 *
 * E porque mora fora da árvore, repete `data-rota` e `data-modulo` na
 * própria raiz: custom property não herda pelo portal, e sem os dois a
 * gaveta nasce com a paleta do SITE e o acento padrão. A cor não quebra
 * nada — ela só mente, que é pior.
 */
export function GavetaConversa({
  conversa,
  podeEnviar,
  aoFechar,
}: {
  conversa: ConversaResumo;
  podeEnviar: boolean;
  aoFechar: () => void;
}) {
  const rota = usePathname();
  const [mensagens, setMensagens] = useState<MensagemConversa[] | null>(null);
  const [estado, setEstado] = useState<Estado>(estadoDa(conversa));
  const [erro, setErro] = useState<string | null>(null);

  // Carga + reconcílio de 15s: o mesmo par que a tela de Conversas usa. O
  // Realtime é o caminho principal; isto é o que traz avaliação e vínculo
  // de telemetria, e o que segura a tela se o websocket cair.
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      const novas = await lerMensagens(conversa.id);
      if (vivo) setMensagens((atual) => (atual ? mesclar(atual, novas) : novas));
    };
    void buscar();
    const t = setInterval(buscar, 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [conversa.id]);

  // Chat na tela = chat lido, como no WhatsApp.
  useEffect(() => {
    void marcarConversaLida(conversa.id);
  }, [conversa.id]);

  const aoInserir = useCallback((m: MensagemConversa) => {
    setMensagens((atual) => (atual ? mesclar(atual, [m]) : [m]));
  }, []);
  const aoAtualizar = useCallback((m: MensagemConversa) => {
    // Preserva a avaliação local: o UPDATE do banco não a carrega.
    setMensagens((atual) =>
      atual?.map((x) => (x.id === m.id ? { ...m, avaliacao: x.avaliacao } : x)) ?? atual,
    );
  }, []);
  useConversaAoVivo({ conversaId: conversa.id, aoInserir, aoAtualizar });

  // Esc fecha, e a rolagem de fundo trava — os dois copiados da
  // `GavetaLateral`, que já resolveu isso.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aoFechar]);

  return createPortal(
    <div
      data-rota="painel"
      data-modulo={moduloAtivo(rota) ?? undefined}
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${conversa.nome ?? conversa.telefone}`}
    >
      <button
        type="button"
        aria-label="Fechar conversa"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/50 md:cursor-pointer"
      />
      <section className="relative flex h-full w-full flex-col md:w-[480px]">
        {erro && <p className="bg-perigo-lavado text-perigo px-3 py-2 text-fluid-xs">{erro}</p>}
        <Chat
          conversa={conversa}
          estado={estado}
          mensagens={mensagens}
          podeEnviar={podeEnviar}
          onVoltar={aoFechar}
          onErro={setErro}
          onEstado={setEstado}
          onMesclar={(novas) => setMensagens((atual) => mesclar(atual ?? [], novas))}
          onRemover={(id) => setMensagens((atual) => atual?.filter((m) => m.id !== id) ?? atual)}
        />
      </section>
    </div>,
    document.body,
  );
}
```

Conferir antes de escrever: `moduloAtivo` é exportado de `navegacao.tsx`, e os tokens `perigo-lavado`/`perigo` existem no `globals.css`.

```bash
grep -n "export function moduloAtivo" "src/app/corretor/(painel)/navegacao.tsx"
grep -n "perigo-lavado" src/app/globals.css | head -2
```

- [ ] **Step 3: `ListaPessoas` abre a gaveta em vez de navegar**

A linha da pessoa **com conversa** deixa de ser `<Link>` e vira `<button>`; sem conversa continua `<Link>` para a ficha.

```tsx
const [aberta, setAberta] = useState<ConversaResumo | null>(null);

async function abrir(conversaId: string) {
  // A URL continua sendo a verdade: F5 reabre, e o botão voltar fecha.
  const novo = new URLSearchParams(params.toString());
  novo.set("c", conversaId);
  router.replace(`/corretor/pessoas?${novo}`, { scroll: false });
  const conversa = await carregarConversaDaPessoa(conversaId);
  if (conversa) setAberta(conversa);
}

function fechar() {
  const novo = new URLSearchParams(params.toString());
  novo.delete("c");
  router.replace(`/corretor/pessoas${novo.size ? `?${novo}` : ""}`, { scroll: false });
  setAberta(null);
}
```

`ListaPessoas` recebe duas props novas de `page.tsx`: `conversaInicial: string | null` (de `?c=`) e `podeEnviar: boolean` (o `status_conexao` da instância — o `Chat` já usa isso para habilitar o envio). Ao montar com `conversaInicial`, abre a gaveta.

O botão verde do WhatsApp na direita da linha continua exatamente como está.

- [ ] **Step 4: `page.tsx` lê `?c=` e a instância**

```tsx
const conversaInicial = primeiroValor(params.c) || null;
// ...
const { data: instancia } = await supabase
  .from("corretor_whatsapp_instancias")
  .select("status_conexao")
  .eq("corretor_id", corretor.id)
  .maybeSingle();
```

e passa os dois adiante. O `<Suspense key={busca}>` passa a ser `key={`${busca}:${conversaInicial ?? ""}`}` para o deep link reabrir depois de uma busca.

- [ ] **Step 5: guarda — a gaveta nova entra na lista dos portais**

Em `navegacao.test.ts`, no teste que cobra `data-rota`/`data-modulo` de nó portalado, acrescentar `pessoas/GavetaConversa.tsx` à lista de arquivos conferidos.

```bash
grep -n "createPortal\|data-modulo" "src/app/corretor/(painel)/navegacao.test.ts" | head
```

- [ ] **Step 6: provocar a guarda**

```bash
md5sum "src/app/corretor/(painel)/pessoas/GavetaConversa.tsx"
# remover a linha `data-modulo={moduloAtivo(rota) ?? undefined}`
md5sum "src/app/corretor/(painel)/pessoas/GavetaConversa.tsx"   # TEM de mudar
npx vitest run "src/app/corretor/(painel)/navegacao.test.ts"     # TEM de falhar
# restaurar a linha
npx vitest run "src/app/corretor/(painel)/navegacao.test.ts"     # verde de novo
```

Se os dois md5 forem iguais, a mordida não mordeu — refazer.

- [ ] **Step 7: verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```

`naoRolaDeLado.test.ts` e `naoCortaTexto.test.ts` varrem o painel inteiro e passam a cobrir a gaveta sem alteração.

- [ ] **Step 8: commit**

```bash
git add "src/app/corretor/(painel)/pessoas" "src/app/corretor/(painel)/navegacao.test.ts"
git commit -m "feat(pessoas): a conversa abre em gaveta sobre a lista, sem sair dela"
```

---

### Task 5: a coluna do contexto (0105) e a conta que a preenche

**Files:**
- Create: `supabase/migrations/0105_contexto_da_interacao.sql`
- Create: `src/lib/whatsapp/contextoDaInteracao.ts`
- Create: `src/lib/whatsapp/contextoDaInteracao.test.ts`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Consumes: `type Jogada` de `./jogada`; `type DossieClienteIA` de `./types`; `type Fala` de `./rajada`; `TEXTO_NAO_GUARDADO` via `conversaSemTexto` (Task 2).
- Produces: `type ContextoDaInteracao`, `montarContextoDaInteracao({ foco, jogada, dossie, historico, fewShot })`.

- [ ] **Step 1: conferir o número livre e o regime de grants**

```bash
ls supabase/migrations | tail -3
for b in $(git branch -r --format='%(refname:short)' | grep -v HEAD); do git ls-tree -r --name-only "$b" supabase/migrations | sed 's#.*/##' | sort | tail -1; done | sort -u | tail -3
```

Esperado: `0104` é o teto em toda parte; `0105` está livre.

- [ ] **Step 2: escrever o teste que falha**

`src/lib/whatsapp/contextoDaInteracao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";
import { montarContextoDaInteracao } from "./contextoDaInteracao";

const base = {
  foco: null,
  jogada: { tipo: "devolver_escolha" } as const,
  dossie: null,
  historico: [],
  fewShot: 0,
};

describe("montarContextoDaInteracao", () => {
  it("conta a janela por remetente — é o par que separa 'não considerou' de 'não recebeu'", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      historico: [
        { remetente: "cliente", texto: "quero em Alphaville" },
        { remetente: "bot", texto: "ótimo, pronto ou na planta?" },
        { remetente: "corretor", texto: "te ligo já" },
        { remetente: "cliente", texto: TEXTO_NAO_GUARDADO },
      ],
    });

    expect(ctx.historico).toEqual({ total: 4, doCliente: 2, doBot: 1, doCorretor: 1, emBranco: 1 });
  });

  it("guarda o foco quando existe, e null quando a IA não tinha imóvel na mão", () => {
    expect(montarContextoDaInteracao(base).foco).toBeNull();
    expect(
      montarContextoDaInteracao({ ...base, foco: { slug: "vitra-alphaville", nome: "Vitra" } }).foco,
    ).toEqual({ slug: "vitra-alphaville", nome: "Vitra" });
  });

  it("guarda a jogada inteira — o 'assunto' é o que explica a pergunta repetida", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      jogada: { tipo: "perguntar", assunto: "capacidade" },
    });
    expect(ctx.jogada).toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("do dossiê leva só o que o corretor julga, nunca o objeto inteiro", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      dossie: {
        id: "d1",
        leadId: "l1",
        orcamentoMin: null,
        orcamentoMax: 500000,
        rendaMensal: 12000,
        regiaoInteresse: "Alphaville",
        dormitoriosMin: 3,
        formaPagamento: "financiamento",
        resumoExecutivo: "texto longo que NÃO deve entrar",
        temperaturaScore: 62,
      } as never,
    });

    expect(ctx.dossie).toEqual({
      regiao: "Alphaville",
      dormitorios: 3,
      orcamentoMax: 500000,
      rendaMensal: 12000,
      formaPagamento: "financiamento",
    });
  });

  it("dossiê ausente é null, não um objeto de nulos — null diz 'não havia dossiê'", () => {
    expect(montarContextoDaInteracao(base).dossie).toBeNull();
  });
});
```

- [ ] **Step 3: rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/contextoDaInteracao.test.ts
```

Esperado: FAIL — `Failed to resolve import "./contextoDaInteracao"`.

- [ ] **Step 4: implementar**

```ts
import type { Jogada } from "./jogada";
import type { Fala } from "./rajada";
import type { DossieClienteIA } from "./types";
import { naoFoiGravada } from "./conversaSemTexto";

/**
 * Por que a IA disse aquilo — o que o corretor precisa para julgar um
 * balão.
 *
 * NÃO é o prompt. Guardar os ~35 mil caracteres por resposta seria caro,
 * ilegível no celular e — o que decide — não é o que responde a pergunta
 * dele. Ele quer a DECISÃO: qual imóvel ela estava tratando, o que o
 * planner mandou fazer, o que ela sabia do cliente, e quanto do histórico
 * chegou até ela.
 *
 * `emBranco` é o número que costuma explicar a queixa: `medirContexto.ts`
 * mediu 32% das falas do cliente gravadas em branco (conversa retravada) e
 * 44% da janela ocupada por fala do corretor. Sem esse par, "a IA não
 * considerou o que eu disse" e "a IA não RECEBEU o que você disse" são
 * indistinguíveis na tela — e as duas pedem correções opostas.
 */
export type ContextoDaInteracao = {
  foco: { slug: string; nome: string } | null;
  jogada: Jogada;
  dossie: {
    regiao: string | null;
    dormitorios: number | null;
    orcamentoMax: number | null;
    rendaMensal: number | null;
    formaPagamento: string | null;
  } | null;
  historico: {
    total: number;
    doCliente: number;
    doBot: number;
    doCorretor: number;
    emBranco: number;
  };
  fewShot: number;
};

export function montarContextoDaInteracao(params: {
  foco: { slug: string; nome: string } | null;
  jogada: Jogada;
  /** O dossiê que estava valendo NO MOMENTO da resposta, não o reextraído depois. */
  dossie: DossieClienteIA | null;
  historico: Fala[];
  fewShot: number;
}): ContextoDaInteracao {
  const { historico } = params;
  return {
    foco: params.foco,
    jogada: params.jogada,
    dossie: params.dossie
      ? {
          regiao: params.dossie.regiaoInteresse,
          dormitorios: params.dossie.dormitoriosMin,
          orcamentoMax: params.dossie.orcamentoMax,
          rendaMensal: params.dossie.rendaMensal,
          formaPagamento: params.dossie.formaPagamento,
        }
      : null,
    historico: {
      total: historico.length,
      doCliente: historico.filter((f) => f.remetente === "cliente").length,
      doBot: historico.filter((f) => f.remetente === "bot").length,
      doCorretor: historico.filter((f) => f.remetente === "corretor").length,
      emBranco: historico.filter((f) => naoFoiGravada(f.texto)).length,
    },
    fewShot: params.fewShot,
  };
}
```

Conferir o nome do campo de texto de `Fala` antes de escrever (`texto` ou `conteudo`):

```bash
grep -n "export type Fala" -A 6 src/lib/whatsapp/rajada.ts
```

- [ ] **Step 5: rodar e ver passar**

```bash
npx vitest run src/lib/whatsapp/contextoDaInteracao.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 6: a migration**

`supabase/migrations/0105_contexto_da_interacao.sql`:

```sql
-- 0105 — por que a IA disse aquilo
--
-- `ia_interacoes` guardava modelo, latência, versão do prompt e contadores
-- de anexo: tudo sobre a MECÂNICA da resposta, nada sobre a DECISÃO. Quem
-- abre o Live Chat para dar 👍/👎 julga o texto sozinho, sem saber qual
-- imóvel estava em foco, o que o planner mandou fazer, o que a IA sabia do
-- cliente nem quanto do histórico chegou até ela.
--
-- Não é o prompt. O prompt tem ~35 mil caracteres, é ilegível no celular e
-- não responde a pergunta do corretor. Aqui vai a decisão:
--   { foco, jogada, dossie, historico: {total, doCliente, doBot,
--     doCorretor, emBranco}, fewShot }
--
-- Nulo é resposta legítima e comum: playground, eval e consultor não têm
-- conversa real para descrever, e a resposta anterior a esta migration
-- nunca vai ter contexto — reconstruir com o histórico de hoje mostraria
-- uma razão que não foi a real, porque dossiê e catálogo mudaram.

alter table public.ia_interacoes
  add column if not exists contexto jsonb;

comment on column public.ia_interacoes.contexto is
  'Por que a IA respondeu isso: foco, jogada do planner, dossiê do momento e a contagem da janela de histórico. Escrito só pelo cliente de serviço. Nulo = não registrado.';
```

Sem `grant` novo: quem escreve é a service key, e o `anon` não tem privilégio nesta tabela desde a 0082. **Conferir, não supor:**

```sql
select grantee, privilege_type
  from information_schema.column_privileges
 where table_name = 'ia_interacoes' and column_name = 'contexto';
```

- [ ] **Step 7: aplicar e conferir nos dois sentidos**

Aplicar via `apply_migration` do MCP da Supabase (nunca `execute_sql` para DDL/UPDATE em produção). Depois:

```sql
-- 1) a coluna existe
select column_name, data_type from information_schema.columns
 where table_name = 'ia_interacoes' and column_name = 'contexto';
-- 2) o anon continua sem nada nesta tabela
select * from information_schema.column_privileges
 where table_name = 'ia_interacoes' and grantee = 'anon';
```

Esperado: (1) uma linha, `jsonb`; (2) zero linhas.

- [ ] **Step 8: declarar em `types.ts` à mão**

Acrescentar `contexto: Json | null` em `Row`, e `contexto?: Json | null` em `Insert` e `Update` de `ia_interacoes`. Regenerar apagaria as 34 uniões de CHECK.

- [ ] **Step 9: verificar e commitar**

```bash
npx vitest run src/lib/migrations.test.ts src/lib/whatsapp/contextoDaInteracao.test.ts
npx tsc --noEmit
git add supabase/migrations/0105_contexto_da_interacao.sql src/lib/whatsapp/contextoDaInteracao.ts src/lib/whatsapp/contextoDaInteracao.test.ts src/lib/supabase/types.ts
git commit -m "feat(ia): ia_interacoes ganha o contexto da decisão (0105)"
```

---

### Task 6: o turno devolve a jogada, e os dois caminhos gravam o contexto

**Files:**
- Modify: `src/lib/whatsapp/turnoDeAtendimento.ts`
- Modify: `src/lib/whatsapp/telemetria.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts:869`
- Modify: `src/app/api/cron/followups/route.ts:379`
- Create: `src/lib/whatsapp/contextoGravado.test.ts`

**Interfaces:**
- Consumes: `montarContextoDaInteracao`, `type ContextoDaInteracao` (Task 5).
- Produces: `TurnoDeAtendimento.jogada: Jogada` e `TurnoDeAtendimento.fewShot: number`; `InteracaoIA.contexto?: ContextoDaInteracao | null`.

- [ ] **Step 1: o turno expõe o que já calcula**

Em `TurnoDeAtendimento`:

```ts
  /**
   * A jogada que o planner escolheu para esta mensagem.
   *
   * Ela já era calculada aqui e morria aqui. Sai para que a telemetria
   * possa dizer POR QUE a IA respondeu o que respondeu — e sai daqui, não
   * de um `planejarJogada` chamado de novo lá fora: duas contas da mesma
   * decisão divergem, e essa divergência já custou uma sessão neste
   * projeto (`montarResumo`).
   */
  jogada: Jogada;
  /** Quantos exemplos de conversa real entraram no prompt. */
  fewShot: number;
```

e no `return`: `jogada, fewShot: exemplosFewShot?.length ?? 0,`.

`import type { Jogada } from "./jogada";` — o `import` de valor já existe.

- [ ] **Step 2: `InteracaoIA` aceita o contexto**

Em `telemetria.ts`:

```ts
  /**
   * Por que a IA disse isso (0105). Opcional de propósito: playground,
   * eval e consultor não têm conversa real para descrever, e forçá-los a
   * inventar um contexto encheria a coluna de ruído — a mesma regra de
   * `modelo`, que já mentiu duas vezes por não poder ser nulo.
   */
  contexto?: ContextoDaInteracao | null;
```

e no `insert`: `contexto: dados.contexto ?? null,`.

- [ ] **Step 3: o webhook grava**

Na chamada de `registrarInteracao` da linha ~869 (a que leva `id: interacaoId`), acrescentar:

```ts
      contexto: montarContextoDaInteracao({
        foco: turno.foco,
        jogada: turno.jogada,
        // `dossieAnterior` é o que a IA TINHA na mão. O `dossie` desta
        // altura do arquivo é o reextraído DEPOIS da resposta — julgar com
        // ele seria julgar com informação que ela não tinha.
        dossie: dossieAnterior,
        historico: turno.historicoAnterior,
        fewShot: turno.fewShot,
      }),
```

- [ ] **Step 4: o follow-up grava**

Na chamada da linha ~379 de `src/app/api/cron/followups/route.ts`, o mesmo bloco, com o que aquele caminho tem em mão (`turno.foco`, `turno.jogada`, `turno.historicoAnterior`, `turno.fewShot`, e o dossiê que ele carregou; se não carregar nenhum, `dossie: null`).

- [ ] **Step 5: a guarda que lê o código-fonte**

`src/lib/whatsapp/contextoGravado.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte, da família de `gravacaoDeMensagem.test.ts`.
 *
 * A regressão aqui falha CALADA: build verde, tela funcionando, cliente
 * respondido — e a coluna `contexto` eternamente nula, com o "por quê?"
 * dizendo "não registrado" para sempre. Nenhum tipo pega isso, porque o
 * campo é opcional (e precisa ser: playground e eval não têm o que
 * descrever).
 *
 * O recorte é POR FUNÇÃO, não pelo arquivo inteiro. A guarda irmã comparava
 * `lastIndexOf` de um símbolo com `indexOf` de outro e passou a reprovar
 * código correto no dia em que o arquivo ganhou um SEGUNDO caminho de
 * envio — parear a telemetria de um com o vínculo do outro.
 */
const CAMINHOS = [
  {
    arquivo: "src/app/api/webhooks/whatsapp/route.ts",
    // a chamada que carimba o id da interação é a da resposta ao cliente
    ancora: "id: interacaoId,",
  },
  {
    arquivo: "src/app/api/cron/followups/route.ts",
    ancora: "id: interacaoId,",
  },
];

function blocoDaChamada(codigo: string, ancora: string): string {
  const i = codigo.indexOf(ancora);
  expect(i, `âncora "${ancora}" não encontrada`).toBeGreaterThan(-1);
  const fim = codigo.indexOf("});", i);
  return codigo.slice(i, fim);
}

describe("o contexto da IA é gravado nos dois caminhos que respondem cliente", () => {
  for (const { arquivo, ancora } of CAMINHOS) {
    it(`${arquivo} passa contexto para registrarInteracao`, () => {
      const bloco = blocoDaChamada(readFileSync(arquivo, "utf8"), ancora);
      expect(bloco).toMatch(/contexto:\s*montarContextoDaInteracao\(/);
    });
  }

  it("o webhook usa o dossiê ANTERIOR, não o reextraído depois da resposta", () => {
    const codigo = readFileSync(CAMINHOS[0].arquivo, "utf8");
    const bloco = blocoDaChamada(codigo, CAMINHOS[0].ancora);
    expect(bloco).toMatch(/dossie:\s*dossieAnterior/);
    expect(bloco).not.toMatch(/dossie:\s*dossie\b/);
  });
});
```

- [ ] **Step 6: provocar a guarda**

```bash
md5sum src/app/api/webhooks/whatsapp/route.ts
# trocar `dossie: dossieAnterior` por `dossie: dossie` no bloco
md5sum src/app/api/webhooks/whatsapp/route.ts   # TEM de mudar
npx vitest run src/lib/whatsapp/contextoGravado.test.ts   # TEM de falhar
# restaurar; repetir removendo a linha `contexto:` inteira
```

- [ ] **Step 7: verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```

- [ ] **Step 8: commit**

```bash
git add src/lib/whatsapp/turnoDeAtendimento.ts src/lib/whatsapp/telemetria.ts src/lib/whatsapp/contextoGravado.test.ts src/app/api/webhooks/whatsapp/route.ts src/app/api/cron/followups/route.ts
git commit -m "feat(ia): webhook e follow-up gravam por que a resposta foi aquela"
```

---

### Task 7: o "por quê?" embaixo do balão

**Files:**
- Modify: `src/app/corretor/(painel)/conversas/acoes.ts` (`MensagemConversa` e `lerMensagens`)
- Modify: `src/app/corretor/(painel)/conversas/Chat.tsx` (`Balao`)
- Create: `src/app/corretor/(painel)/conversas/PorQue.tsx`

**Interfaces:**
- Consumes: `type ContextoDaInteracao` (Task 5).
- Produces: `MensagemConversa.contexto: ContextoDaInteracao | null`; `PorQue({ contexto })`.

- [ ] **Step 1: `lerMensagens` traz o contexto**

`lerMensagens` já faz uma segunda consulta em `ia_interacoes` para trazer a avaliação. Acrescentar `contexto` ao `select` e ao mapeamento, e o campo em `MensagemConversa`:

```ts
  /** Por que a IA respondeu isso (0105). Nulo em resposta anterior à coluna. */
  contexto: ContextoDaInteracao | null;
```

`deMensagemRow` (o caminho do Realtime) devolve `contexto: null` — mensagem que acaba de chegar por websocket não carrega a linha de telemetria, e é o reconcílio de 15s que a traz. Comentar isso ali, porque é exatamente o tipo de `null` que parece esquecimento.

- [ ] **Step 2: o componente**

`PorQue.tsx` — texto de gente, não nome de campo:

```tsx
const NOME_DA_JOGADA: Record<string, string> = {
  responder_dado: "responder o que ele perguntou",
  responder_honesto: "dizer que não tem esse dado",
  perguntar: "avançar o funil",
  convidar_visita: "convidar para conhecer",
  propor_horario: "oferecer horário",
  confirmar_visita: "confirmar a visita",
  agendar: "marcar o que ele pediu",
  tratar_objecao: "tratar a objeção",
  indicar_alternativa: "oferecer outra opção",
  deixar_porta_aberta: "deixar a porta aberta",
  encerrar_confirmado: "encerrar — visita já marcada",
  devolver_escolha: "devolver a escolha para ele",
};

const NOME_DO_ASSUNTO: Record<string, string> = {
  regiao: "região",
  estagio: "pronto ou na planta",
  tipologia: "dormitórios",
  capacidade: "renda / financiamento",
};
```

Mostra, nesta ordem: **imóvel em foco** (ou "nenhum — ela estava falando do catálogo"), **o que ela tentou fazer** (jogada + assunto), **o que ela sabia** (as cinco linhas do dossiê que tiverem valor; nenhuma → "nada ainda"), e **quanto ela viu**: `20 mensagens · 7 do cliente · 4 suas · 3 sem texto`.

A linha de `emBranco` só aparece quando é maior que zero, e leva a explicação em uma frase: *"3 falas do cliente não foram guardadas (conversa travada na época) — a IA não as recebeu"*. Número bom não vira linha, pela mesma régua do relatório semanal.

Contexto nulo:

```tsx
<p className="text-wa-meta text-[12px]">
  Contexto não registrado — resposta anterior a esta versão.
</p>
```

- [ ] **Step 3: ligar no `Balao`**

Um `<details>` (abre e fecha sem estado próprio) com resumo "por quê?" em 12px, discreto, abaixo da pílula de avaliação. Só quando `mensagem.remetente === "bot" && mensagem.interacaoId`.

Ao marcar 👎, abrir sozinho — é o instante em que a pergunta existe:

```tsx
const [porQueAberto, setPorQueAberto] = useState(false);
// dentro de `avaliar`, no ramo de sucesso:
if (valor === "ruim") setPorQueAberto(true);
```

- [ ] **Step 4: conferir largura no celular**

O bloco vive dentro de um balão de `max-w-[85%]`; em 320px isso é ~270px. Medir com o CSS de produção antes de dar por pronto — `naoCortaTexto.test.ts` cobre `whitespace-pre-*`, e não cobre número colado em número.

```bash
npm run build
npx vitest run "src/app/corretor/(painel)/naoCortaTexto.test.ts" "src/app/corretor/(painel)/naoRolaDeLado.test.ts"
```

- [ ] **Step 5: verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npm run paleta
```

- [ ] **Step 6: commit**

```bash
git add "src/app/corretor/(painel)/conversas"
git commit -m "feat(conversas): o balão da IA explica por que respondeu aquilo"
```

---

### Task 8: fechar a entrega

- [ ] **Step 1: a verificação inteira, na ordem da esteira**

```bash
npx tsc --noEmit
npm test
npm run build
node scripts/lintTeto.mjs
```

Todos verdes antes de qualquer afirmação de "pronto". `lintTeto` reprova acima do teto herdado (8) — se cair, BAIXAR o teto no arquivo.

- [ ] **Step 2: o vault, que é obrigatório neste projeto**

Nota atômica em `vault/10-notas/` com frontmatter completo (`title`, `tags` do vocabulário fechado em `vault/10-notas/vocabulario-de-tags.md`, `type`, `status`, `custou`, `codigo`, `summary`, `updated` com a data de hoje), linkada de pelo menos um MOC em `vault/20-mocs/`.

Assunto da nota: **o que se aprendeu**, não o que se fez — que metade do pedido já existia e o usuário não sabia (o clique já abria o chat interno), e que `ia_interacoes` media a mecânica da resposta e nunca a decisão.

- [ ] **Step 3: a MEMORIA**

Seção nova em `docs/MEMORIA.md` pela régua da casa ("teria me poupado 10+ minutos"): a extração do `Chat` e por que ela veio em commit próprio; `contexto` guardar a decisão e não o prompt; o `emBranco` como o número que separa "não considerou" de "não recebeu"; e o alerta da colisão de número da spec vizinha.

- [ ] **Step 4: commit final, SEM push**

```bash
git add docs/MEMORIA.md vault/
git commit -m "docs: o que a conversa na gaveta e o contexto da IA ensinaram"
git log --oneline -8
```

**Não rodar `git push`** — instrução explícita do usuário.

---

## Self-review

**Cobertura da spec:** §1 extração → Task 1; §1 Realtime → Task 3; §1 gaveta e URL → Task 4; §2 coluna e conta → Task 5; §2 escrita → Task 6; §2 leitura → Task 7; §3 travada → Task 2; testes da spec → Tasks 2, 4, 5, 6, 7; ordem da spec → ordem das tasks (com a travada adiantada para a Task 2, porque ela só depende da extração e é a mais barata).

**Consistência de tipos:** `ConversaResumo`, `Estado`, `MensagemConversa`, `MensagemRow` atravessam as Tasks 1, 3, 4 e 7 com o mesmo nome; `ContextoDaInteracao` nasce na Task 5 e é consumido nas 6 e 7 com a mesma forma; `montarContextoDaInteracao` tem a mesma assinatura nas Tasks 5 e 6.

**Sem placeholder:** os dois trechos com `...` (chave da lacuna e `comRabo`, na Task 2 Step 5) estão explicados em prosa logo abaixo do bloco — são posições no código existente, não decisões pendentes.
