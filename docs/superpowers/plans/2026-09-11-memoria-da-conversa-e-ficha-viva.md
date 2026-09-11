# A memória da conversa e a ficha viva — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos são caixas (`- [ ]`) para marcar.

**Goal:** a IA passa a carregar memória da conversa, a entender quando o
cliente não quer, a responder o que ele perguntou em vez de avançar o funil,
e a manter a ficha do lead preenchida.

**Architecture:** tudo que decide fica em módulo PURO e testado
(`jogada.ts`, `memoriaDaConversa.ts`, `recusaDoCliente.ts`,
`fichaDoLead.ts`); o banco e o webhook só executam. Nenhuma chamada de LLM
nova: a memória e os campos de ficha saem da MESMA extração que já roda
depois do envio.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), vitest,
TypeScript. Migrations por `apply_migration` do MCP da Supabase.

**Spec:** `docs/superpowers/specs/2026-09-11-memoria-da-conversa-e-ficha-viva-design.md`

## Global Constraints

- **O banco é PRODUÇÃO, com cliente real.** Toda migration é conferida nos
  dois sentidos com `begin; … rollback;` antes de aplicar (régua da 0077), e
  o `anon` é conferido em `information_schema.column_privileges` (0082).
- **`src/lib/supabase/types.ts` é editado À MÃO.** Regenerar destrói as 34
  uniões de CHECK.
- **Número de migration**: conferir contra `origin/*` antes de escolher. A
  última desta branch é `0108`; este plano usa **`0109`**. Se `origin` já
  tiver uma 0109, renumerar ANTES de começar — e o número aparece também no
  cabeçalho do arquivo e nos comentários.
- **Guarda provocada é guarda diferente de guarda escrita.** Toda guarda
  nova deste plano é mordida uma vez, com md5 antes/depois para provar que a
  mordida mordeu.
- **Prompt mexido = `PROMPT_VERSAO` bumpada** em `aiAgent.ts`.
- **Nada de `setState` dentro de efeito** no painel: a catraca de lint está
  em 0 e é porta, não sugestão.
- **Ao terminar:** nota atômica em `vault/10-notas/`, link de MOC, e seção
  em `docs/MEMORIA.md`.

---

## Task 1: A migration 0109

**Files:**
- Create: `supabase/migrations/0109_memoria_da_conversa_e_ficha_viva.sql`
- Modify: `src/lib/supabase/types.ts` (3 blocos: Row, Insert, Update de
  `whatsapp_conversas` e de `leads`)
- Test: `src/lib/whatsapp/migrations.test.ts` (já existe; só conferir que
  passa com o arquivo novo)

**Interfaces:**
- Produz: colunas `whatsapp_conversas.memoria`, `.memoria_atualizada_em`,
  `.memoria_do_corretor`; `leads.nao_contatar_em`, `.nao_contatar_motivo`,
  `.campos_do_corretor`; grant de update em `leads(nome, email,
  nao_contatar_em, nao_contatar_motivo, campos_do_corretor)`.

- [ ] **Passo 1: conferir o estado real do banco antes de escrever**

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name in ('whatsapp_conversas','leads')
  and column_name in ('memoria','memoria_atualizada_em','memoria_do_corretor',
                      'nao_contatar_em','nao_contatar_motivo','campos_do_corretor');
select column_name from information_schema.column_privileges
where table_schema='public' and table_name='leads' and grantee='authenticated'
  and privilege_type='UPDATE' order by column_name;
```

Esperado: zero colunas novas, e a lista de update SEM `nome` e `email`.
`list_migrations` não serve para isto (está dessincronizada desde sempre).

- [ ] **Passo 2: escrever a migration**

```sql
-- 0109 — a memória da conversa e a ficha viva (11/09/2026)
--
-- Spec: docs/superpowers/specs/2026-09-11-memoria-da-conversa-e-ficha-viva-design.md
--
-- Três assuntos, e eles andam juntos porque saem do mesmo pedido:
--   1. a conversa passa a ter MEMÓRIA — o estado da negociação em prosa,
--      que sobrevive à janela de 40 falas;
--   2. o lead passa a ter um NÃO-PERTURBE que sobrevive à etapa;
--   3. o corretor passa a poder editar nome e e-mail (hoje não consegue: o
--      update passa pela policy e afeta zero linhas, calado).

alter table public.whatsapp_conversas
  add column if not exists memoria text,
  add column if not exists memoria_atualizada_em timestamptz,
  add column if not exists memoria_do_corretor boolean not null default false;

comment on column public.whatsapp_conversas.memoria is
  'O estado da negociação em prosa curta (o que ele procura, quanto pode pagar, qual imóvel escolheu, o que já foi oferecido e RECUSADO, o que ficou combinado). Não é transcrição: para isso existe whatsapp_mensagens. Escrita pela mesma extração que já produz o dossiê, e editável pelo corretor no painel.';

comment on column public.whatsapp_conversas.memoria_do_corretor is
  'A memória atual foi escrita por uma PESSOA. A extração seguinte preserva o texto dela e só acrescenta o que for novo — correção que a próxima mensagem desfaz parece botão quebrado.';

alter table public.leads
  add column if not exists nao_contatar_em timestamptz,
  add column if not exists nao_contatar_motivo text,
  add column if not exists campos_do_corretor jsonb not null default '[]'::jsonb;

comment on column public.leads.nao_contatar_em is
  'O cliente pediu para não ser mais procurado. Separado de etapa=perdido de propósito: etapa anda e volta, e bastaria alguém arrastar o cartão para "Novo" para o número de quem pediu para sair voltar à lista de transmissão. Fato e permissão moram em campos diferentes.';

comment on column public.leads.campos_do_corretor is
  'Lista dos campos que uma PESSOA editou pelo painel. A IA não escreve por cima deles. Quem escreveu um valor é um fato diferente do valor.';

