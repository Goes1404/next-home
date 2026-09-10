# Tradutor de prompt de imagem — Onda 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhuma imagem paga sai sem que o corretor tenha lido e editado, em português, o texto exato que vai para o provedor.

**Architecture:** Três módulos PUROS (`gramatica.ts`, `catalogoNoPrompt.ts` e a conferência) montam o pedido; um único módulo com LLM (`tradutor.ts`) reescreve; a tela mostra o resultado num campo editável e é esse texto que a rota recebe. O campo `promptEn` sai de toda a pilha.

**Tech Stack:** Next 16 (App Router), TypeScript, vitest, `chamarLlmJson` (`gpt-4.1-mini`), `gpt-image-2`.

**Spec:** `docs/superpowers/specs/2026-09-10-geracao-de-imagem-tradutor-design.md`

## Global Constraints

- **Tudo em português.** O prompt final é em português e é literalmente o que o provedor recebe. Nenhuma tradução entre a aprovação e o envio.
- **Falha do tradutor é degradação declarada, nunca bloqueio silencioso.** Sem motor, com timeout ou com JSON torto, o texto do corretor segue — e a tela DIZ que não foi melhorado.
- **Campo vazio nunca entra no prompt.** Nem string vazia, nem `"."`, nem `null` formatado.
- **Módulo puro não importa `server-only`.** `gramatica.ts` e `catalogoNoPrompt.ts` são importados pela tela (`"use client"`); constante é valor e arrastaria o grafo do servidor — a pedra de `limitesPdf.ts`, `pessoasTipos.ts` e `imagensTipos.ts`.
- **A cláusula anti-letreiro continua em `gerarImagem.ts`.** Ponto único; nenhuma tarefa a duplica.
- **Comandos:** testes com `npx vitest run <caminho>`; tipos com `npx tsc --noEmit`. Rodar a suíte com `env -u OPENAI_API_KEY npm test` (há teste que muda de comportamento com a chave presente).
- **Esta é a Onda 1.** Referências múltiplas (`image[]`), anexo "saída esperada" e carimbo opcional ficam para a Onda 2, cujo plano só se escreve DEPOIS da Task 1 — é ela que decide se o caminho com duas imagens cabe nos 60s da Vercel ou vai para o worker. Planejar antes seria planejar sobre hipótese.

---

### Task 1: F0 — medir antes de construir

Não é TDD: a entrega são números que decidem a Onda 2. Roda uma vez, custa ~R$ 0,20, e o resultado é commitado.

**Files:**
- Create: `scripts/imagens/medirF0.ts`
- Create: `docs/medicoes/2026-09-10-f0-imagem.md` (a saída, commitada)

**Interfaces:**
- Consumes: `gerarImagem` de `src/lib/imagens/gerarImagem.ts` (`PedidoDeImagem` → `ResultadoImagem`).
- Produces: números que a Onda 2 consome. Nenhum código de produção.

- [ ] **Step 1: Escrever o script de medição**

```ts
/**
 * F0 da reestruturação da geração de imagem — a medição que decide a Onda 2.
 *
 * Três perguntas, e todas só se respondem gastando de verdade:
 *
 * 1. LATÊNCIA com 1 e com 2 referências, em `low` e `medium`. A doc oficial
 *    admite até 2 MINUTOS em prompt complexo; a função da Vercel morre em 60s
 *    e o teto interno de `gerarImagem` é 45s. Se estourar, o caminho com duas
 *    imagens vai para o worker — porque estourar significa matar a função com
 *    a imagem JÁ PAGA.
 * 2. Quanto do ESTILO transfere de uma peça-modelo real.
 * 3. A taxa de acerto do TEXTO LITERAL com a técnica documentada (aspas +
 *    soletrar), contra a linha de base medida nesta base: 3 em 4.
 *
 * Uso: OPENAI_API_KEY=... npx tsx scripts/imagens/medirF0.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gerarImagem } from "../../src/lib/imagens/gerarImagem";

type Caso = {
  nome: string;
  prompt: string;
  qualidade: "low" | "medium";
  referencias: string[]; // caminhos locais
};

const BASE = "scripts/imagens/f0";

function ler(caminho: string): { bytes: Buffer; mime: string } {
  return { bytes: readFileSync(caminho), mime: caminho.endsWith(".png") ? "image/png" : "image/jpeg" };
}

const CASOS: Caso[] = [
  {
    nome: "1ref-low",
    prompt:
      "Fachada de um edifício residencial alto em Barueri, vista da calçada em leve contra-plongée, fim de tarde com luz quente, paisagismo tropical no térreo, fotografia arquitetônica.",
    qualidade: "low",
    referencias: [`${BASE}/fachada.jpg`],
  },
  { nome: "1ref-medium", prompt: "", qualidade: "medium", referencias: [`${BASE}/fachada.jpg`] },
  { nome: "2ref-low", prompt: "", qualidade: "low", referencias: [`${BASE}/fachada.jpg`, `${BASE}/modelo.jpg`] },
  { nome: "2ref-medium", prompt: "", qualidade: "medium", referencias: [`${BASE}/fachada.jpg`, `${BASE}/modelo.jpg`] },
  {
    nome: "texto-literal-1",
    prompt:
      'Peça vertical de lançamento imobiliário. A ÚNICA escrita da imagem é "MUDE AINDA ESTE ANO", soletrado M-U-D-E A-I-N-D-A E-S-T-E A-N-O, em caixa alta, no terço superior esquerdo, tipografia sem serifa pesada.',
    qualidade: "low",
    referencias: [],
  },
  {
    nome: "texto-literal-2",
    prompt:
      'Peça quadrada de imobiliária. A ÚNICA escrita da imagem é "PRONTO PARA MORAR", soletrado P-R-O-N-T-O P-A-R-A M-O-R-A-R, em caixa alta, numa faixa horizontal amarela, tipografia sem serifa.',
    qualidade: "low",
    referencias: [],
  },
];

async function main() {
  // Os casos 2 a 4 repetem o prompt do primeiro: o que muda é referência e
  // qualidade, e comparar latência com prompts diferentes não mede nada.
  for (const c of CASOS.slice(1, 4)) c.prompt = CASOS[0].prompt;

  const linhas: string[] = [];
  mkdirSync("docs/medicoes", { recursive: true });

  for (const caso of CASOS) {
    const r = await gerarImagem({
      prompt: caso.prompt,
      referencia: caso.referencias[0] ? ler(caso.referencias[0]) : null,
      largura: 1024,
      altura: caso.nome.startsWith("texto") ? 1024 : 1536,
      qualidade: caso.qualidade,
      timeoutMs: 150_000, // de propósito ACIMA dos 45s: aqui se MEDE o estouro
    });

    const status = r.ok ? "ok" : `falhou (${r.motivo})`;
    linhas.push(`| ${caso.nome} | ${caso.referencias.length} | ${caso.qualidade} | ${r.latenciaMs} ms | ${status} |`);
    console.log(linhas.at(-1));

    if (r.ok) writeFileSync(`${BASE}/saida-${caso.nome}.png`, r.bytes);
  }

  const doc = [
    "# F0 — geração de imagem, medição de 2026-09-10",
    "",
    "| caso | referências | qualidade | latência | resultado |",
    "|---|---|---|---|---|",
    ...linhas,
    "",
    "## Decisão",
    "",
    "- Teto interno hoje: 45 s. Teto da função (Hobby): 60 s.",
    "- Se `2ref-medium` passou de 45 s, o caminho com duas referências vai para o worker.",
    "",
    "## Texto literal",
    "",
    "Conferir À VISTA as saídas `saida-texto-literal-*.png`: a escrita bate",
    "caractere por caractere? Linha de base sem a técnica: 3 acertos em 4.",
  ].join("\n");

  writeFileSync("docs/medicoes/2026-09-10-f0-imagem.md", doc);
  console.log("\nEscrito em docs/medicoes/2026-09-10-f0-imagem.md");
}

void main();
```