-- Grants. Em `leads` o UPDATE é coluna a coluna desde a 0007: coluna nova
-- editável pelo painel PRECISA de grant, senão a policy passa e o update
-- afeta zero linhas, em silêncio.
--
-- `nome` e `email` entram agora porque nunca tiveram: medido em 11/09, o
-- corretor não conseguia renomear um lead pelo painel — e a IA passa a
-- escrever o nome, então ele precisa poder corrigir.
grant update (nome, email, nao_contatar_em, nao_contatar_motivo, campos_do_corretor)
  on public.leads to authenticated;

-- `anon` não ganha nada. Toda tabela e coluna nova nasce com o default do
-- schema public do Supabase, e a chave anônima vai no bundle POR DESENHO.
revoke all (memoria, memoria_atualizada_em, memoria_do_corretor)
  on public.whatsapp_conversas from anon;
revoke all (nao_contatar_em, nao_contatar_motivo, campos_do_corretor)
  on public.leads from anon;
```

- [ ] **Passo 3: ensaiar nos dois sentidos, com rollback**

Rodar via `execute_sql` (é SELECT dentro de transação, não UPDATE):

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user_id de um corretor real>"}';
  select has_column_privilege('leads','nome','UPDATE') as pode_nome,
         has_column_privilege('leads','nao_contatar_em','UPDATE') as pode_nao_contatar,
         has_column_privilege('leads','telefone','UPDATE') as nao_deve_poder_telefone;
rollback;
```

Esperado: `true`, `true`, `false`. E com `set local role anon`,
`has_column_privilege('leads','nao_contatar_em','SELECT')` = `false`.

- [ ] **Passo 4: aplicar em produção**

`apply_migration` do MCP da Supabase — **nunca `execute_sql`** para DDL.
Depois, reconferir com a consulta do Passo 1: as seis colunas existem e o
grant de update lista `nome` e `email`.

- [ ] **Passo 5: declarar em `types.ts` à mão**

Nos TRÊS blocos (`Row`, `Insert`, `Update`) de `whatsapp_conversas`:

```ts
      memoria: string | null
      memoria_atualizada_em: string | null
      memoria_do_corretor: boolean
```

e de `leads`:

```ts
      nao_contatar_em: string | null
      nao_contatar_motivo: string | null
      campos_do_corretor: Json
```

Em `Insert` e `Update`, os três primeiros e os três últimos são opcionais
(`memoria?: string | null`, …).

- [ ] **Passo 6: verificar e commitar**

```bash
npx tsc --noEmit && npx vitest run src/lib/whatsapp/migrations.test.ts
git add supabase/migrations/0109_memoria_da_conversa_e_ficha_viva.sql src/lib/supabase/types.ts
git commit -m "feat(0109): memória da conversa, não-perturbe do lead e o grant que faltava"
```

---

## Task 2: O detector de recusa (módulo puro)

**Files:**
- Create: `src/lib/whatsapp/recusaDoCliente.ts`
- Test: `src/lib/whatsapp/recusaDoCliente.test.ts`

**Interfaces:**
- Consome: `normalizar` (hoje privado em `jogada.ts` — **exportar de lá**,
  nunca copiar: duas normalizações divergem no primeiro "Antônio").
- Produz: `type Recusa = { familia: "desinteresse" | "ja_resolvido" | "parada"; trecho: string }` e
  `detectarRecusa(texto: string): Recusa | null`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { detectarRecusa } from "./recusaDoCliente";