- [ ] **Step 2: Preparar as duas imagens de entrada**

Baixar uma foto de fachada real do catálogo e salvar como `scripts/imagens/f0/fachada.jpg`; salvar uma das peças de referência do usuário (Manacá ou Acqua Park) como `scripts/imagens/f0/modelo.jpg`.

```bash
mkdir -p scripts/imagens/f0
# a URL sai de: select url from midias where tipo='foto' limit 1;
curl -s -o scripts/imagens/f0/fachada.jpg "<url da foto do catálogo>"
ls -la scripts/imagens/f0/
```

- [ ] **Step 3: Conferir o saldo da conta antes de gastar**

A chave já ficou sem crédito uma vez, no meio de uma medição (02/09). E é a MESMA conta do atendimento da Sofia.

```bash
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" -o /dev/null -w "%{http_code}\n"
```
Expected: `200`. Se vier `429` com `insufficient_quota`, PARAR — sem crédito, a Sofia cai junto.

- [ ] **Step 4: Rodar a medição**

```bash
set -a; . ./.env.local; set +a
npx tsx scripts/imagens/medirF0.ts
```
Expected: 6 linhas de latência no console e o arquivo em `docs/medicoes/`.

- [ ] **Step 5: Olhar as imagens e escrever a decisão**

Abrir `scripts/imagens/f0/saida-*.png`. Preencher à mão, no `docs/medicoes/2026-09-10-f0-imagem.md`, quantos dos 2 casos de texto acertaram a escrita caractere por caractere, e se o `2ref` transferiu o estilo da peça-modelo.

- [ ] **Step 6: Commit**

```bash
git add scripts/imagens/medirF0.ts docs/medicoes/2026-09-10-f0-imagem.md
git commit -m "medicao(f0): latencia, estilo e texto literal do gpt-image-2"
```

As imagens de entrada e saída NÃO entram no commit (`scripts/imagens/f0/*.jpg|png` vai para o `.gitignore`) — são bytes de medição, não código.

---

### Task 2: `gramatica.ts` — as boas práticas como dado

**Files:**
- Create: `src/lib/imagens/gramatica.ts`
- Test: `src/lib/imagens/gramatica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `SECOES: readonly { chave: ChaveSecao; rotulo: string; pede: string }[]`
  - `type ChaveSecao = "cena" | "sujeito" | "detalhes" | "restricoes"`
  - `instrucaoDaGramatica(): string` — o texto que entra no prompt do tradutor.
  - `conferir(prompt: string): ChaveSecao[]` — o que o prompt NÃO cobriu.
  - `PISO_DE_PROMPT: number`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { conferir, instrucaoDaGramatica, PISO_DE_PROMPT, SECOES } from "./gramatica";

describe("a gramática cobre as quatro seções da doc oficial", () => {
  it("tem cena, sujeito, detalhes e restrições", () => {
    expect(SECOES.map((s) => s.chave)).toEqual(["cena", "sujeito", "detalhes", "restricoes"]);
  });

  it("a instrução nomeia todas as seções, senão o tradutor não sabe o que preencher", () => {
    const texto = instrucaoDaGramatica().toLowerCase();
    for (const secao of SECOES) expect(texto).toContain(secao.rotulo.toLowerCase());
  });
});

describe("conferir aponta o que ficou de fora", () => {
  it("um prompt completo não tem pendência", () => {
    const bom =
      "Fachada de edifício residencial alto vista da calçada, em leve contra-plongée com lente grande-angular. " +
      "Fim de tarde, luz quente e rasante, céu limpo. Concreto claro, vidro refletivo e paisagismo tropical no térreo. " +
      "Sem pessoas com rosto reconhecível e sem qualquer texto ou placa na cena.";
    expect(conferir(bom)).toEqual([]);
  });

  it("prompt sem luz nem hora do dia acusa detalhes", () => {
    const semLuz = "Fachada de edifício alto vista da calçada em contra-plongée. Sem texto na cena.";
    expect(conferir(semLuz)).toContain("detalhes");
  });

  it("prompt sem negativa acusa restrições", () => {
    const semNegativa =
      "Fachada de edifício alto vista da calçada em contra-plongée, fim de tarde com luz quente, concreto e vidro.";
    expect(conferir(semNegativa)).toContain("restricoes");
  });

  it("três palavras acusam tudo — é o caso `Torre.` que virou imagem paga", () => {
    expect(conferir("Torre.").length).toBe(SECOES.length);
  });

  it("o piso existe e é maior que uma palavra solta", () => {
    expect(PISO_DE_PROMPT).toBeGreaterThan("Torre.".length);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imagens/gramatica.test.ts`
Expected: FAIL — `Failed to resolve import "./gramatica"`

- [ ] **Step 3: Implementar**

```ts
/**
 * As boas práticas de prompt de imagem como DADO, não como parágrafo solto
 * dentro de um prompt de LLM.
 *
 * A estrutura não foi inventada: é a que a documentação oficial de image
 * prompting recomenda — seções rotuladas de CENA, SUJEITO, DETALHES e
 * RESTRIÇÕES. Estar aqui, e não embutida numa string do tradutor, é o que
 * permite CONFERIR o que ele devolveu: instrução de prompt é probabilística e
 * falha justo na resposta que importa; função determinística vale sempre.
 *
 * Módulo PURO de propósito — a tela é `"use client"` e mostra ao corretor o
 * que ficou de fora.
 */

export type ChaveSecao = "cena" | "sujeito" | "detalhes" | "restricoes";

export const SECOES = [
  {
    chave: "cena",
    rotulo: "Cena",
    pede: "onde se passa, que tipo de imagem é (foto, render, ilustração) e o enquadramento",
  },
  {
    chave: "sujeito",
    rotulo: "Sujeito",
    pede: "o que aparece em primeiro plano e o que ele está fazendo ou mostrando",
  },
  {
    chave: "detalhes",
    rotulo: "Detalhes",
    pede: "luz, hora do dia, materiais, cores e textura",
  },
  {
    chave: "restricoes",
    rotulo: "Restrições",
    pede: "o que NÃO pode aparecer",
  },
] as const satisfies readonly { chave: ChaveSecao; rotulo: string; pede: string }[];

/**
 * Abaixo disto não há descrição de cena nenhuma.
 *
 * O número não é arbitrário: a geração de 09/09 mandou a palavra `Torre.` (6
 * caracteres) para uma imagem paga. Um pedido que descreve enquadramento, luz
 * e material não cabe em menos de uma frase inteira.
 */
export const PISO_DE_PROMPT = 80;

export function instrucaoDaGramatica(): string {
  const secoes = SECOES.map((s) => `- ${s.rotulo}: ${s.pede}.`).join("\n");
  return `Escreva um parágrafo corrido, em português, que cubra as quatro coisas abaixo.
Não use títulos nem lista — as seções são o que o texto precisa CONTER, não como
ele se organiza.

${secoes}

Regras de forma:
- Concreto, não adjetivo solto. "luz quente e rasante do fim de tarde" em vez de "bonito".
- Câmera e lente são pistas de aparência, não garantia física — pode citá-las.
- Texto que deva aparecer NA IMAGEM vai entre aspas, com a posição, e soletrado
  letra a letra. Nada de texto que o corretor não tenha escrito.
- Entre 200 e 600 caracteres.`;
}

/* Marcas de cada seção. Deliberadamente generosas: acusar de menos custa uma
   dica que não apareceu; acusar de mais manda o corretor consertar o que já
   estava certo — e este projeto já perdeu tempo cinco vezes com critério que
   reprova o comportamento correto. */
const MARCAS: Record<ChaveSecao, RegExp> = {
  cena: /\b(vista|plano|enquadr|ângulo|angulo|contra-plong|close|panor|fotografia|render|ilustra|aérea|aerea|frontal|lateral|grande-angular|lente)\b/i,
  sujeito:
    /\b(fachada|edif|prédio|predio|torre|sala|quarto|cozinha|varanda|piscina|academia|living|salão|salao|hall|churrasqueira|playground|apartamento|casa|terreno|planta|área|area)\b/i,
  detalhes:
    /\b(luz|iluminad|sol|manhã|manha|tarde|entardecer|noite|golden|sombra|concreto|vidro|madeira|mármore|marmore|porcelanato|cor(es)?|paleta|textura|céu|ceu|nublado|difusa)\b/i,
  restricoes: /\b(sem|não|nao|nenhum|evite|exclua|proib)\b/i,
};

export function conferir(prompt: string): ChaveSecao[] {
  const texto = prompt.trim();
  if (texto.length < PISO_DE_PROMPT) return SECOES.map((s) => s.chave);
  return SECOES.filter((s) => !MARCAS[s.chave].test(texto)).map((s) => s.chave);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imagens/gramatica.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/imagens/gramatica.ts src/lib/imagens/gramatica.test.ts
git commit -m "feat(imagens): a gramatica de prompt vira dado conferivel"
```

---

### Task 3: `catalogoNoPrompt.ts` — fatos do imóvel, sem campo vazio

**Files:**
- Create: `src/lib/imagens/catalogoNoPrompt.ts`
- Test: `src/lib/imagens/catalogoNoPrompt.test.ts`

**Interfaces:**
- Consumes: `STATUS_LABEL` de `@/lib/types` (`src/lib/types.ts:21`, `Record<StatusObra, string>`).
- Produces: `fatosDoImovel(imovel: ImovelParaPrompt): string[]` e `type ImovelParaPrompt`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { fatosDoImovel } from "./catalogoNoPrompt";

describe("campo vazio NUNCA entra no prompt", () => {
  it('o caso real de 09/09: nome e bairro eram "." e viraram fato', () => {
    const fatos = fatosDoImovel({
      nome: ".",
      bairro: ".",
      cidade: "Barueri",
      status: "lancamento",
      construtora: null,
      tipologias: [],
      lazer: [],
    });
    expect(fatos.join(" ")).not.toContain('"."');
    expect(fatos.join(" ")).not.toContain(" . ");
  });

  it("string vazia e espaço em branco também ficam de fora", () => {
    const fatos = fatosDoImovel({
      nome: "  ",
      bairro: "",
      cidade: "Barueri",
      status: "lancamento",
      construtora: "   ",
      tipologias: [],
      lazer: [],
    });
    expect(fatos.some((f) => /nome|bairro|construtora/i.test(f))).toBe(false);
  });

  it("com ficha cheia, entrega os fatos que existem", () => {
    const fatos = fatosDoImovel({
      nome: "Dom Parque",
      bairro: "Aldeia",
      cidade: "Barueri",
      status: "em_construcao",
      construtora: "P4 Engenharia",
      tipologias: [{ areaPrivativa: 63, dormitorios: 2, vagas: 1 }],
      lazer: ["Piscina", "Academia"],
    });
    const texto = fatos.join(" | ");
    expect(texto).toContain("Dom Parque");
    expect(texto).toContain("Aldeia");
    expect(texto).toContain("63");
    expect(texto).toContain("Piscina");
  });

  it("usa o RÓTULO humano do status, nunca o enum cru", () => {
    const fatos = fatosDoImovel({
      nome: "Dom Parque",
      bairro: "Aldeia",
      cidade: "Barueri",
      status: "em_construcao",
      construtora: null,
      tipologias: [],
      lazer: [],
    });
    expect(fatos.join(" ")).not.toContain("em_construcao");
    expect(fatos.join(" ")).toContain("Em construção");
  });

  it("ficha totalmente vazia devolve lista vazia, não uma frase oca", () => {
    expect(
      fatosDoImovel({
        nome: null,
        bairro: null,
        cidade: null,
        status: null,
        construtora: null,
        tipologias: [],
        lazer: [],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imagens/catalogoNoPrompt.test.ts`
Expected: FAIL — `Failed to resolve import "./catalogoNoPrompt"`

- [ ] **Step 3: Implementar**

```ts
/**
 * O imóvel do catálogo virando fatos que podem entrar num prompt pago.
 *
 * ## Por que este módulo existe
 *
 * Em 09/09/2026 uma geração real levou ao provedor:
 *
 *     Apartamento chamado "." em ., Barueri no estágio "Lançamento"
 *
 * O nome e o bairro do cadastro eram um ponto final, e o montador de prompt os
 * interpolou sem olhar. Custou uma imagem paga e produziu um prédio genérico.
 *
 * A regra é uma só e vale para todo campo: **o que não tem conteúdo não entra**
 * — nem vazio, nem só espaço, nem pontuação solta. Módulo PURO para isso ser
 * testável sem rede, que é onde este defeito se pega.
 *
 * ## Rótulo humano, nunca o enum
 *
 * A mesma lição que a Sofia já aprendeu: com `em_construcao` na ficha, um
 * modelo afirmou ao cliente que o imóvel estava "pronto para morar".
 */
import { STATUS_LABEL } from "@/lib/types";

export type ImovelParaPrompt = {
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  status: string | null;
  construtora: string | null;
  tipologias: { areaPrivativa: number | null; dormitorios: number | null; vagas: number | null }[];
  lazer: string[];
};

/**
 * Só passa o que é conteúdo.
 *
 * O recorte de pontuação existe por causa do caso real: `"."` é uma string não
 * vazia e teria passado por qualquer checagem de `!!valor`.
 */
function vale(v: string | null | undefined): v is string {
  const t = (v ?? "").trim();
  return t.length > 0 && /[\p{L}\p{N}]/u.test(t);
}

function numero(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function fatosDoImovel(imovel: ImovelParaPrompt): string[] {
  const fatos: string[] = [];

  if (vale(imovel.nome)) fatos.push(`Empreendimento: ${imovel.nome.trim()}`);

  const local = [imovel.bairro, imovel.cidade].filter(vale).map((s) => s.trim());
  if (local.length > 0) fatos.push(`Local: ${local.join(", ")}`);

  if (vale(imovel.status)) {
    const rotulo = STATUS_LABEL[imovel.status as keyof typeof STATUS_LABEL];
    if (vale(rotulo)) fatos.push(`Estágio: ${rotulo}`);
  }

  if (vale(imovel.construtora)) fatos.push(`Construtora: ${imovel.construtora.trim()}`);

  const tipologias = imovel.tipologias
    .map((t) => {
      const partes: string[] = [];
      if (numero(t.areaPrivativa)) partes.push(`${t.areaPrivativa} m²`);
      if (numero(t.dormitorios)) partes.push(`${t.dormitorios} dorm.`);
      if (numero(t.vagas)) partes.push(`${t.vagas} vaga(s)`);
      return partes.join(" · ");
    })
    .filter((s) => s.length > 0);
  if (tipologias.length > 0) fatos.push(`Tipologias: ${tipologias.join(" | ")}`);

  const lazer = imovel.lazer.filter(vale).map((s) => s.trim());
  if (lazer.length > 0) fatos.push(`Lazer que EXISTE: ${lazer.join(", ")}`);

  return fatos;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imagens/catalogoNoPrompt.test.ts`
Expected: PASS (5 testes)

Se falhar no import de `STATUS_LABEL`, corrigir o caminho — ele é o único acoplamento externo deste módulo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imagens/catalogoNoPrompt.ts src/lib/imagens/catalogoNoPrompt.test.ts
git commit -m "feat(imagens): fatos do imovel sem campo vazio no prompt"
```

---

### Task 4: `tradutor.ts` — uma chamada, em português, com reserva declarada

**Files:**
- Create: `src/lib/imagens/tradutor.ts`
- Test: `src/lib/imagens/tradutor.test.ts`
- Delete: `src/lib/imagens/melhorarPedido.ts`, `src/app/api/imagens/melhorar/route.ts`

**Interfaces:**
- Consumes: `chamarLlmJson(prompt: string, opts?: { temperature?: number; orcamentoMs?: number }): Promise<ResultadoLlm>` de `@/lib/whatsapp/llm`; `instrucaoDaGramatica`, `conferir`, `PISO_DE_PROMPT` da Task 2; `fatosDoImovel` da Task 3.
- Produces: `traduzirPedido(entrada: EntradaDoTradutor): Promise<PromptTraduzido>`, `type EntradaDoTradutor`, `type PromptTraduzido`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

const { traduzirPedido } = await import("./tradutor");

function respostaOk(prompt: string) {
  return { ok: true, json: { prompt }, latenciaMs: 1200, tokensEntrada: 300, tokensSaida: 120, modelo: "gpt-4.1-mini" };
}

const BOM =
  "Fachada de edifício residencial alto vista da calçada em leve contra-plongée, " +
  "fim de tarde com luz quente e rasante, concreto claro e vidro refletivo, " +
  "paisagismo tropical no térreo. Sem pessoas com rosto reconhecível e sem texto na cena.";

beforeEach(() => chamarLlmJson.mockReset());

describe("o tradutor devolve português, e é ele que vai", () => {
  it("usa o texto do modelo quando ele responde", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada bonita", fatos: [] });
    expect(r.prompt).toBe(BOM);
    expect(r.daIa).toBe(true);
  });

  it("os fatos do imóvel entram no prompt DO MOTOR", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "post do Dom Parque", fatos: ["Empreendimento: Dom Parque"] });
    expect(chamarLlmJson.mock.calls[0][0]).toContain("Dom Parque");
  });
});

describe("falha do motor é degradação DECLARADA", () => {
  it("motor fora do ar devolve o texto do corretor com daIa false", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "sem_api_key", latenciaMs: 0 });
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.prompt).toBe("fachada bonita ao entardecer");
    expect(r.daIa).toBe(false);
  });

  it("resposta curta demais é RECUSADA — substituir por duas palavras é pior que não tentar", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk("um prédio"));
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.daIa).toBe(false);
    expect(r.prompt).toBe("fachada bonita ao entardecer");
  });
});