describe("detectarRecusa", () => {
  it("reconhece desinteresse dito de frente", () => {
    expect(detectarRecusa("No momento não tenho interesse. Obrigada")?.familia).toBe("desinteresse");
    expect(detectarRecusa("não quero, obrigado")?.familia).toBe("desinteresse");
    expect(detectarRecusa("não é pra mim")?.familia).toBe("desinteresse");
  });

  it("separa quem JÁ RESOLVEU — não é desinteresse, é fim de jornada", () => {
    expect(detectarRecusa("já comprei outro")?.familia).toBe("ja_resolvido");
    expect(detectarRecusa("já aluguei, valeu")?.familia).toBe("ja_resolvido");
  });

  it("pedido de parada é a família mais forte", () => {
    expect(detectarRecusa("me tira da lista")?.familia).toBe("parada");
    expect(detectarRecusa("para de mandar mensagem")?.familia).toBe("parada");
    expect(detectarRecusa("número errado")?.familia).toBe("parada");
    expect(detectarRecusa("não era eu que pedi")?.familia).toBe("parada");
  });

  /*
   * Os falsos positivos que derrubariam conversa BOA. Cada um deles é uma
   * conversa que continua, e tratá-los como recusa encerraria um
   * atendimento em andamento — o erro mais caro deste detector.
   */
  it("não confunde recusa de UMA coisa com recusa do atendimento", () => {
    expect(detectarRecusa("não quero apartamento na planta, só pronto")).toBeNull();
    expect(detectarRecusa("não quero gastar mais que 400 mil")).toBeNull();
    expect(detectarRecusa("não tenho interesse em Alphaville, prefiro Barueri")).toBeNull();
    expect(detectarRecusa("não posso sábado, pode ser domingo?")).toBeNull();
  });

  it("saída suave NÃO é recusa — ela já tem jogada própria", () => {
    expect(detectarRecusa("vou pensar e te falo")).toBeNull();
    expect(detectarRecusa("vou ver com minha esposa")).toBeNull();
  });

  it("a fala vazia e o marcador de mensagem não gravada não decidem nada", () => {
    expect(detectarRecusa("")).toBeNull();
    expect(detectarRecusa("[mensagem não gravada — conversa sem atendimento liberado]")).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/lib/whatsapp/recusaDoCliente.test.ts
```

Esperado: FAIL, "Cannot find module './recusaDoCliente'".

- [ ] **Passo 3: escrever o módulo**

```ts
import { normalizar } from "./jogada";

/**
 * O cliente disse que NÃO quer — e as três formas disso não se tratam igual.
 *
 * Até 11/09/2026 o planner não enxergava nenhuma delas: "não tenho
 * interesse" era fala não classificada, e fala não classificada cai na
 * pergunta de funil. Medido em produção — 01/09, 13:25: a cliente escreveu
 * "No momento não tenho interesse. Obrigada" e recebeu "Me conta, em qual
 * região de Barueri você procura?".
 *
 * ## O erro é assimétrico, e é isso que desenha o detector
 *
 * Não achar uma recusa custa uma mensagem inconveniente. Achar uma recusa
 * que não houve ENCERRA um atendimento em andamento e silencia a IA — e
 * quem reabre é o corretor, que pode não perceber por dias. Por isso o
 * detector exige que a negação seja do ATENDIMENTO, não de um detalhe: "não
 * quero na planta" e "não tenho interesse em Alphaville" continuam sendo
 * conversa.
 */
export type FamiliaDeRecusa = "desinteresse" | "ja_resolvido" | "parada";

export type Recusa = { familia: FamiliaDeRecusa; trecho: string };

/**
 * Pedido de parada. É a família mais forte e a única que pula a tentativa:
 * insistir com quem pediu para sair é o caminho curto para a denúncia, que
 * é o sinal mais forte que existe contra o número.
 */
const PARADA =
  /\b(me tira da lista|tira meu numero|nao quero mais receber|para de (mandar|enviar)|pare de (mandar|enviar)|nao me mand|para com isso|descadastr|sair da lista|numero errado|pessoa errada|nao era eu|nao sou eu)\b/;

/** Fim de jornada: ele resolveu, e não há o que reofertar. */
const JA_RESOLVIDO =
  /\b(ja (comprei|aluguei|fechei|resolvi|escolhi|consegui)|comprei outro|fechei com outr|ja estou morando|ja tenho (imovel|apartamento|casa))\b/;

/** Desinteresse no ATENDIMENTO. */
const DESINTERESSE =
  /\b(nao tenho interesse|sem interesse|nao me interessa|nao quero nada|nao quero obrigad|nao quero mais|nao e pra mim|nao vou querer|desisti|nao pretendo (comprar|mudar)|nao estou (procurando|buscando))\b/;

/**
 * O que transforma "não" em "não do atendimento".
 *
 * Uma negação seguida de COMPLEMENTO é preferência, não recusa: "não quero
 * na planta", "não tenho interesse em Alphaville", "não quero gastar mais
 * que 400 mil". O complemento vem logo depois, então basta olhar o resto da
 * frase a partir do casamento.
 */
const COMPLEMENTO_QUE_DESARMA =
  /\b(na planta|pronto|em obra|construcao|alphaville|barueri|osasco|aldeia|centro|bairro|regiao|dormitorio|quarto|suite|vaga|metro|m2|mil|reais|sabado|domingo|segunda|terca|quarta|quinta|sexta|manha|tarde|noite|hoje|amanha|agora|nesse|nesta|neste|esse imovel|esta opcao)\b/;

export function detectarRecusa(texto: string): Recusa | null {
  const t = normalizar(texto);
  if (!t || t.startsWith("[mensagem")) return null;

  for (const [familia, regex] of [
    ["parada", PARADA],
    ["ja_resolvido", JA_RESOLVIDO],
    ["desinteresse", DESINTERESSE],
  ] as const) {
    const m = t.match(regex);
    if (!m) continue;

    /*
     * O pedido de PARADA não se desarma por complemento: "para de mandar
     * mensagem sobre Alphaville" continua sendo um pedido de parada.
     */
    if (familia !== "parada") {
      const depois = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
      if (COMPLEMENTO_QUE_DESARMA.test(depois)) return null;
    }
    return { familia, trecho: m[0] };
  }
  return null;
}
```

- [ ] **Passo 4: rodar até passar**

```bash
npx vitest run src/lib/whatsapp/recusaDoCliente.test.ts
```
Esperado: PASS. Se algum falso positivo passar, o conserto é o
`COMPLEMENTO_QUE_DESARMA`, nunca afrouxar o caso do teste.

- [ ] **Passo 5: exportar `normalizar` de `jogada.ts`**

Trocar `function normalizar(` por `export function normalizar(` em
`src/lib/whatsapp/jogada.ts`, com o comentário de uma linha dizendo por quê
("uma normalização só: duas divergem no primeiro 'Antônio'").

- [ ] **Passo 6: commitar**

```bash
npx tsc --noEmit && npx vitest run src/lib/whatsapp/
git add src/lib/whatsapp/recusaDoCliente.ts src/lib/whatsapp/recusaDoCliente.test.ts src/lib/whatsapp/jogada.ts
git commit -m "feat(ia): o detector de recusa, com o erro assimétrico escrito na régua"
```

---

## Task 3: As jogadas de recusa no planner

**Files:**
- Modify: `src/lib/whatsapp/jogada.ts` (tipo `Jogada`, `EstadoDaConversa`,
  `estadoDaConversa`, `planejarJogada`, `blocoDaJogada`)
- Test: `src/lib/whatsapp/jogada.test.ts`

**Interfaces:**
- Consome: `detectarRecusa` da Task 2.
- Produz: `{ tipo: "acolher_recusa"; familia: FamiliaDeRecusa; oQueEleDisse: string }`
  e `{ tipo: "encerrar_recusado"; familia: FamiliaDeRecusa }` no tipo `Jogada`;
  campos `recusa: Recusa | null` e `recusasAnteriores: number` em
  `EstadoDaConversa`.

- [ ] **Passo 1: o teste que falha**

```ts
it("recusa explícita NUNCA cai no funil", () => {
  const estado = estadoDaConversa({
    historico: [
      { remetente: "bot", texto: "Oi! Temos apartamentos em Barueri." },
    ],
    mensagemAtual: "No momento não tenho interesse. Obrigada",
    imovelEmFoco: null,
    catalogo: [],
  });
  const jogada = planejarJogada(estado);
  expect(jogada.tipo).toBe("acolher_recusa");
  if (jogada.tipo === "acolher_recusa") expect(jogada.familia).toBe("desinteresse");
});

it("pedido de parada encerra na hora, sem tentativa", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Quer conhecer o decorado?" }],
    mensagemAtual: "me tira da lista",
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("encerrar_recusado");
});

it("a SEGUNDA recusa encerra", () => {
  const estado = estadoDaConversa({
    historico: [
      { remetente: "cliente", texto: "não tenho interesse" },
      { remetente: "bot", texto: "Entendi! Só pra eu saber: foi preço ou região?" },
    ],
    mensagemAtual: "já falei que não quero",
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("encerrar_recusado");
});

it("a recusa ganha até do aceite de horário — quem disse não, disse não", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Tenho sábado às 10h ou domingo às 11h." }],
    mensagemAtual: "não tenho interesse, pode parar",
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("encerrar_recusado");
});
```

- [ ] **Passo 2: rodar e ver falhar** (`npx vitest run src/lib/whatsapp/jogada.test.ts`) — esperado: recebe `perguntar`.

- [ ] **Passo 3: acrescentar ao tipo `Jogada`**

```ts
  | { tipo: "acolher_recusa"; familia: FamiliaDeRecusa; oQueEleDisse: string }
  | { tipo: "encerrar_recusado"; familia: FamiliaDeRecusa }
```

- [ ] **Passo 4: estado**

Em `EstadoDaConversa`:

```ts
  /** O cliente está dizendo que não quer — e de qual das três formas. */
  recusa: Recusa | null;
  /** Quantas vezes ele já recusou ANTES desta fala. */
  recusasAnteriores: number;
```

Em `estadoDaConversa`, depois de `falasCliente`:

```ts
  const recusa = detectarRecusa(mensagemAtual);
  const recusasAnteriores = falasCliente.filter((f) => detectarRecusa(f) !== null).length;
```

- [ ] **Passo 5: a prioridade em `planejarJogada`**

A recusa entra **antes de tudo**, inclusive do aceite de horário. O
comentário tem de dizer por quê:

```ts
  /*
   * A recusa vem PRIMEIRO, antes até do aceite de horário.
   *
   * Quem escreve "não tenho interesse" depois de a IA oferecer horário está
   * recusando, não aceitando — e `ACEITE` casaria em "pode parar". Ordem
   * errada aqui marca visita para quem acabou de pedir para ser deixado em
   * paz, que é o pior desfecho possível desta conversa.
   */
  if (estado.recusa) {
    const encerra =
      estado.recusa.familia === "parada" ||
      estado.recusa.familia === "ja_resolvido" ||
      estado.recusasAnteriores >= 1;
    return encerra
      ? { tipo: "encerrar_recusado", familia: estado.recusa.familia }
      : { tipo: "acolher_recusa", familia: estado.recusa.familia, oQueEleDisse: estado.oQueEleDisse };
  }
```

**Nota:** `ja_resolvido` encerra na primeira porque não há motivo a
perguntar — ele já comprou. O `acolher_recusa` sobra só para
`desinteresse`, que é onde a pergunta do motivo vale.

- [ ] **Passo 6: os blocos de prompt em `blocoDaJogada`**

```ts
    case "acolher_recusa":
      return [
        "O CLIENTE DISSE QUE NÃO TEM INTERESSE.",
        "Acolha em UMA frase curta, sem insistir e sem oferecer nada.",
        "Depois faça UMA pergunta só, leve, para entender o motivo:",
        "foi o preço, a região, ou ele já resolveu de outro jeito?",
        "NÃO ofereça visita, NÃO mande foto, NÃO pergunte nada do funil.",
      ].join(" ");

    case "encerrar_recusado":
      return jogada.familia === "parada"
        ? [
            "O CLIENTE PEDIU PARA NÃO RECEBER MAIS MENSAGENS.",
            "Responda UMA frase: confirme que ele não será mais procurado e agradeça.",
            "Nenhuma pergunta, nenhuma oferta, nenhum convite. Nunca peça o motivo.",
          ].join(" ")
        : [
            "O CLIENTE CONFIRMOU QUE NÃO QUER SEGUIR.",
            "Despeça-se em UMA frase, agradecendo e deixando a porta aberta",
            "para quando ele quiser voltar. Nenhuma pergunta, nenhuma oferta.",
          ].join(" ");
```

- [ ] **Passo 7: rodar e ver passar**

```bash
npx vitest run src/lib/whatsapp/jogada.test.ts
```

- [ ] **Passo 8: o trace determinístico do perfil que faltava**

Criar `scripts/traces/traceRecusa.ts`, no molde dos quatro que já existem
(`traceInteressado.ts` é o mais recente). Ele roda a sequência de jogadas
para três roteiros — desinteresse, já resolvido, pedido de parada — e
IMPRIME o par (fala, jogada) turno a turno, **sem uma chamada de LLM**.

```bash
npx tsx --conditions=react-server scripts/traces/traceRecusa.ts
```

Esperado, e é este o critério: nenhuma linha com `perguntar:*` depois da
primeira recusa.

- [ ] **Passo 9: commitar**

```bash
npx tsc --noEmit && npx vitest run src/lib/whatsapp/
git add src/lib/whatsapp/jogada.ts src/lib/whatsapp/jogada.test.ts scripts/traces/traceRecusa.ts
git commit -m "feat(ia): a recusa vira jogada, e ganha do aceite de horário"
```

---

## Task 4: Responder o cliente em vez de avançar o funil

**Files:**
- Modify: `src/lib/whatsapp/jogada.ts`
- Test: `src/lib/whatsapp/jogada.test.ts`

**Interfaces:**
- Produz: `{ tipo: "responder_pergunta_aberta"; oQueEleDisse: string }`.

- [ ] **Passo 1: o teste que falha**

```ts
it("pergunta que o planner não classifica NÃO vira pergunta de funil", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Temos ótimas opções em Barueri." }],
    mensagemAtual: "o condomínio aceita cachorro de porte grande?",
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("responder_pergunta_aberta");
});

it("afirmação sem pergunta continua deixando o funil andar", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Oi!" }],
    mensagemAtual: "bom dia",
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("perguntar");
});
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: o detector de "é pergunta"**

Em `jogada.ts`, e a régua NÃO pode depender da ordem das palavras — a lição
de "fica onde" × "onde fica", que já custou uma conversa:

```ts
/**
 * A fala do cliente é uma PERGUNTA?
 *
 * Não basta terminar em "?": muita gente não digita interrogação no
 * WhatsApp. E não pode depender da ORDEM das palavras — "onde fica" e "fica
 * onde" são a mesma pergunta, e foi exatamente isso que fez a IA ignorar um
 * cliente em 10/09.
 */
const INTERROGATIVO =
  /\b(qual|quais|quanto|quantos|quantas|como|onde|quando|porque|por que|pq|tem|teria|da pra|dá pra|pode|poderia|aceita|posso|sera|será)\b/;
const PEDIDO = /\b(me (manda|envia|passa|diz)|queria saber|gostaria de saber|preciso saber)\b/;

export function ehPergunta(texto: string): boolean {
  const t = normalizar(texto);
  return t.includes("?") || INTERROGATIVO.test(t) || PEDIDO.test(t);
}
```

**Cuidado registrado:** `normalizar` pode tirar a pontuação. Se tirar,
testar o `?` no texto CRU antes de normalizar — e o teste do Passo 1 pega
isso.

- [ ] **Passo 4: usar no planner, no lugar certo**

Logo **antes** do bloco do funil (`perguntar`), nunca antes de
`responder_dado` ou `confirmar_visita` — a pergunta específica que o planner
JÁ sabe responder continua tendo caminho próprio:

```ts
  /*
   * Chegou aqui = o planner não soube classificar a fala. Se ela é uma
   * PERGUNTA, responder é o certo; avançar o funil é trocar de assunto na
   * cara de quem perguntou — a queixa "muda de assunto sozinha" (11/09).
   */
  if (ehPergunta(estado.oQueEleDisse)) {
    return { tipo: "responder_pergunta_aberta", oQueEleDisse: estado.oQueEleDisse };
  }
```

E o bloco:

```ts
    case "responder_pergunta_aberta":
      return [
        "RESPONDA A PERGUNTA QUE ELE ACABOU DE FAZER, e só ela.",
        "Se você não tem o dado, diga que não tem e que vai confirmar —",
        "nunca invente, nunca troque de assunto, nunca devolva com outra pergunta do funil.",
        "Só depois de responder, se couber, dê UM passo adiante.",
      ].join(" ");
```

- [ ] **Passo 5: rodar até passar, e rodar os traces antigos**

```bash
npx vitest run src/lib/whatsapp/jogada.test.ts
npx tsx --conditions=react-server scripts/traces/traceInteressado.ts
npx tsx --conditions=react-server scripts/traces/traceRecusa.ts
```

Os traces antigos são a rede: se o funil parou de andar em conversa boa, é
aqui que aparece — de graça, em um segundo.

- [ ] **Passo 6: commitar**

```bash
git add src/lib/whatsapp/jogada.ts src/lib/whatsapp/jogada.test.ts
git commit -m "feat(ia): quando não entende, responde o cliente — não o funil"
```

---

## Task 5: A retomada depois de 72 horas

**Files:**
- Modify: `src/lib/whatsapp/jogada.ts`
- Test: `src/lib/whatsapp/jogada.test.ts`

**Interfaces:**
- Consome: `horasDesdeAUltimaFala?: number` novo em `estadoDaConversa`
  (o chamador calcula — este módulo não toca no relógio nem no banco).
- Produz: `{ tipo: "retomar"; horas: number }`.

- [ ] **Passo 1: o teste**

```ts
it("acima de 72h, confirma se ainda vale antes de seguir", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Te mando a planta hoje." }],
    mensagemAtual: "oi",
    horasDesdeAUltimaFala: 96,
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).toBe("retomar");
});

it("abaixo de 72h a conversa segue como sempre", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Te mando a planta hoje." }],
    mensagemAtual: "oi",
    horasDesdeAUltimaFala: 20,
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).not.toBe("retomar");
});

it("mas pergunta em aberto ganha da retomada — ele voltou PERGUNTANDO", () => {
  const estado = estadoDaConversa({
    historico: [{ remetente: "bot", texto: "Te mando a planta hoje." }],
    mensagemAtual: "conseguiu ver a planta do 3 dorm?",
    horasDesdeAUltimaFala: 96,
    imovelEmFoco: null,
    catalogo: [],
  });
  expect(planejarJogada(estado).tipo).not.toBe("retomar");
});
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: implementar**

`HORAS_PARA_RETOMAR = 72`, campo `horasDesdeAUltimaFala` no estado, e no
planner **depois** da recusa e de `responder_dado`/`confirmar_visita`, e
**antes** do funil:

```ts
    case "retomar":
      return [
        `O CLIENTE SUMIU POR ${Math.round(jogada.horas / 24)} DIAS E VOLTOU AGORA.`,
        "Cumprimente rápido, diga em meia frase de onde vocês pararam",
        "(use a MEMÓRIA DA CONVERSA, nunca invente) e faça UMA pergunta só:",
        "se ele ainda está procurando. Nada de recomeçar a qualificação.",
      ].join(" ");
```

- [ ] **Passo 4: rodar até passar. Passo 5: commitar.**

```bash
git commit -m "feat(ia): quem some por três dias volta sendo perguntado se ainda vale"
```

---

## Task 6: A memória da conversa (módulo puro)

**Files:**
- Create: `src/lib/whatsapp/memoriaDaConversa.ts`
- Test: `src/lib/whatsapp/memoriaDaConversa.test.ts`

**Interfaces:**
- Produz:
  `TETO_DA_MEMORIA = 1200`,
  `mesclarMemoria(anterior: { texto: string | null; doCorretor: boolean }, nova: string | null): string | null`,
  `blocoDaMemoria(texto: string | null): string`.

- [ ] **Passo 1: o teste**

```ts
import { describe, expect, it } from "vitest";
import { blocoDaMemoria, mesclarMemoria, TETO_DA_MEMORIA } from "./memoriaDaConversa";

describe("mesclarMemoria", () => {
  it("sem memória anterior, a nova vale", () => {
    expect(mesclarMemoria({ texto: null, doCorretor: false }, "Procura 2 dorm em Barueri.")).toBe(
      "Procura 2 dorm em Barueri.",
    );
  });

  it("extração vazia NÃO apaga o que já se sabia", () => {
    expect(mesclarMemoria({ texto: "Procura 2 dorm.", doCorretor: false }, null)).toBe("Procura 2 dorm.");
    expect(mesclarMemoria({ texto: "Procura 2 dorm.", doCorretor: false }, "   ")).toBe("Procura 2 dorm.");
  });

  /*
   * O texto do corretor é o único que a IA não reescreve. Correção que a
   * próxima mensagem desfaz parece botão quebrado — e é assim que alguém
   * para de corrigir.
   */
  it("o texto do corretor sobrevive: a IA só ACRESCENTA", () => {
    const final = mesclarMemoria(
      { texto: "Cliente é irmão do síndico. Não falar de preço.", doCorretor: true },
      "Procura 3 dorm em Alphaville.",
    );
    expect(final).toContain("Cliente é irmão do síndico. Não falar de preço.");
    expect(final).toContain("Procura 3 dorm em Alphaville.");
  });

  it("não duplica o que o corretor já tinha escrito", () => {
    const final = mesclarMemoria(
      { texto: "Procura 3 dorm.", doCorretor: true },
      "Procura 3 dorm.",
    );
    expect(final).toBe("Procura 3 dorm.");
  });

  it("corta no teto, e corta em fronteira de frase", () => {
    const longa = "Frase de exemplo com algum tamanho. ".repeat(100);
    const final = mesclarMemoria({ texto: null, doCorretor: false }, longa)!;
    expect(final.length).toBeLessThanOrEqual(TETO_DA_MEMORIA);
    expect(final.endsWith(".")).toBe(true);
  });
});

describe("blocoDaMemoria", () => {
  it("sem memória, não ocupa lugar nenhum no prompt", () => {
    expect(blocoDaMemoria(null)).toBe("");
    expect(blocoDaMemoria("  ")).toBe("");
  });

  it("com memória, ela vem rotulada como o que já se sabe", () => {
    const bloco = blocoDaMemoria("Procura 2 dorm.");
    expect(bloco).toContain("Procura 2 dorm.");
    expect(bloco.toUpperCase()).toContain("MEMÓRIA");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar. Passo 3: implementar.**

O corte no teto é por FRASE: cortar no meio de uma frase produz memória que
termina em "o cliente prefere o" e o modelo completa sozinho — é a família
do acabamento inventado.

- [ ] **Passo 4: rodar até passar. Passo 5: commitar.**

```bash
git commit -m "feat(ia): a memória da conversa, com o texto do corretor intocável"
```

---

## Task 7: A extração passa a devolver memória e ficha

**Files:**
- Modify: `src/lib/whatsapp/dossierExtractor.ts` (o `PROMPT_DOSSIE` e o
  retorno), `src/lib/whatsapp/types.ts` (`DossieClienteIA`)
- Test: `src/lib/whatsapp/dossierExtractor.test.ts` (criar)

**Interfaces:**
- Produz, em `DossieClienteIA`: `memoria: string | null`,
  `nomeCliente: string | null`, `email: string | null`.
- Consome: `extrairDossieCliente(conversaTexto, leadId, memoriaAnterior?: string | null)`.

- [ ] **Passo 1: o teste (sem LLM — só o parse e as réguas)**

Testar `normalizarSaidaDoDossie`, uma função pura NOVA que recebe o JSON
cru e devolve o `DossieClienteIA`. Hoje esse parse está inline dentro de
`extrairDossieCliente` e por isso não tem teste; extrair é pré-requisito.

```ts
it("o nome só entra quando o cliente se APRESENTA", () => {
  expect(normalizarSaidaDoDossie({ nomeCliente: "João" }, "lead-1").nomeCliente).toBe("João");
  // O modelo devolve null quando não houve apresentação; a régua de
  // "vou ver com o João" mora no PROMPT e é conferida no Passo 4.
});

it("e-mail tem de parecer e-mail", () => {
  expect(normalizarSaidaDoDossie({ email: "nao informado" }, "l").email).toBeNull();
  expect(normalizarSaidaDoDossie({ email: "ana@exemplo.com" }, "l").email).toBe("ana@exemplo.com");
});

it("a memória respeita o teto", () => {
  const gigante = "x".repeat(5000);
  expect(normalizarSaidaDoDossie({ memoria: gigante }, "l").memoria!.length).toBeLessThanOrEqual(1200);
});
```

- [ ] **Passo 2: rodar e ver falhar.**

- [ ] **Passo 3: extrair o parse para `normalizarSaidaDoDossie` (sem mudar
      comportamento) e rodar a suíte inteira** — este passo é refactor puro,
      e a suíte existente é o que prova que nada mudou.

- [ ] **Passo 4: acrescentar os três campos ao prompt**

```
  "memoria": "Até 1000 caracteres, em prosa corrida, com o ESTADO DA NEGOCIAÇÃO: o que ele procura, quanto pode pagar, qual imóvel escolheu, o que já foi oferecido e ele RECUSOU, o que ficou combinado, e o que ele pediu e ainda não recebeu. Não transcreva falas. Não invente nada que não esteja na conversa.",
  "nomeCliente": string ou null (SÓ quando o cliente se APRESENTA: "meu nome é", "sou o/a", "aqui é o/a", ou assinatura no fim da mensagem. NUNCA um nome citado no meio da frase: "vou ver com o João" não é o nome dele),
  "email": string ou null (só se ele escrever o e-mail dele),
```

E, quando houver memória anterior, ela entra no prompt ANTES da
transcrição, com a instrução de atualizá-la em vez de recomeçar.

- [ ] **Passo 5: rodar até passar; conferir que a suíte inteira segue verde.**

- [ ] **Passo 6: commitar**

```bash
git commit -m "feat(ia): a extração passa a devolver memória, nome e e-mail"
```

---

## Task 8: Gravar a memória e a ficha

**Files:**
- Modify: `src/lib/whatsapp/repositorio.ts` (`salvarDossie`, `SELECT_CONVERSA`,
  `mapConversa`), `src/lib/whatsapp/fichaDoLead.ts` (criar)
- Test: `src/lib/whatsapp/fichaDoLead.test.ts` (criar)

**Interfaces:**
- Produz: `camposDaFicha(dossie: DossieClienteIA, camposDoCorretor: readonly string[], nomeAtual: string): Record<string, unknown>`
  — puro, testável, é ele que aplica as três regras de escrita. `nomeAtual` é
  obrigatório porque a régua do nome depende dele: só sobrescreve o
  provisório (`WhatsApp NNNN`, "Contato sem nome").
- Produz: `salvarMemoriaDaConversa(conversaId, texto, porCorretor: boolean)`.
- `ConversaWhatsapp` ganha `memoria: string | null` e `memoriaDoCorretor: boolean`.

- [ ] **Passo 1: o teste de `camposDaFicha`**

```ts
it("não escreve por cima do que o corretor editou", () => {
  const campos = camposDaFicha({ ...dossieVazio, rendaMensal: 9000 }, ["renda_mensal"]);
  expect(campos.renda_mensal).toBeUndefined();
});

it("campo sem valor não é escrito — null não apaga", () => {
  expect(camposDaFicha({ ...dossieVazio, rendaMensal: null }, [])).toEqual({});
});

it("o nome só sobrescreve o provisório", () => {
  expect(camposDaFicha({ ...dossieVazio, nomeCliente: "Ana" }, [], "WhatsApp 2461").nome).toBe("Ana");
  expect(camposDaFicha({ ...dossieVazio, nomeCliente: "Ana" }, [], "Ana Paula Souza").nome).toBeUndefined();
});
```

- [ ] **Passo 2: falhar, implementar, passar.**

- [ ] **Passo 3: ligar em `salvarDossie`** — trocar o objeto `doLead` montado
      à mão pelo `camposDaFicha`, lendo `campos_do_corretor` da mesma
      consulta que já busca a linha anterior.

- [ ] **Passo 4: a guarda de código-fonte**

Em `src/lib/whatsapp/contextoGravado.test.ts` (que já lê o webhook), ou em
arquivo novo: `salvarDossie` **não** monta o update de `leads` à mão. A
regressão aqui é calada — alguém acrescenta um campo, esquece a regra do
corretor, e a primeira correção manual é desfeita na mensagem seguinte.

- [ ] **Passo 5: provocar a guarda** (md5 antes/depois), **rodar tudo,
      commitar.**

---

## Task 9: A memória no prompt

**Files:**
- Modify: `src/lib/whatsapp/turnoDeAtendimento.ts` (`PedidoDeTurno` ganha
  `memoria?: string | null`), `src/lib/whatsapp/aiAgent.ts` (o slot no
  prompt e `PROMPT_VERSAO`), `src/app/api/webhooks/whatsapp/route.ts`,
  `src/app/api/cron/followups/route.ts`
- Test: `src/lib/whatsapp/turnoDeAtendimento.test.ts`, `scripts/traces/sondaPrompt.ts`

- [ ] **Passo 1: o teste** — o prompt contém a memória, e ela aparece ANTES
      do histórico.
- [ ] **Passo 2: falhar. Passo 3: implementar.** A memória entra junto do
      bloco da jogada, no topo — **antes de todas as outras instruções**, que
      é a regra que a v32 pagou caro para aprender (bloco enterrado compete
      como os outros).
- [ ] **Passo 4: bumpar `PROMPT_VERSAO`** e rodar `sondaPrompt.ts` para
      conferir a POSIÇÃO, não só a presença.
- [ ] **Passo 5: os dois chamadores passam a memória** (webhook e
      follow-up), e o eval/playground continuam funcionando sem ela.
- [ ] **Passo 6: rodar tudo, commitar.**

---

## Task 10: A extração roda mesmo quando a IA não responde

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Create: `src/lib/whatsapp/quandoExtrair.ts` + teste

**Interfaces:**
- Produz: `devoExtrair(params: { ehAtendimento: boolean; temLead: boolean; ultimaExtracaoEm: Date | null; agora: Date }): boolean`
  com `MINUTOS_ENTRE_EXTRACOES = 10`.

- [ ] **Passo 1: o teste**

```ts
it("nunca extrai de conversa que não é atendimento", () => {
  expect(devoExtrair({ ehAtendimento: false, temLead: true, ultimaExtracaoEm: null, agora })).toBe(false);
});

it("uma rajada de cinco balões é UMA extração", () => {
  const haUmMinuto = new Date(agora.getTime() - 60_000);
  expect(devoExtrair({ ehAtendimento: true, temLead: true, ultimaExtracaoEm: haUmMinuto, agora })).toBe(false);
});

it("passados 10 minutos, extrai de novo", () => {
  const haOnzeMinutos = new Date(agora.getTime() - 11 * 60_000);
  expect(devoExtrair({ ehAtendimento: true, temLead: true, ultimaExtracaoEm: haOnzeMinutos, agora })).toBe(true);
});
```

- [ ] **Passo 2: falhar, implementar, passar.**
- [ ] **Passo 3: ligar no webhook**, no caminho que roda **mesmo quando o bot
      não responde** — e conferir de quais `return` ele passa a depender.
      Esta é a armadilha que o aviso de queda (0071) pagou: pendurar código
      novo num caminho existente o faz herdar todas as saídas antecipadas
      dele.
- [ ] **Passo 4: guarda de código-fonte** afirmando que a extração NÃO está
      dentro do ramo "o bot respondeu". Provocar.
- [ ] **Passo 5: rodar tudo, commitar.**

---

## Task 11: As consequências da recusa

**Files:**
- Modify: `src/lib/whatsapp/repositorio.ts` (`registrarRecusaDoCliente`),
  `src/app/api/webhooks/whatsapp/route.ts`,
  `src/lib/crm/publicoDaCampanha.ts` (`elegivel`),
  `src/app/api/cron/followups/route.ts`
- Test: `src/lib/crm/publicoDaCampanha.test.ts`,
  `src/lib/whatsapp/atendimentoPorIniciativa.test.ts` (já lê os caminhos de
  iniciativa — ganha o quarto)

- [ ] **Passo 1: o teste de `elegivel`**

```ts
it("quem pediu para não ser procurado NUNCA entra em campanha", () => {
  const lead = { ...leadBase, naoContatarEm: "2026-09-11T12:00:00Z", etapa: "novo" };
  for (const filtro of ["todos", "novos_sem_contato", "parados_15d", "sem_resposta", "selecionados"] as const) {
    expect(elegivel(lead, filtro), filtro).toBe(false);
  }
});

/*
 * A etapa ANDA E VOLTA. Sem o não-perturbe, bastava alguém arrastar o
 * cartão de volta para "Novo" e o número de quem pediu para sair voltava
 * para a lista de transmissão.
 */
it("e continua fora mesmo se alguém devolver a etapa para novo", () => {
  const lead = { ...leadBase, naoContatarEm: "2026-09-11T12:00:00Z", etapa: "novo" };
  expect(elegivel(lead, "todos")).toBe(false);
});
```

- [ ] **Passo 2: falhar; acrescentar `naoContatarEm` ao tipo `Lead` e ao
      `SELECT_LEAD`; implementar; passar.**
- [ ] **Passo 3: `registrarRecusaDoCliente(conversaId, leadId, familia)`** —
      uma função, os quatro efeitos, na ordem: `bot_ativo = false`,
      follow-ups pendentes → `cancelado` com motivo `cliente_recusou`,
      `leads.nao_contatar_em/motivo`, `etapa = 'perdido'`. Registra UMA linha
      em `lead_interacoes`.
- [ ] **Passo 4: o runner de follow-up passa a pular quem tem
      `nao_contatar_em`** — e tem teste.
- [ ] **Passo 5: a guarda dos caminhos de iniciativa** cobra que os TRÊS
      leiam o campo. Provocar com md5.
- [ ] **Passo 6: chamar do webhook** quando a jogada for `encerrar_recusado`.
- [ ] **Passo 7: rodar tudo, commitar.**

---

## Task 12: O painel — a memória visível e o aviso de recusa

**Files:**
- Modify: `src/app/corretor/(painel)/conversas/Chat.tsx` (o cabeçalho da
  conversa), `src/app/corretor/(painel)/conversas/acoes.ts` (a action de
  salvar), `src/lib/crm/filaDeTrabalho.ts` (o item novo),
  `src/app/corretor/(painel)/_componentes/FilaAgora.tsx`
- Test: `src/lib/crm/filaDeTrabalho.test.ts`, `src/app/corretor/naoCortaTexto.test.ts`

- [ ] **Passo 1: a memória no cabeçalho da conversa** — recolhida por
      padrão, com um toque para abrir, `whitespace-pre-line` **e**
      `break-words` (a regra de 09/09: `pre-line` não quebra dentro da
      palavra, e URL em memória estoura o balão).
- [ ] **Passo 2: editar e salvar** — a action grava com
      `memoria_do_corretor = true` e devolve `{erro}` tratado por `useAvisos`
      (com `catch` de rede: erro de conexão não devolve `{erro}`, devolve
      exceção, e sem esse ramo a tela destrava muda).
- [ ] **Passo 3: o item da fila** — "Fulano disse que não tem interesse",
      com o peso já definido em `filaDeTrabalho.ts`. O teste de ordem existe
      e precisa ser atualizado COM o motivo escrito, nunca afrouxado.
- [ ] **Passo 4: medir no navegador** com o CSS de produção em 320/360/390,
      nos dois temas — sem estouro, alvo de 44px, nada cortado.
- [ ] **Passo 5: rodar `npm run paleta` e a catraca de lint; commitar.**

---

## Task 13: `campos_do_corretor` escrito pelo painel

**Files:**
- Modify: as actions que editam campos do lead
  (`src/app/corretor/(painel)/leads/acoes.ts` e a ficha)
- Test: o teste da action

- [ ] **Passo 1: o teste** — editar a renda pelo painel acrescenta
      `"renda_mensal"` a `campos_do_corretor`, sem duplicar se já estiver lá.
- [ ] **Passo 2: falhar, implementar, passar.** A marca é escrita no MESMO
      update que grava o valor: em dois updates, uma falha no segundo deixa o
      valor sem proteção e a IA o desfaz na mensagem seguinte.
- [ ] **Passo 3: commitar.**

---

## Task 14: Medir, provar e registrar

**Files:**
- Modify: `docs/MEMORIA.md`, `vault/10-notas/` (nota nova), um MOC
- Create: `scripts/traces/medirFicha.ts` (opcional, no molde de
  `medirContexto.ts`)

- [ ] **Passo 1: os traces sem API** — `traceRecusa`, `traceInteressado`,
      `traceObjecao` e o cooperativo, todos verdes. Custo zero.
- [ ] **Passo 2: `npm run observatorio`** sobre conversa real, e guardar o
      arquivo de saída ANTES de qualquer commit seguinte (o arquivo é por
      versão+dia e SOBRESCREVE — esta armadilha já mordeu duas vezes).
- [ ] **Passo 3: os três números no banco**, com as mesmas consultas do
      diagnóstico:
  - recusa respondida com pergunta de funil (hoje ≥ 2; alvo: zero daqui para
    a frente);
  - conversas com `memoria` preenchida;
  - campos de ficha preenchidos entre os leads que conversaram (hoje: 0
    nome, 0 renda, 1 orçamento em 55).
- [ ] **Passo 4: conferir em PRODUÇÃO, não em teste** — uma conversa real
    que recebeu recusa depois do deploy tem `bot_ativo = false`,
    `nao_contatar_em` preenchido e follow-ups cancelados.
- [ ] **Passo 5: vault + MEMORIA**, com o antes/depois medido.
- [ ] **Passo 6: commitar.**

---

## Fora de escopo, declarado

- Teto para a fala do corretor na janela — decisão do usuário, mantida.
- Backfill de ficha/memória a partir das conversas antigas: 90 conversas =
  90 chamadas pagas escrevendo em ficha que ninguém revisou. Se valer a
  pena, é decisão própria **depois** de a extração nova provar que acerta.
- Recuperar as 1.105 falas gravadas em branco. O texto nunca chegou ao banco.
- Mexer em `motivoDoSilencio` — quem decide se a IA fala continua como está.