describe("o portão", () => {
  it("marca abaixoDoPiso para o caso `Torre.`", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "http_5xx", latenciaMs: 10 });
    const r = await traduzirPedido({ pedido: "Torre.", fatos: [] });
    expect(r.abaixoDoPiso).toBe(true);
  });

  it("prompt completo não fica abaixo do piso nem tem pendência", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada", fatos: [] });
    expect(r.abaixoDoPiso).toBe(false);
    expect(r.naoCobriu).toEqual([]);
  });

  it("ajuste parte do prompt ANTERIOR, não do zero", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "mais claro", fatos: [], promptAnterior: BOM });
    const enviado = chamarLlmJson.mock.calls[0][0];
    expect(enviado).toContain(BOM);
    expect(enviado.toLowerCase()).toContain("mude apenas");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imagens/tradutor.test.ts`
Expected: FAIL — `Failed to resolve import "./tradutor"`

- [ ] **Step 3: Implementar**

```ts
import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { conferir, instrucaoDaGramatica, PISO_DE_PROMPT, type ChaveSecao } from "./gramatica";

/**
 * O tradutor: pega o que o corretor escreveu e devolve um pedido de imagem
 * decente, EM PORTUGUÊS.
 *
 * ## Por que ele é o produto, e não um detalhe
 *
 * O ChatGPT gera imagem com o MESMO modelo que usamos (`gpt-image-2`). A
 * diferença de resultado não é o modelo — é que ele reescreve o pedido antes
 * de mandar para o gerador. Nós mandávamos cru, e foi assim que a palavra
 * `Torre.` virou uma imagem paga.
 *
 * ## Por que português, e por que é ESTE texto que vai
 *
 * A versão anterior devolvia `promptEn` (o que era enviado) e `explicacaoPt`
 * (uma paráfrase que o corretor lia). Ele aprovava no escuro. O comentário da
 * tela já dizia "esconder do corretor seria tirar dele a chance de corrigir" —
 * e entregava o texto em inglês, num `<p>` onde não se digita. Aqui não há
 * duas versões: o que ele lê é o que o provedor recebe.
 *
 * ## Falha é degradação DECLARADA
 *
 * Sem motor, com timeout ou com JSON torto, o texto do corretor segue — e
 * `daIa: false` obriga a tela a dizer isso. O comportamento antigo era mandar
 * o texto cru com etiqueta de melhorado, que é como `Torre.` passou.
 */

/** Teto curto: isto acontece com a pessoa olhando para a tela. */
const ORCAMENTO_MS = 12_000;

/** Abaixo disto o modelo não melhorou nada, e trocar o texto do corretor por
 *  isso é pior que não ter tentado. */
const MINIMO_ACEITAVEL = 60;

/** Prompt gigante dilui o assunto, que é justamente o que viemos consertar. */
const TETO = 1400;

export type EntradaDoTradutor = {
  /** O que o corretor escreveu agora. */
  pedido: string;
  /** Fatos do catálogo, de `fatosDoImovel`. Lista vazia é normal. */
  fatos: string[];
  /** O prompt aprovado da rodada anterior, quando isto é um ajuste. */
  promptAnterior?: string | null;
  /** Há foto de referência? Muda a instrução: é edição, não criação. */
  temReferencia?: boolean;
};

export type PromptTraduzido = {
  /** Em português. É exatamente o que o provedor recebe. */
  prompt: string;
  /** `false` quando o motor não respondeu e o texto voltou como veio. */
  daIa: boolean;
  /** Seções da gramática que o texto final não cobriu. */
  naoCobriu: ChaveSecao[];
  /** Curto demais para gerar sem confirmação explícita. */
  abaixoDoPiso: boolean;
};

function montarPromptDoMotor(e: EntradaDoTradutor): string {
  const blocos: string[] = [
    `Você reescreve pedidos de imagem para uma imobiliária brasileira.`,
    ``,
    `O corretor escreveu: "${e.pedido.trim()}"`,
  ];

  if (e.promptAnterior?.trim()) {
    blocos.push(
      ``,
      `Este é o pedido que já estava aprovado:`,
      e.promptAnterior.trim(),
      ``,
      `MUDE APENAS o que o corretor pediu agora e repita todo o resto como está.`,
      `Edição repetida muda detalhe que ninguém pediu — restate o que fica.`,
    );
  }

  if (e.fatos.length > 0) {
    blocos.push(
      ``,
      `Fatos verdadeiros deste imóvel (use o que ajudar, não invente o resto):`,
      ...e.fatos.map((f) => `- ${f}`),
    );
  }

  if (e.temReferencia) {
    blocos.push(
      ``,
      `Há uma FOTO de referência. Descreva a cena a partir dela; o que você`,
      `escrever é o que deve MUDAR ou ser enfatizado, não uma cena nova.`,
    );
  }

  blocos.push(
    ``,
    instrucaoDaGramatica(),
    ``,
    `O que NUNCA entra:`,
    `- Metragem, número de dormitórios, andar, preço ou condição de pagamento que`,
    `  não estejam nos fatos acima. Imagem com número vira promessa ao cliente.`,
    `- Pessoas com rosto reconhecível.`,
    `- Nome, placa, letreiro ou logotipo que o corretor não tenha escrito.`,
    ``,
    `Responda apenas com JSON: {"prompt": "o pedido reescrito em português"}`,
  );

  return blocos.join("\n");
}

function textoDoJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const bruto = (json as { prompt?: unknown }).prompt;
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim().replace(/\s+/g, " ");
  if (texto.length < MINIMO_ACEITAVEL) return null;
  return texto.slice(0, TETO);
}

function fechar(prompt: string, daIa: boolean): PromptTraduzido {
  return {
    prompt,
    daIa,
    naoCobriu: conferir(prompt),
    abaixoDoPiso: prompt.trim().length < PISO_DE_PROMPT,
  };
}

export async function traduzirPedido(entrada: EntradaDoTradutor): Promise<PromptTraduzido> {
  const original = entrada.pedido.trim();
  if (!original) return fechar("", false);

  const r = await chamarLlmJson(montarPromptDoMotor(entrada), {
    temperature: 0.7,
    orcamentoMs: ORCAMENTO_MS,
  });

  if (!r.ok) return fechar(original, false);

  const texto = textoDoJson(r.json);
  return texto ? fechar(texto, true) : fechar(original, false);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imagens/tradutor.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Apagar o que ele substitui**

`melhorarPedido.ts` fazia a mesma coisa por um caminho que nenhuma tela chamava, e `engenheiroDePrompt` é desmontado na Task 5.

```bash
git rm src/lib/imagens/melhorarPedido.ts src/app/api/imagens/melhorar/route.ts
npx tsc --noEmit
```
Expected: sem erro. Se algum arquivo ainda importar `melhorarPedido`, ele aparece aqui — corrigir antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/imagens/ src/app/api/imagens/
git commit -m "feat(imagens): o tradutor devolve portugues, e e ele que vai"
```

---

### Task 5: `promptEn` sai da pilha, com guarda

**Files:**
- Modify: `src/lib/estudio/contrato.ts` (o campo `promptEn` e `explicacaoPt` de `PropostaDeArte`)
- Modify: `src/lib/estudio/turno.ts:184-200` (onde `montarPromptFinal` é chamado)
- Modify: `src/lib/imagens/engenheiroDePrompt.ts` (`PromptPronto`)
- Modify: `src/app/api/imagens/gerar/route.ts` (o corpo aceito)
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx:156,337`
- Test: `src/lib/imagens/semPromptEn.test.ts`

**Interfaces:**
- Consumes: `traduzirPedido` da Task 4.
- Produces: `PropostaDeArte` passa a ter `prompt: string` (português) e `daIa: boolean`; **não existe mais `promptEn` nem `explicacaoPt` em lugar nenhum**.

- [ ] **Step 1: Escrever a guarda que falha**

Ela lê o código-fonte, como `escalaDoPainel`, `camadasGuardas` e `gravacaoDeMensagem` já fazem nesta base — a regressão aqui falharia calada: build passa, tela abre, e só o provedor sabe que recebeu inglês.

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(__dirname, "..", "..");

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      arquivos(p, acc);
    } else if (/\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

/** Comentário não é código — tirar antes de acusar. Este projeto já tropeçou
 *  seis vezes em guarda que leu o próprio comentário. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("o prompt de imagem é um só, e é em português", () => {
  it("`promptEn` não existe em nenhum arquivo", () => {
    const culpados = arquivos(path.join(RAIZ, "src"))
      .filter((f) => /promptEn/.test(semComentarios(readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));

    expect(culpados, `ainda usam promptEn: ${culpados.join(", ")}`).toEqual([]);
  });

  it("`explicacaoPt` não existe — havia UM prompt e uma paráfrase; agora há só o prompt", () => {
    const culpados = arquivos(path.join(RAIZ, "src"))
      .filter((f) => /explicacaoPt/.test(semComentarios(readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));

    expect(culpados, `ainda usam explicacaoPt: ${culpados.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imagens/semPromptEn.test.ts`
Expected: FAIL — lista `engenheiroDePrompt.ts`, `estudio/contrato.ts`, `estudio/turno.ts`, `ChatDeArte.tsx`.

- [ ] **Step 3: Trocar o campo em `contrato.ts`**

```ts
/** O que a IA propõe gerar. O corretor lê e EDITA isto — é o que vai. */
export type PropostaDeArte = {
  tipo: "proposta";
  modo: "arte";
  /**
   * O pedido em PORTUGUÊS que vai para o provedor (antes da espinha e da
   * cláusula anti-letreiro). Não há segunda versão: o que está aqui é o que
   * o provedor recebe, e é editável na tela.
   */
  prompt: string;
  /** `false` quando o motor caiu e o prompt é o texto do próprio corretor. */
  daIa: boolean;
  /** Seções da gramática que o texto não cobriu — a tela mostra como dica. */
  naoCobriu: string[];
  /** Curto demais: a tela exige confirmação antes de gastar. */
  abaixoDoPiso: boolean;
  receita: string;
  tamanho: string;
  qualidade: "low" | "medium";
  referenciaPath?: string | null;
};
```

Ajustar também o validador do mesmo arquivo (`contrato.ts:156-161`), trocando `d.promptEn` por `d.prompt` e removendo a linha de `explicacaoPt`.

- [ ] **Step 4: Trocar a chamada em `turno.ts`**

Substituir o bloco que chama `montarPromptFinal` (hoje em `turno.ts:184`):

```ts
  const tamanho = tamanhoDoTexto(ideia);
  const receita = receitaDoTexto(ideia, Boolean(referencia));
  const traduzido = await traduzirPedido({
    pedido: ideia,
    fatos: [],
    promptAnterior: propostaAnterior?.prompt ?? null,
    temReferencia: Boolean(referencia),
  });

  const proposta: PropostaDeArte = {
    tipo: "proposta",
    modo: "arte",
    prompt: traduzido.prompt,
    daIa: traduzido.daIa,
    naoCobriu: traduzido.naoCobriu,
    abaixoDoPiso: traduzido.abaixoDoPiso,
    receita: receitaPor(receita).chave,
    tamanho,
    qualidade: "low",
    referenciaPath: referencia?.path ?? null,
  };

  const notaDaFoto = referencia ? " Vou partir da foto que você anexou." : "";
  const texto = traduzido.daIa
    ? soarHumano(
        `Escrevi assim.${notaDaFoto} Leia e ajuste o que quiser no campo abaixo — ` +
          `é exatamente esse texto que vai para o gerador. Quando estiver bom, toca em "Gerar".`,
      )
    : "Não consegui melhorar o pedido agora, então o texto abaixo é o SEU, como você escreveu. " +
      "Dá para gerar assim mesmo — mas leia antes, porque é ele que vai.";

  return { tipo: "proposta", texto, proposta };
```

Trocar o import de `@/lib/imagens/engenheiroDePrompt` por `@/lib/imagens/tradutor` no topo do arquivo. `propostaAnterior` é a última proposta da conversa — se `turno.ts` ainda não a tem em mão, obtê-la do mesmo histórico de onde sai `jaPropos`.

- [ ] **Step 5: Enxugar `engenheiroDePrompt.ts`**

O que continua útil são as PERGUNTAS (`perguntarOQueFalta`). O que sai é `montarPromptFinal` e o tipo `PromptPronto` inteiro — o tradutor os substitui.

```bash
grep -n "montarPromptFinal\|PromptPronto" -r src/ --include=*.ts --include=*.tsx
```
Apagar a função, o tipo e a reserva determinística que os acompanha.

- [ ] **Step 6: Ajustar a rota e a tela**

Em `src/app/api/imagens/gerar/route.ts`, o corpo já aceita `prompt?: string` — nada a mudar no contrato. Em `ChatDeArte.tsx:156`, trocar `prompt: p.promptEn` por `prompt: p.prompt`; em `:337`, o `<p>` vira o campo editável da Task 6 (aqui, apenas trocar para `proposta.prompt` para o build passar).

- [ ] **Step 7: Rodar tudo**

```bash
npx tsc --noEmit
npx vitest run src/lib/imagens/semPromptEn.test.ts
env -u OPENAI_API_KEY npm test
```
Expected: tipos OK; a guarda PASSA; suíte inteira verde.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(imagens): um prompt so, em portugues, com guarda de codigo-fonte"
```

---

### Task 6: o imóvel citado entra no turno — fatos e fotos

Sem esta tarefa, `fatosDoImovel` fica construída e desligada, e o único diferencial real sobre o ChatGPT não existe. `turno.ts` **já** recebe `imoveis: Empreendimento[]` e **já** tem `imovelPorTexto` (`turno.ts:225`) — só que hoje isso serve apenas ao caminho de vídeo.

**Files:**
- Modify: `src/lib/estudio/turno.ts` (o caminho de arte, onde a Task 5 chamou `traduzirPedido` com `fatos: []`)
- Modify: `src/lib/estudio/contrato.ts` (`PropostaDeArte` ganha as fotos candidatas)
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx` (a faixa de fotos)
- Test: `src/lib/estudio/imovelNaArte.test.ts`

**Interfaces:**
- Consumes: `fatosDoImovel` / `ImovelParaPrompt` (Task 3); `imovelPorTexto(texto, imoveis)` (já existe em `turno.ts`); `traduzirPedido` (Task 4).
- Produces: `PropostaDeArte` ganha `fotosDoImovel: { url: string; alt: string }[]` e `imovelSlug: string | null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { paraPrompt } from "./imovelNaArte";

describe("o imóvel citado vira fatos para o prompt", () => {
  it("converte o cadastro no formato que o tradutor consome", () => {
    const r = paraPrompt({
      slug: "dom-parque",
      nome: "Dom Parque",
      bairro: "Aldeia",
      cidade: "Barueri",
      status: "em_construcao",
      construtora: "P4 Engenharia",
      tipologias: [{ area_privativa: 63, dormitorios: 2, vagas: 1 }],
      lazer: [{ nome: "Piscina" }],
    } as never);

    expect(r.nome).toBe("Dom Parque");
    expect(r.tipologias[0]).toEqual({ areaPrivativa: 63, dormitorios: 2, vagas: 1 });
    expect(r.lazer).toEqual(["Piscina"]);
  });

  it("cadastro sem tipologia nem lazer devolve listas vazias, não undefined", () => {
    const r = paraPrompt({ slug: "x", nome: "X", bairro: null, cidade: null, status: null } as never);
    expect(r.tipologias).toEqual([]);
    expect(r.lazer).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/estudio/imovelNaArte.test.ts`
Expected: FAIL — `Failed to resolve import "./imovelNaArte"`

- [ ] **Step 3: Implementar o adaptador**

```ts
/**
 * O cadastro do banco no formato que o tradutor consome.
 *
 * Existe separado porque `Empreendimento` tem 30 colunas e nomes em
 * snake_case, e `ImovelParaPrompt` é o recorte mínimo em camelCase. Misturar
 * os dois faria `catalogoNoPrompt` — que é puro e testável — depender da forma
 * do banco.
 */
import type { Empreendimento } from "@/lib/types";
import type { ImovelParaPrompt } from "@/lib/imagens/catalogoNoPrompt";

type ComRelacoes = Empreendimento & {
  tipologias?: { area_privativa: number | null; dormitorios: number | null; vagas: number | null }[] | null;
  lazer?: { nome: string | null }[] | null;
};

export function paraPrompt(imovel: ComRelacoes): ImovelParaPrompt {
  return {
    nome: imovel.nome ?? null,
    bairro: imovel.bairro ?? null,
    cidade: imovel.cidade ?? null,
    status: imovel.status ?? null,
    construtora: imovel.construtora ?? null,
    tipologias: (imovel.tipologias ?? []).map((t) => ({
      areaPrivativa: t.area_privativa,
      dormitorios: t.dormitorios,
      vagas: t.vagas,
    })),
    lazer: (imovel.lazer ?? []).map((l) => l.nome).filter((n): n is string => typeof n === "string"),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/estudio/imovelNaArte.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Ligar no caminho de arte do `turno.ts`**

Onde a Task 5 deixou `fatos: []`:

```ts
  /*
   * O imóvel que o corretor CITOU. Sem LLM: `imovelPorTexto` casa por nome e
   * por `nomes_alternativos`, então "Manacá" acha o "More na Aldeia de
   * Barueri". É o único diferencial real sobre o ChatGPT — ele não tem esta
   * ficha nem estas fotos.
   */
  const imovel = imovelPorTexto(ideia, params.imoveis);
  const fatos = imovel ? fatosDoImovel(paraPrompt(imovel as never)) : [];

  const traduzido = await traduzirPedido({
    pedido: ideia,
    fatos,
    promptAnterior: propostaAnterior?.prompt ?? null,
    temReferencia: Boolean(referencia),
  });
```

E a proposta passa a carregar as fotos candidatas:

```ts
    imovelSlug: imovel?.slug ?? null,
    /*
     * As fotos DO IMÓVEL, para o corretor trocar a base sem sair do chat.
     * Teto de 8: faixa mais longa vira galeria, e galeria ninguém percorre.
     */
    fotosDoImovel: (imovel?.midias ?? [])
      .filter((m) => m.tipo === "foto")
      .slice(0, 8)
      .map((m) => ({ url: m.url, alt: m.alt ?? "" })),
```

Se `Empreendimento` não trouxer `midias` na consulta que alimenta `params.imoveis`, incluir o join — conferir com `grep -n "imoveis" src/app/corretor/\(painel\)/imoveis/criar-imagem/page.tsx`.

- [ ] **Step 6: A faixa de fotos na tela**

No cartão de proposta do `ChatDeArte.tsx`, acima do campo de prompt:

```tsx
      {proposta.fotosDoImovel.length > 0 && (
        <div className="space-y-1">
          <p className="text-apoio text-xs">
            Partir de qual foto? A imagem é REINTERPRETADA a partir dela — não sai idêntica.
          </p>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {proposta.fotosDoImovel.map((f) => (
              <li key={f.url}>
                <button
                  type="button"
                  onClick={() => setBase(f.url)}
                  aria-pressed={base === f.url}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                    base === f.url ? "border-acento" : "border-linha"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.alt} className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
```

A frase sobre reinterpretação não é enfeite: a sonda de 10/09 provou que `input_fidelity` **não existe** no `gpt-image-2`, então prometer "a mesma foto, só melhor" seria mentira que o corretor descobre na frente do cliente.

`overflow-x-auto` aqui é legítimo e precisa entrar na lista `ROLAGEM_DECLARADA` de `naoRolaDeLado.test.ts` com o motivo escrito — a rolagem É o conteúdo (a faixa de fotos), não navegação escondida.

- [ ] **Step 7: Rodar tudo**

```bash
npx tsc --noEmit
npx vitest run src/app/corretor/naoRolaDeLado.test.ts src/lib/estudio/
npm run build
```
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add -A src/lib/estudio/ "src/app/corretor/(painel)/imoveis/criar-imagem/" src/app/corretor/naoRolaDeLado.test.ts
git commit -m "feat(imagens): o imovel citado entra no prompt com fatos e fotos"
```

---

### Task 7: o portão editável na tela

**Files:**
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx` (o cartão de proposta, hoje em `:317-345`)

**Interfaces:**
- Consumes: `PropostaDeArte` da Task 5 (`prompt`, `daIa`, `naoCobriu`, `abaixoDoPiso`); `SECOES` da Task 2, para o rótulo humano da pendência.
- Produces: o corpo enviado à rota passa a levar o texto do campo, não o da proposta.

- [ ] **Step 1: Trocar o `<p>` por um campo editável**

No componente do cartão de proposta:

```tsx
  /*
   * O prompt é EDITÁVEL, e é ele que vai.
   *
   * A versão anterior mostrava o texto num <p> — e em inglês. O comentário
   * daquele código dizia "esconder do corretor seria tirar dele a chance de
   * corrigir", o que estava certo; só que dar a chance num idioma que ele não
   * escreve, num elemento onde não se digita, é o mesmo que não dar.
   */
  const [texto, setTexto] = useState(proposta.prompt);

  // Proposta nova (outra rodada do chat) reinicia o campo; enquanto for a
  // mesma, o que o corretor digitou fica.
  useEffect(() => setTexto(proposta.prompt), [proposta.prompt]);

  const curto = texto.trim().length < PISO_DE_PROMPT;
```

```tsx
      <label className="text-apoio text-xs font-medium" htmlFor="prompt-final">
        O pedido que vai para o gerador — pode editar
      </label>
      <textarea
        id="prompt-final"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        className="border-linha bg-fundo text-corpo text-fluid-sm min-h-32 w-full rounded-xl border p-3 leading-relaxed"
      />

      {!proposta.daIa && (
        <p className="text-alerta text-xs">
          Não consegui melhorar seu pedido agora — este texto é o seu, como você escreveu.
        </p>
      )}

      {proposta.naoCobriu.length > 0 && (
        <p className="text-apoio text-xs">
          Ficou faltando dizer:{" "}
          {proposta.naoCobriu
            .map((c) => SECOES.find((s) => s.chave === c)?.pede)
            .filter(Boolean)
            .join("; ")}
          .
        </p>
      )}

      {curto && (
        <p className="text-alerta text-xs">
          Está curto demais para gerar uma imagem boa — e a geração custa. Descreva a cena
          antes de tocar em Gerar.
        </p>
      )}
```

- [ ] **Step 2: Mandar o texto do campo, e não o da proposta**

No `onClick` do botão Gerar, o corpo passa a levar `prompt: texto` (era `proposta.promptEn`). O botão fica `disabled` quando `curto` — é o portão que mata o `Torre.`

- [ ] **Step 3: Conferir os tipos e o build**

```bash
npx tsc --noEmit
npm run build
```
Expected: ambos OK. O build é obrigatório aqui: `PISO_DE_PROMPT` e `SECOES` vêm de `gramatica.ts`, que é PURO — se alguém tiver posto `server-only` nele, é agora que a tela `"use client"` reprova.

- [ ] **Step 4: Ver na tela**

```bash
npm run dev
```
Abrir `/corretor/imoveis/criar-imagem`, pedir "fachada", conferir que o texto aparece em português no campo, que dá para editar, e que "Gerar" fica desabilitado se o campo for esvaziado.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/corretor/(painel)/imoveis/criar-imagem/"
git commit -m "feat(imagens): o prompt vira campo editavel, e o botao trava no piso"
```

---

### Task 8: o prompt aprovado vira ativo do histórico

**Files:**
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx` (a galeria, hoje em `:284-296`)

**Interfaces:**
- Consumes: `ImagemGerada` de `@/lib/imagens/imagensTipos` — o campo `prompt` já existe e já vem da consulta (`galeria.ts:59`). **Nenhuma migration.**
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Mostrar o prompt e o botão de reaproveitar**

```tsx
      {galeria.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-fluid-sm text-apoio font-medium">Suas últimas imagens</h2>
          {/*
           * O prompt aparece aqui porque ele é o ATIVO, não o log.
           * `imagens_geradas.prompt` é gravado desde sempre e nenhuma tela o
           * mostrava — a galeria eram 8 miniaturas com alt="". Décimo caso do
           * padrão que esta base já registrou nove vezes: dado guardado e não
           * exibido é indistinguível de dado perdido.
           */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {galeria.slice(0, 8).map((img) => (
              <li key={img.id} className="border-linha flex gap-3 overflow-hidden rounded-xl border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.arteUrl ?? img.url}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-apoio min-w-0 line-clamp-3 text-xs break-words">{img.prompt}</p>
                  <button
                    type="button"
                    onClick={() => reaproveitar(img.prompt)}
                    className="text-acento-suave self-start text-xs underline-offset-4 hover:underline"
                  >
                    Gerar outra assim
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 2: Implementar `reaproveitar` pelo composer que já existe**

Não inventar estado de proposta: `ChatBase` **já** aceita `textoInicial`, e o comentário dele descreve exatamente este caso — *"o composer nasce com este texto […] fica EDITÁVEL de propósito: mandar sozinho gastaria uma chamada que ninguém confirmou"*.

Em `ChatDeArte.tsx`:

```tsx
  /*
   * Reaproveitar NÃO regenera e nem manda sozinho: o prompt cai no composer,
   * o corretor lê, ajusta ("igual, mas de noite") e envia. Um botão que
   * gerasse direto seria a única porta do sistema que pula a revisão — e a
   * revisão é o produto.
   */
  const [reaproveitado, setReaproveitado] = useState("");

  function reaproveitar(prompt: string) {
    setReaproveitado(prompt);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
```

E na chamada do `ChatBase`, acrescentar `textoInicial={reaproveitado}`.

- [ ] **Step 2b: Fazer `textoInicial` responder a mudanças**

`ChatBase` hoje só lê `textoInicial` na montagem (ele nasceu para quem chega de outra tela). Reaproveitar acontece com o chat já montado, então o campo não mudaria. Em `ChatBase.tsx`, onde o composer guarda o texto:

```tsx
  /*
   * `textoInicial` também vale DEPOIS da montagem: a galeria do Estúdio
   * reaproveita um prompt com o chat já aberto. Só sobrescreve quando o valor
   * muda de verdade e não é vazio — senão a prop apagaria o que a pessoa está
   * digitando a cada re-render.
   */
  useEffect(() => {
    if (textoInicial) setTexto(textoInicial);
  }, [textoInicial]);
```

Usar o nome real do estado do composer (`grep -n "textoInicial" ChatBase.tsx` mostra qual é).

- [ ] **Step 3: Conferir largura no celular**

O prompt é texto longo dentro de um item de flex. `min-w-0` e `break-words` estão no código acima **de propósito**: sem eles, item de flex tem `min-width: auto` e o texto empurra a largura — a guarda `naoCortaTexto` reprova, e ela já pegou exatamente isso três vezes em 10/09.

```bash
npx vitest run src/app/corretor/naoCortaTexto.test.ts
```
Expected: PASS.

- [ ] **Step 4: Build e olho na tela**

```bash
npm run build
npm run dev
```
Abrir `/corretor/imoveis/criar-imagem` e conferir que as artes antigas mostram o prompt e que "Gerar outra assim" preenche o campo.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/corretor/(painel)/imoveis/criar-imagem/"
git commit -m "feat(imagens): o historico mostra o prompt e deixa reaproveitar"
```

---

### Task 9: apagar o caminho de marketing que nunca produziu uma peça

~1.400 linhas com testes, copy validada por lei, logo e rodapé — e **zero** artes em produção (`arte_url` nulo nas 8 gerações da vida inteira). Sai por decisão do usuário: o produto é chat livre, sem templates. **Esta tarefa vem por último de propósito**: só se apaga o caminho antigo depois que o novo está de pé e verde.

**Files:**
- Delete: `src/lib/imagens/compor.ts`, `src/lib/imagens/compor.test.ts`
- Delete: `src/lib/imagens/marketing.ts`, `src/lib/imagens/marketing.test.ts`
- Delete: `src/lib/imagens/diretorCriativo.ts`
- Delete: `src/app/api/imagens/briefing/route.ts`, `src/app/api/imagens/gerar/arte.test.ts`
- Modify: `src/app/api/imagens/gerar/route.ts` (some o ramo `modo: "arte"`)
- Modify: `src/lib/imagens/imagensTipos.ts` (`BriefingGravado` e o campo `briefing`)

**Interfaces:**
- Consumes: nada.
- Produces: o corpo da rota passa a ter só `prompt`, `tamanho`, `qualidade`, `receita`, `referenciaPath`, `imovelSlug`.

- [ ] **Step 1: Mapear quem ainda importa o que vai sair**

```bash
grep -rn "from \"@/lib/imagens/compor\"\|from \"@/lib/imagens/marketing\"\|from \"@/lib/imagens/diretorCriativo\"\|imagens/briefing" src/ --include=*.ts --include=*.tsx
```
Anotar a lista. Todo arquivo que aparecer aqui precisa ser tratado antes do `git rm`.

- [ ] **Step 2: Tirar o ramo `modo: "arte"` da rota**

Em `src/app/api/imagens/gerar/route.ts`, remover do tipo do corpo os campos `modo`, `objetivo`, `canal`, `publico`, `cena`, `titulo`, `apoio`, `cta`, `usarFotoReal`; remover o bloco `if (modoArte) { … }` inteiro e a variável `arte`; manter `imovelSlug` (é ele que preenche `empreendimento_id`, que a 0101 criou e que hoje está nulo nas 8).

O `prompt` passa a vir sempre do corpo, sem `montarBriefing`:

```ts
  const prompt = (corpo?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ erro: "Escreva o que você quer na imagem." }, { status: 400 });
  }
```

- [ ] **Step 3: Tirar o `briefing` do tipo e da gravação**

`BriefingGravado` sai de `imagensTipos.ts` e o campo `briefing` sai de `ImagemGerada`. A **coluna do banco fica** — apagar coluna com dado dentro é irreversível, e as linhas antigas ainda a têm. Só paramos de escrever e de ler.

- [ ] **Step 4: Apagar**

```bash
git rm src/lib/imagens/compor.ts src/lib/imagens/compor.test.ts \
       src/lib/imagens/marketing.ts src/lib/imagens/marketing.test.ts \
       src/lib/imagens/diretorCriativo.ts \
       src/app/api/imagens/briefing/route.ts \
       src/app/api/imagens/gerar/arte.test.ts
```

- [ ] **Step 5: Rodar tudo — é aqui que aparece quem dependia em silêncio**

```bash
npx tsc --noEmit
env -u OPENAI_API_KEY npm test
npm run build
```
Expected: verde. `receitas.test.ts` tem uma guarda que lê o código dos caminhos de geração; se ela reprovar por causa da rota mudada, **ajustar a guarda à nova forma, não afrouxá-la** — ela protege a cláusula anti-invenção, que continua valendo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(imagens): apaga o caminho de marketing que nunca produziu uma peca"
```

---

### Task 10: fechar a onda

**Files:**
- Modify: `docs/MEMORIA.md`
- Create: `vault/10-notas/o-tradutor-de-prompt-de-imagem.md`
- Modify: `vault/20-mocs/MOC — IA e Atendimento.md`

- [ ] **Step 1: Rodar a esteira inteira, na ordem do `ci.yml`**

```bash
npx tsc --noEmit
env -u OPENAI_API_KEY npm test
npm run build
npx eslint .
```
Expected: tudo verde. (`node scripts/lintTeto.mjs` é MUDO no Windows — `spawnSync npx ENOENT` — então rodar o eslint direto.)

- [ ] **Step 2: Escrever a seção da MEMORIA**

Regra da casa: entra o que "teria me poupado 10+ minutos". Os candidatos desta onda são os números (8 imagens, 0 artes, `Torre.`, `"." em ., Barueri`), o achado de que o prompt era mostrado em inglês num `<p>` não editável, e o resultado da F0.

- [ ] **Step 3: Nota no vault + link no MOC**

Frontmatter completo, vocabulário fechado de tags, `updated` com a data de hoje, e link a partir de pelo menos um MOC — `AGENTS.md` cobra isso.

- [ ] **Step 4: Commit**

```bash
git add docs/MEMORIA.md vault/
git commit -m "docs: o tradutor de prompt de imagem — o que custou tempo"
```

---

## Onda 2 (não planejada ainda, de propósito)

Fica para depois da Task 1: **referências múltiplas** (`image[]` com os papéis "base" e "estilo"), o **anexo de saída esperada** lido por visão, e o **carimbo opcional**. A F0 decide se esse caminho cabe nos 60s da função ou vai para o worker do GitHub Actions — e planejar antes de saber seria planejar sobre hipótese, que é como as ~1.400 linhas de marketing foram escritas sem nunca produzir uma peça.
