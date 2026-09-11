# Estúdio de Imagem Livre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Estúdio de imagem passa a gerar qualquer assunto, com texto livre na imagem, mantendo os dados do catálogo como caminho opcional quando o corretor cita um imóvel.

**Architecture:** Nada é reescrito do zero. Quatro travas saem do caminho da imagem (cláusula anti-texto, objetivo chumbado, gramática de imóvel, carimbo incondicional) e uma fresta que nunca teve chamador ganha um (`textoNaCena`, derivado do texto entre aspas no próprio prompt, na rota — onde vive a versão que o corretor de fato aprovou). `tradutor.ts`, `imovelPorTexto` e `fatosDoImovelCitado` já funcionam e são preservados.

**Tech Stack:** Next.js (App Router), TypeScript, vitest, OpenAI `gpt-image-2`, Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-09-11-estudio-de-imagem-livre-design.md`

## Global Constraints

- **Tudo em português** — prompts, rótulos, comentários. O prompt final aparece na tela para o corretor ler e corrigir; texto que ele não lê é texto que ele não conserta.
- **Guarda que protege decisão de produto é REESCRITA, nunca apagada.** Toda guarda tocada aqui ganha comentário dizendo o que mudou, quando e por quê.
- **Toda guarda nova ou reescrita é PROVOCADA antes de entrar** — morde-se o código, confirma-se que a mordida alterou o arquivo (`md5` antes/depois) e que o teste reprova.
- **`src/lib/imagens/marketing.ts` NÃO É TOCADO.** É compartilhado com o motor de vídeo (`render.ts`, `roteiro.ts`, `marketing/video/acoes.ts`).
- **Módulo importado por componente `"use client"` não pode ter `server-only`** nem dependência nativa — constante é valor, e o build reprova (a pedra de `limitesPdf.ts`).
- **Não mexer em:** teto de 20 imagens/dia por corretor, `qualidade: "low"` como padrão, `TIMEOUT_PADRAO_MS = 45_000`. São custo real e o limite de 60s do plano Hobby.
- **A ressalva legal nunca é pedida ao modelo generativo.** Ela só sai por código, de `carimbo.ts`.
- **Verificação obrigatória ao fim de cada task:** `npx vitest run <arquivos tocados>` e, na última, `npx tsc --noEmit` + `npx next build` + `node scripts/lintTeto.mjs`.

---

### Task 1: O motor para de proibir texto

**Files:**
- Modify: `src/lib/imagens/gerarImagem.ts:42-92` (bloco da cláusula e `promptFinal`)
- Modify: `src/lib/imagens/gerarImagem.ts:136-152` (tipo `PedidoDeImagem`)
- Modify: `src/lib/imagens/gerarImagem.ts:188-191` (montagem do pedido final)
- Test: `src/lib/imagens/receitas.test.ts:53-200` (o `describe("a cláusula anti-invenção")` inteiro)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `promptFinal(pedido: string, textosNaCena?: string[] | null): string`
  - `PedidoDeImagem.textosNaCena?: string[] | null` (substitui `textoNaCena?: string | null`, que não tinha chamador nenhum)

- [ ] **Step 1: Reescrever a guarda — o teste vem antes**

Em `src/lib/imagens/receitas.test.ts`, substituir o `describe("a cláusula anti-invenção", ...)` inteiro (do `describe` até o `});` que o fecha, incluindo os dois `it` de código-fonte sobre a ressalva) por:

```ts
/*
 * Esta guarda MUDOU DE LADO em 11/09/2026, e o registro importa mais que o
 * teste: até aqui ela exigia a cláusula `SEM_TEXTO_ALGUM` em toda geração.
 *
 * A decisão de produto (spec 2026-09-11-estudio-de-imagem-livre) é texto
 * LIVRE na imagem: as peças que o corretor usa como referência são
 * majoritariamente texto, e com a cláusula elas eram impossíveis por
 * construção. O risco aceito está escrito na spec — a IA vai inventar nome,
 * metragem e preço quando achar que a peça pede, e a revisão passa a ser
 * humana.
 *
 * O que a guarda protege AGORA é o que sobrou de invariante: nenhum dos dois
 * caminhos até o provedor manda `pedido.prompt` cru, porque é por
 * `promptFinal` que passa a soletração do texto ditado — e é ela que faz a
 * manchete sair com as palavras certas.
 */
describe("o texto na cena", () => {
  it("sem texto ditado, o prompt vai exatamente como o corretor aprovou", () => {
    // Nada é acrescentado: é isto que faz a ferramenta se comportar como o
    // ChatGPT, que foi o pedido.
    expect(promptFinal("um cachorro vestido de Papai Noel")).toBe(
      "um cachorro vestido de Papai Noel",
    );
  });

  it("não sobrou nenhuma proibição de escrita no prompt", () => {
    for (const r of RECEITAS) {
      const final = promptFinal(montarPedido("uma varanda", r)).toLowerCase();
      expect(final, r.chave).not.toContain("não escreva nada na imagem");
      expect(final, r.chave).not.toContain("letreiros");
    }
  });

  it("com texto ditado, manda soletrar — é a técnica que mediu 2 em 2", () => {
    const final = promptFinal("fachada ao pôr do sol", ["MUDE AINDA ESTE ANO"]);
    expect(final).toContain('"MUDE AINDA ESTE ANO"');
    expect(final.toLowerCase()).toMatch(/caractere por caractere|id[êe]nticos/);
  });

  it("dois textos ditados saem como LISTA, nunca colados", () => {
    // Juntar por barra ou por espaço faria o modelo desenhar o separador
    // dentro da peça — o defeito aparece na imagem, não no teste.
    const final = promptFinal("arte de feed", ["MANACÁ BARUERI", "63 e 81 m²"]);
    expect(final).toContain('"MANACÁ BARUERI"');
    expect(final).toContain('"63 e 81 m²"');
    expect(final).not.toContain("MANACÁ BARUERI / 63");
    expect(final).not.toContain("MANACÁ BARUERI 63");
  });

  it("lista vazia, texto em branco ou nulo não acrescenta nada", () => {
    for (const nada of [[], ["", "   "], null, undefined]) {
      expect(promptFinal("uma varanda", nada)).toBe("uma varanda");
    }
  });

  it("preserva o pedido original", () => {
    expect(promptFinal("uma varanda ao entardecer")).toContain("uma varanda ao entardecer");
  });

  /*
   * As duas guardas abaixo LEEM O CÓDIGO-FONTE, como `gravacaoDeMensagem.test.ts`
   * e `escalaDoPainel.test.ts`, porque a regressão falha CALADA: build passa,
   * tipo passa, a imagem chega bonita na tela.
   */
  it("nenhum dos dois caminhos manda o prompt cru ao provedor", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8");

    // São dois endpoints: criação (JSON) e edição (multipart). Basta um deles
    // voltar a ler `pedido.prompt` para a soletração do texto ditado sumir
    // daquele caminho, e a manchete sair embaralhada só na edição de foto.
    const corpoDaChamada = motor.slice(motor.indexOf("const pedidoFinal"));
    expect(corpoDaChamada).not.toMatch(/prompt:\s*pedido\.prompt/);
    expect(motor).toMatch(/promptFinal\(pedido\.prompt,\s*pedido\.textosNaCena\)/);
  });

  it("a ressalva legal nunca é pedida ao modelo", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8");
    expect(motor).not.toMatch(/meramente ilustrativa/i);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/lib/imagens/receitas.test.ts`
Expected: FAIL — os `it` novos reprovam porque `promptFinal` ainda acrescenta `SEM_TEXTO_ALGUM` e ainda recebe `string`, não `string[]`.

- [ ] **Step 3: Trocar a cláusula pela soletração em `gerarImagem.ts`**

Substituir o bloco que vai de `/**\n * O que o modelo pode escrever na cena` até o fim de `promptFinal` (linhas 42-92) por:

```ts
/**
 * O que o modelo escreve na cena.
 *
 * ## A cláusula existiu, e foi RETIRADA por decisão de produto (11/09/2026)
 *
 * Na primeira geração de verdade desta tela o modelo desenhou uma placa com o
 * nome **"VISTA ALTO"** numa fachada que ninguém batizou. A reação foi proibir
 * todo texto — e isso resolveu a invenção matando uma capacidade central: peça
 * publicitária é feita de texto. Medido em 11/09: `textoNaCena`, a única
 * fresta que permitia escrita, **nunca teve um chamador**, então 100% das
 * imagens saíam sob a proibição e anúncio nenhum era possível.
 *
 * Hoje o modelo escreve livremente. O risco está registrado na spec e foi
 * aceito pelo dono do produto: ele vai inventar nome, metragem e preço quando
 * achar que a peça pede, e **quem publica responde pelo que está escrito**.
 *
 * ## O que sobrou aqui, e por que sobrou
 *
 * Quando o corretor DITA o texto (entre aspas, no próprio pedido), a
 * soletração entra. Não é preciosismo: medido na F0 de 10/09, com o texto
 * entre aspas e soletrado o modelo acertou **2 em 2**, contra 3 em 4 sem a
 * técnica. É a diferença entre a manchete sair certa e sair com letras
 * trocadas.
 *
 * O que precisa ser EXATO continua não vindo por aqui: a ressalva legal de
 * imagem ilustrativa é escrita por código em `carimbo.ts`, sobre a imagem
 * pronta. Três em quatro é ótimo para uma manchete e inaceitável para um
 * aviso legal.
 */
function soOsTextosPedidos(textos: string[]): string {
  /*
   * Cada texto entre aspas, separados por ponto e vírgula. Juntar por barra
   * ou por espaço faz o modelo DESENHAR o separador dentro da peça — o
   * defeito aparece na imagem, onde custa uma geração paga para descobrir.
   */
  const lista = textos.map((t) => `"${t}"`).join("; ");
  const umSo = textos.length === 1;
  return (
    `Escreva na imagem exatamente ${umSo ? "este texto" : "estes textos"}, com a ` +
    `grafia e os acentos idênticos: ${lista}. Reproduza caractere por caractere, ` +
    `sem traduzir, sem reescrever e sem mudar maiúsculas.`
  );
}

/**
 * O prompt que de fato vai para o provedor.
 *
 * Exportada para ser testável sem rede, e é o ponto ÚNICO por onde os dois
 * caminhos passam (criação em JSON e edição em multipart) — chamador novo não
 * tem como escapar dela, que é a mesma razão de `normalizarTelefoneBr` morar
 * no `provider.ts`.
 */
export function promptFinal(pedido: string, textosNaCena?: string[] | null): string {
  const textos = (textosNaCena ?? []).map((t) => t.trim()).filter(Boolean);
  if (textos.length === 0) return pedido.trim();
  return `${pedido.trim()} ${soOsTextosPedidos(textos)}`;
}
```

- [ ] **Step 4: Trocar o campo do tipo `PedidoDeImagem`**

Em `src/lib/imagens/gerarImagem.ts`, substituir o campo `textoNaCena`:

```ts
  /**
   * Os textos que devem aparecer DENTRO da cena, soletrados.
   *
   * Plural porque uma peça real tem manchete e apoio ("MUDE AINDA ESTE ANO" e
   * "63 e 81 m²"), e colá-los numa string só faria o modelo desenhar o
   * separador. Vazio é o caso comum: aí o modelo escreve o que quiser.
   *
   * Quem preenche é a ROTA, a partir do texto entre aspas do prompt que o
   * corretor aprovou — nunca a proposta do chat, que pode estar velha se ele
   * editou o campo antes de gerar.
   */
  textosNaCena?: string[] | null;
```

- [ ] **Step 5: Renomear a variável do pedido final**

Em `src/lib/imagens/gerarImagem.ts:188-191`, trocar:

```ts
  const pedidoFinal: PedidoDeImagem = {
    ...pedido,
    prompt: promptFinal(pedido.prompt, pedido.textosNaCena),
  };
```

E trocar as duas referências seguintes de `comClausula` por `pedidoFinal` (`corpoDeEdicao(pedidoFinal, modelo, tamanho)` e `prompt: pedidoFinal.prompt`). O nome antigo descrevia uma cláusula que não existe mais — comentário e nome que mentem apontam o diagnóstico para o lugar errado, e este projeto já registrou isso sete vezes.

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run src/lib/imagens/receitas.test.ts src/lib/imagens/gerarImagem.test.ts`
Expected: PASS em todos.

- [ ] **Step 7: Provocar a guarda de código-fonte**

```bash
cd "$(git rev-parse --show-toplevel)"
md5sum src/lib/imagens/gerarImagem.ts > /tmp/antes.md5
sed -i 's/prompt: promptFinal(pedido.prompt, pedido.textosNaCena)/prompt: pedido.prompt/' src/lib/imagens/gerarImagem.ts
md5sum -c /tmp/antes.md5 && echo "MORDIDA VAZIA — refazer" || echo "mordida ok"
npx vitest run src/lib/imagens/receitas.test.ts
```
Expected: a mordida altera o arquivo E o teste "nenhum dos dois caminhos manda o prompt cru" REPROVA. Depois: `git checkout src/lib/imagens/gerarImagem.ts` e reaplicar os steps 3-5 (ou `git stash pop` se preferir guardar antes).

- [ ] **Step 8: Commit**

```bash
git add src/lib/imagens/gerarImagem.ts src/lib/imagens/receitas.test.ts
git commit -m "feat(imagens): o modelo pode escrever na imagem

A cláusula SEM_TEXTO_ALGUM entrava em toda geração, e textoNaCena — a
única fresta — nunca teve chamador: peça publicitária era impossível por
construção. Decisão de produto de 11/09 (spec no repositório).

O que fica: quando o corretor DITA o texto, a soletração continua — ela
mediu 2/2 contra 3/4 sem. A guarda de código-fonte foi reescrita para a
regra nova, não apagada."
```

---

### Task 2: O texto entre aspas vira o texto exato da peça

**Files:**
- Create: `src/lib/imagens/textoNaCena.ts`
- Create: `src/lib/imagens/textoNaCena.test.ts`
- Modify: `src/app/api/imagens/gerar/route.ts` (montagem do `PedidoDeImagem`)

**Interfaces:**
- Consumes: `PedidoDeImagem.textosNaCena` (Task 1).
- Produces: `textosEntreAspas(pedido: string): string[]` e `TETO_DE_TEXTOS = 4`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/imagens/textoNaCena.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { textosEntreAspas, TETO_DE_TEXTOS } from "./textoNaCena";

describe("textosEntreAspas", () => {
  it("acha a manchete ditada entre aspas retas", () => {
    expect(textosEntreAspas('fachada ao pôr do sol com a manchete "MUDE AINDA ESTE ANO"')).toEqual([
      "MUDE AINDA ESTE ANO",
    ]);
  });

  it("acha também com aspas curvas, que é o que o celular digita", () => {
    // O teclado do iOS e do Android troca " por “ ” sozinho. Aceitar só a
    // aspa reta faria a técnica falhar exatamente para quem usa o painel no
    // telefone, que é todo mundo aqui.
    expect(textosEntreAspas("arte com o texto “PRONTO PARA MORAR”")).toEqual(["PRONTO PARA MORAR"]);
  });

  it("devolve manchete e apoio, na ordem em que foram escritos", () => {
    expect(
      textosEntreAspas('post com "MANACÁ BARUERI" em cima e "63 e 81 m²" embaixo'),
    ).toEqual(["MANACÁ BARUERI", "63 e 81 m²"]);
  });

  it("apóstrofo não é aspas", () => {
    // "d'água", "n'água" e aspas simples de ênfase apareceriam como texto
    // ditado — e o modelo desenharia uma palavra solta na peça.
    expect(textosEntreAspas("marca d'água discreta no canto")).toEqual([]);
    expect(textosEntreAspas("uma sala 'moderna' com luz natural")).toEqual([]);
  });

  it("pedido sem aspas nenhuma devolve lista vazia", () => {
    // É o caso comum, e é o que faz a ferramenta se comportar como o ChatGPT.
    expect(textosEntreAspas("um cachorro vestido de Papai Noel")).toEqual([]);
  });

  it("aspas vazias ou de um caractere não contam", () => {
    expect(textosEntreAspas('arte com "" e "a" no canto')).toEqual([]);
  });

  it("apara espaço nas beiradas e descarta duplicata", () => {
    expect(textosEntreAspas('"  ÚLTIMAS UNIDADES  " e de novo "ÚLTIMAS UNIDADES"')).toEqual([
      "ÚLTIMAS UNIDADES",
    ]);
  });

  it("teto de textos: peça com dez frases é layout, não imagem", () => {
    const dez = Array.from({ length: 10 }, (_, i) => `"TEXTO ${i}"`).join(" ");
    expect(textosEntreAspas(dez)).toHaveLength(TETO_DE_TEXTOS);
    expect(TETO_DE_TEXTOS).toBe(4);
  });

  it("aspas abertas e não fechadas não viram texto", () => {
    expect(textosEntreAspas('uma fachada com "MUDE AINDA')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/lib/imagens/textoNaCena.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Escrever o módulo**

Criar `src/lib/imagens/textoNaCena.ts`:

```ts
/**
 * O texto que o corretor DITOU para aparecer na imagem.
 *
 * ## Por que aspas, e por que isto existe
 *
 * Com a cláusula anti-texto retirada (11/09/2026), o modelo escreve o que
 * quiser — e é isso que se quer na maior parte dos pedidos. Mas quando a peça
 * tem uma manchete que precisa sair CERTA, "o que quiser" não serve: medido na
 * F0 de 10/09, o modelo acerta o texto literal 3 em 4 quando ele aparece solto
 * no pedido, e **2 em 2** quando vem entre aspas e soletrado.
 *
 * As aspas são a convenção mais barata que existe: ninguém precisa aprender
 * campo novo, e quem não souber da regra continua sendo atendido — sem aspas,
 * nada é ditado.
 *
 * Módulo PURO, sem `server-only`: a tela é `"use client"` e pode querer
 * mostrar o que foi reconhecido. Constante é valor (a pedra do `limitesPdf.ts`).
 */

/**
 * Quantos textos no máximo.
 *
 * Quatro cobre manchete, apoio, selo e chamada — a anatomia das peças reais
 * que serviram de referência. Acima disso o pedido é um LAYOUT, e layout não
 * se resolve pedindo mais texto a um gerador de imagem: sai amontoado, e a
 * geração é paga.
 */
export const TETO_DE_TEXTOS = 4;

/** Abaixo disto não é texto de peça: é aspa de ênfase ou resto de digitação. */
const MINIMO_DE_CARACTERES = 2;

/*
 * Só aspas DUPLAS, retas ou curvas. Aspas simples ficam de fora de propósito:
 * "marca d'água" e "uma sala 'moderna'" viram texto ditado, e aí o modelo
 * desenha a palavra solta dentro da peça. O erro é assimétrico — não
 * reconhecer custa um pedido menos preciso; reconhecer errado suja a imagem.
 */
const ASPAS = /"([^"]+)"|“([^”]+)”/g;

export function textosEntreAspas(pedido: string): string[] {
  const achados: string[] = [];
  for (const casamento of pedido.matchAll(ASPAS)) {
    const texto = (casamento[1] ?? casamento[2] ?? "").trim();
    if (texto.length < MINIMO_DE_CARACTERES) continue;
    // Duplicata é repetição de quem reforçou o pedido, não um segundo texto.
    if (achados.includes(texto)) continue;
    achados.push(texto);
    if (achados.length === TETO_DE_TEXTOS) break;
  }
  return achados;
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/lib/imagens/textoNaCena.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Ligar na rota**

Em `src/app/api/imagens/gerar/route.ts`, acrescentar o import:

```ts
import { textosEntreAspas } from "@/lib/imagens/textoNaCena";
```

E, na montagem do pedido que vai para `gerarImagem`, acrescentar o campo:

```ts
    /*
     * O texto ditado sai do PROMPT QUE VAI SER GERADO, não da proposta do
     * chat: se o corretor editou o campo antes de clicar em gerar, foi a
     * versão dele que ele aprovou — e derivar aqui é o que garante que as
     * duas coisas nunca divirjam (a lição do `turnoDeAtendimento`).
     */
    textosNaCena: textosEntreAspas(prompt),
```

Onde `prompt` é a variável que a rota já usa como prompt final do corretor. Se o nome local for outro (`corpo.prompt`, `promptDoCorretor`), usar o mesmo — conferir com `grep -n "prompt" src/app/api/imagens/gerar/route.ts` antes de editar.

- [ ] **Step 6: Verificar tipo e rodar**

Run: `npx tsc --noEmit 2>&1 | grep -E "imagens|route" ; npx vitest run src/lib/imagens/`
Expected: nenhum erro de tipo nos arquivos de imagem; testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/imagens/textoNaCena.ts src/lib/imagens/textoNaCena.test.ts src/app/api/imagens/gerar/route.ts
git commit -m "feat(imagens): texto entre aspas no pedido vira o texto exato da peça

textoNaCena existia sem chamador desde que foi escrito. Agora a rota o
deriva do prompt aprovado — aspas duplas, retas ou curvas, teto de 4.

Sem aspas nada é ditado, que é o comportamento 'como o ChatGPT' pedido;
com aspas, a soletração garante a manchete (2/2 medido na F0 de 10/09)."
```

---

### Task 3: O Estúdio para de assumir que todo pedido é de imóvel

**Files:**
- Modify: `src/lib/estudio/turno.ts:176-220` (bloco das perguntas e cálculo de `imovelCitado`)
- Modify: `src/lib/estudio/turno.ts:39` (comentário desatualizado sobre `problemasDaCopy`)
- Modify: `src/lib/imagens/engenheiroDePrompt.ts:91-133` (assinatura e preâmbulo do prompt)
- Test: `src/lib/estudio/estudio.test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `perguntarOQueFalta(params: { ideia: string; objetivo: string; formato: string; temReferencia: boolean; dominio: "imovel" | "livre" })`.

- [ ] **Step 1: Escrever o teste**

Acrescentar a `src/lib/estudio/estudio.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("o Estúdio não assume que todo pedido é de imóvel", () => {
  /*
   * Guarda de código-fonte, como as outras desta base, porque a regressão
   * falha CALADA: quem pedir "um cachorro vestido de Papai Noel" recebe
   * perguntas sobre apartamento, a imagem sai parecida com imóvel, e nada
   * no build ou no tipo reclama.
   */
  const turno = readFileSync(join(process.cwd(), "src/lib/estudio/turno.ts"), "utf8");
  const engenheiro = readFileSync(
    join(process.cwd(), "src/lib/imagens/engenheiroDePrompt.ts"),
    "utf8",
  );

  it("o objetivo do briefing não é literal chumbado", () => {
    expect(turno).not.toMatch(/objetivo:\s*"peça de marketing de um imóvel"/);
    expect(turno).toMatch(/objetivo:\s*objetivoDoBriefing/);
  });

  it("o imóvel citado é resolvido ANTES do bloco de perguntas", () => {
    // A ordem é o defeito: hoje `imovelCitado` é calculado depois, então o
    // briefing nunca soube se havia imóvel. É pura e sem LLM — não custa nada
    // subir.
    expect(turno.indexOf("const imovelCitado")).toBeLessThan(turno.indexOf("podePerguntar"));
  });

  it("o preâmbulo do engenheiro deixa de afirmar que a peça é imobiliária", () => {
    expect(engenheiro).not.toMatch(/trabalhando\s*\n?para uma imobiliária/);
    expect(engenheiro).toMatch(/dominio/);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/lib/estudio/estudio.test.ts`
Expected: FAIL nos três `it` novos.

- [ ] **Step 3: Subir `imovelCitado` e derivar o objetivo em `turno.ts`**

Mover o bloco abaixo (hoje em `turno.ts:210-216`) para ANTES da linha `const pediuParaIr = ehConfirmacao(params.mensagem);`, e acrescentar o objetivo derivado:

```ts
  /*
   * As heurísticas leem a ideia MAIS as escolhas de chip. Sem isso, quem
   * responde "Story" tocando na alternativa recebia uma peça quadrada: a
   * escolha ficava fora de `ideiaAcumulada` por construção, e `tamanhoDoTexto`
   * nunca a via. Só o que o corretor DIGITOU continua servindo para achar o
   * imóvel — alternativa curta ("Manhã", "Alta") casaria com nome de
   * empreendimento por acidente, que é um falso positivo já medido nesta base.
   */
  const textoDaHeuristica = [ideia, ...respostas.map((r) => r.escolha)].join(". ");
  /*
   * O imóvel que o corretor CITOU. Sem LLM: `imovelPorTexto` casa por nome e
   * por apelido, então "Manacá" acha o "More na Aldeia de Barueri". É o único
   * diferencial real sobre o ChatGPT — ele não tem esta ficha nem estas fotos.
   *
   * É resolvido AQUI, antes das perguntas, e não depois: é dele que sai o
   * domínio do briefing. Até 11/09/2026 ele era calculado só na hora de
   * montar a proposta, então o engenheiro de perguntas tratava TODO pedido
   * como anúncio de apartamento — inclusive um cachorro de Papai Noel.
   */
  const imovelCitado = imovelPorTexto(ideia, params.imoveis);
  const objetivoDoBriefing = imovelCitado
    ? "peça de marketing de um imóvel"
    : "imagem livre, do assunto que o corretor descreveu";
```

Em seguida, no bloco `if (podePerguntar)`, trocar as duas linhas:

```ts
      objetivo: objetivoDoBriefing,
      dominio: imovelCitado ? "imovel" : "livre",
```

E apagar as linhas duplicadas de `textoDaHeuristica` e `imovelCitado` que ficaram no lugar antigo (logo antes de `const tamanho = tamanhoDoTexto(textoDaHeuristica);`), mantendo o `const tamanho` e o `const receita` onde estão.

- [ ] **Step 4: Generalizar o preâmbulo do engenheiro**

Em `src/lib/imagens/engenheiroDePrompt.ts`, trocar a assinatura:

```ts
export async function perguntarOQueFalta(params: {
  ideia: string;
  objetivo: string;
  formato: string;
  temReferencia: boolean;
  /**
   * De que assunto é o pedido.
   *
   * `"imovel"` só quando o corretor CITOU um empreendimento do catálogo.
   * Fora disso o briefing não pode falar como se a peça fosse de imóvel: o
   * preâmbulo antigo afirmava "trabalhando para uma imobiliária" em TODO
   * pedido, e era ele que fazia um cachorro de Papai Noel receber perguntas
   * sobre apartamento.
   */
  dominio: "imovel" | "livre";
}): Promise<Pergunta[]> {
```

E trocar as duas frases do prompt. Primeira linha:

```ts
  const preambulo =
    params.dominio === "imovel"
      ? `Você é engenheiro de prompt para geradores de imagem, trabalhando para uma
imobiliária. Um corretor descreveu o que quer, mas de forma incompleta.`
      : `Você é engenheiro de prompt para geradores de imagem. Quem pediu descreveu o
que quer, mas de forma incompleta. O assunto é o que ELE escreveu — não presuma
que a imagem é de imóvel, de marketing ou de qualquer tema em particular.`;

  const prompt = `${preambulo}

O que ele escreveu: "${ideia}"
```

E, mais abaixo, a linha do vocabulário:

```ts
- Uma linha, direta, em português, no vocabulário de quem ${
    params.dominio === "imovel" ? "vende imóvel" : "pediu a imagem"
  } — não de quem opera software.
```

- [ ] **Step 5: Corrigir o comentário desatualizado de `turno.ts:39`**

O comentário afirma que a régua de lei na copy (`problemasDaCopy`) faz parte deste caminho. Conferido em 11/09: `problemasDaCopy` só é chamado por `marketing/video/acoes.ts` — o caminho da imagem não passa por ele. Trocar a frase para:

```
 * `gerarImagem.ts`, fora daqui). A régua de lei na copy (`problemasDaCopy`)
 * NÃO vale aqui: ela é do motor de vídeo, e com texto livre na imagem a
 * conferência do que está escrito na peça é humana (spec de 11/09/2026).
```

Comentário que descreve garantia inexistente é pior que comentário nenhum — é a sétima vez que isto aparece nesta base.

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run src/lib/estudio/ src/lib/imagens/`
Expected: PASS. Se algum teste existente chamava `perguntarOQueFalta` sem `dominio`, o compilador aponta: acrescentar `dominio: "imovel"` nesses casos (era o comportamento antigo).

- [ ] **Step 7: Provocar a guarda**

```bash
md5sum src/lib/estudio/turno.ts > /tmp/antes2.md5
sed -i 's/objetivo: objetivoDoBriefing/objetivo: "peça de marketing de um imóvel"/' src/lib/estudio/turno.ts
md5sum -c /tmp/antes2.md5 && echo "MORDIDA VAZIA — refazer" || echo "mordida ok"
npx vitest run src/lib/estudio/estudio.test.ts
git checkout src/lib/estudio/turno.ts
```
Expected: mordida altera o arquivo, o teste "o objetivo do briefing não é literal chumbado" REPROVA. Depois reaplicar os steps 3 e 5.

- [ ] **Step 8: Commit**

```bash
git add src/lib/estudio/turno.ts src/lib/imagens/engenheiroDePrompt.ts src/lib/estudio/estudio.test.ts
git commit -m "feat(estudio): o briefing deixa de assumir que todo pedido é de imóvel

O objetivo era literal chumbado e o preâmbulo do engenheiro afirmava
'trabalhando para uma imobiliária' em todo pedido — era isso que fazia um
cachorro de Papai Noel receber perguntas sobre apartamento.

imovelCitado passa a ser resolvido ANTES das perguntas (é puro, sem LLM,
não custa nada) e é ele que decide o domínio. E o comentário que dizia
que problemasDaCopy valia neste caminho foi corrigido: ele é do vídeo."
```

---

### Task 4: A gramática confere o que vale para qualquer imagem

**Files:**
- Modify: `src/lib/imagens/gramatica.ts:78-101` (`MARCAS` e `conferir`)
- Test: `src/lib/imagens/gramatica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `conferir(prompt: string): ChaveSecao[]` — passa a devolver apenas chaves de `CONFERIDAS` (`"cena"` e `"detalhes"`). `SECOES` e `ChaveSecao` seguem com os quatro valores.

- [ ] **Step 1: Escrever o teste**

Acrescentar a `src/lib/imagens/gramatica.test.ts`:

```ts
describe("a conferência serve a qualquer assunto", () => {
  it("pedido fora de imóveis não é acusado de faltar sujeito", () => {
    /*
     * As MARCAS de `sujeito` eram a lista `fachada|prédio|sala|piscina…`, e
     * `restricoes` exigia uma negação. Um pedido legítimo de outro assunto
     * saía com duas dicas de erro — e este projeto já perdeu tempo CINCO
     * vezes com critério que reprova o comportamento certo.
     */
    const pedido =
      "Retrato fotográfico de um cachorro golden retriever vestido de Papai Noel, " +
      "sentado em um tapete, plano médio frontal, luz quente de fim de tarde " +
      "entrando pela janela, sombras suaves e textura de pelo bem definida.";
    expect(conferir(pedido)).toEqual([]);
  });

  it("ainda dá as duas dicas que valem para qualquer imagem", () => {
    // Sem enquadramento e sem luz, qualquer imagem sai pior — inclusive a de
    // cachorro. É por isso que estas duas continuam.
    const semNada =
      "Um cachorro golden retriever vestido de Papai Noel sentado em um tapete " +
      "de sala com enfeites de Natal espalhados ao redor dele no chão.";
    expect(conferir(semNada).sort()).toEqual(["cena", "detalhes"]);
  });

  it("nunca devolve sujeito nem restricoes — não são universais", () => {
    for (const texto of ["", "x".repeat(200), "fachada ao pôr do sol, plano frontal, luz quente"]) {
      expect(conferir(texto)).not.toContain("sujeito");
      expect(conferir(texto)).not.toContain("restricoes");
    }
  });

  it("as quatro seções continuam na instrução mandada ao motor", () => {
    // O texto FINAL ainda deve conter sujeito e restrições; o que mudou é o
    // que a tela cobra de volta como dica.
    const instrucao = instrucaoDaGramatica();
    for (const s of SECOES) expect(instrucao).toContain(s.rotulo);
  });

  it("abaixo do piso, cobra as duas conferidas e não as quatro", () => {
    expect(conferir("um gato").sort()).toEqual(["cena", "detalhes"]);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/lib/imagens/gramatica.test.ts`
Expected: FAIL — `conferir` ainda devolve `sujeito` e `restricoes`.

- [ ] **Step 3: Reduzir o que é conferido**

Em `src/lib/imagens/gramatica.ts`, acrescentar depois de `SECOES` e substituir `MARCAS`/`conferir`:

```ts
/**
 * O que a tela cobra de volta como dica.
 *
 * Eram as quatro seções, com `sujeito` casando uma lista de imóveis
 * (`fachada|prédio|sala|piscina…`) e `restricoes` exigindo uma negação. Com o
 * Estúdio aberto a qualquer assunto (11/09/2026), as duas passaram a acusar o
 * comportamento CERTO: um retrato de cachorro não tem "fachada" e não precisa
 * de proibição nenhuma.
 *
 * Sobraram as duas que melhoram QUALQUER imagem — enquadramento e luz. As
 * quatro seções continuam na instrução mandada ao motor: elas dizem o que o
 * texto deve CONTER, e isso não mudou. O que mudou é o que se cobra de volta.
 *
 * O erro aqui é assimétrico, e esta base já pagou por ele cinco vezes (Leblon,
 * preco-mais-barato, ofereceVisita, deveFazerPergunta, afirmaPrazo): acusar de
 * menos custa uma dica que não apareceu; acusar de mais manda o corretor
 * consertar o que já estava certo.
 */
const CONFERIDAS = ["cena", "detalhes"] as const satisfies readonly ChaveSecao[];

const MARCAS: Record<(typeof CONFERIDAS)[number], RegExp> = {
  cena: /\b(vista|plano|enquadr|ângulo|angulo|contra-plong|close|panor|fotografia|render|ilustra|retrato|aérea|aerea|frontal|lateral|grande-angular|lente|composi)\w*/i,
  detalhes:
    /\b(luz|iluminad|sol|manhã|manha|tarde|entardecer|noite|golden|sombra|concreto|vidro|madeira|mármore|marmore|porcelanato|cor|paleta|textura|céu|ceu|nublado|difus)\w*/i,
};

export function conferir(prompt: string): ChaveSecao[] {
  const texto = prompt.trim();
  if (texto.length < PISO_DE_PROMPT) return [...CONFERIDAS];
  return CONFERIDAS.filter((chave) => !MARCAS[chave].test(texto));
}
```

(`retrato` entra na marca de `cena` porque é enquadramento de gente e de animal — sem ele o teste do cachorro cobraria uma dica que o pedido já responde.)

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/lib/imagens/gramatica.test.ts`
Expected: PASS. Testes antigos que esperavam `sujeito`/`restricoes` na saída de `conferir` precisam ser atualizados — e cada um ganha, no lugar, uma linha dizendo por que a seção saiu da conferência.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imagens/gramatica.ts src/lib/imagens/gramatica.test.ts
git commit -m "fix(imagens): a gramática deixa de acusar pedido fora de imóveis

MARCAS.sujeito casava uma lista de imóveis e restricoes exigia negação —
com o Estúdio aberto a qualquer assunto, as duas reprovavam comportamento
certo (sexto caso desta base). Sobraram enquadramento e luz, que melhoram
qualquer imagem. As quatro seções continuam na instrução ao motor."
```

---

### Task 5: A ressalva legal só carimba peça de imóvel

**Files:**
- Modify: `src/app/api/imagens/gerar/route.ts:170-181` (chamada de `carimbarRessalva`)
- Test: `src/lib/imagens/receitas.test.ts` (a guarda de código-fonte "a rota CARIMBA a ressalva")

**Interfaces:**
- Consumes: `empreendimentoId: string | null`, já resolvido na rota antes da geração (`route.ts:73-87` e `:135`).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Reescrever a guarda**

Em `src/lib/imagens/receitas.test.ts`, substituir o `it("a rota CARIMBA a ressalva, e antes de guardar o arquivo", ...)` por:

```ts
  it("a rota carimba a ressalva quando a peça é de um imóvel, e antes de guardar", () => {
    const rota = readFileSync(join(process.cwd(), "src/app/api/imagens/gerar/route.ts"), "utf8");

    /*
     * A ressalva passou a ser CONDICIONAL em 11/09/2026: numa imagem sem
     * vínculo com empreendimento (um cachorro de Papai Noel) ela é ruído, e
     * aviso que aparece onde não se aplica ensina a ignorar aviso. Em peça de
     * imóvel ela continua obrigatória — é o que separa perspectiva
     * ilustrativa de promessa ao consumidor.
     */
    expect(rota).toMatch(/empreendimentoId\s*\?\s*await carimbarRessalva\(/);

    /*
     * Antes do upload, não depois: carimbar depois deixaria no bucket uma
     * versão sem aviso, e é o arquivo do bucket que a galeria mostra e que o
     * corretor baixa. O hash também sai dos bytes JÁ carimbados.
     */
    expect(rota.indexOf("carimbarRessalva(")).toBeLessThan(rota.indexOf(".upload("));
    expect(rota.indexOf("carimbarRessalva(")).toBeLessThan(rota.indexOf("createHash("));
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/lib/imagens/receitas.test.ts`
Expected: FAIL no `it` reescrito — a chamada de hoje é incondicional.

- [ ] **Step 3: Tornar o carimbo condicional**

Em `src/app/api/imagens/gerar/route.ts`, trocar a linha do carimbo:

```ts
  /*
   * A ressalva legal entra AQUI, por código, antes de a imagem existir como
   * arquivo — e SÓ quando a peça está vinculada a um empreendimento.
   *
   * É ela que separa uma perspectiva ilustrativa de uma promessa ao cliente,
   * então em anúncio de imóvel é obrigatória. Numa imagem sem vínculo
   * (11/09/2026: o Estúdio passou a aceitar qualquer assunto) ela é ruído, e
   * aviso que aparece onde não se aplica ensina a ignorar aviso — a mesma
   * régua do `evolucaoConversa` e da faixa de queda de conexão.
   *
   * Nunca se pede ao modelo: ele acerta o literal 3 em 4, ótimo para manchete
   * e inaceitável para aviso legal. Carimbar antes do hash é de propósito — o
   * que é guardado, o que a galeria mostra e o que o corretor baixa passam a
   * ser o MESMO arquivo.
   */
  const marcada = empreendimentoId
    ? await carimbarRessalva(resultado.bytes, resultado.mime)
    : { bytes: resultado.bytes, mime: resultado.mime, carimbada: false };
```

Conferir com `grep -n "carimbada" src/app/api/imagens/gerar/route.ts src/lib/imagens/carimbo.ts` que o formato do objeto bate com o tipo `Carimbada` (campos `bytes`, `mime`, `carimbada`). Se `Carimbada` tiver outros campos, montar o objeto com os mesmos nomes — o compilador aponta.

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/lib/imagens/ && npx tsc --noEmit 2>&1 | grep -E "imagens|route"`
Expected: testes PASS, nenhum erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/imagens/gerar/route.ts src/lib/imagens/receitas.test.ts
git commit -m "feat(imagens): a ressalva legal só carimba peça vinculada a imóvel

Com o Estúdio aberto a qualquer assunto, 'Imagem gerada por IA, meramente
ilustrativa' num cachorro de Papai Noel é ruído — e aviso que aparece
onde não se aplica ensina a ignorar aviso. Em peça de imóvel segue
obrigatória, por código, antes do upload e antes do hash."
```

---

### Task 6: A tela diz de quem é a revisão

**Files:**
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx` (aviso junto ao botão de gerar)
- Modify: `src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx` (as `SUGESTOES`, linhas 50-55)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escrever o aviso**

Acrescentar, no cartão da proposta, logo abaixo do campo do prompt editável (mesma região onde hoje aparecem as dicas de `naoCobriu`), uma linha fixa:

```tsx
<p className="text-fluid-xs text-apoio mt-2">
  A IA pode escrever texto na imagem — inclusive nome, metragem e preço que
  ela inventou. <strong className="text-titulo">Confira o que está escrito
  antes de publicar.</strong>
</p>
```

Fixo, não condicional: o risco vale para toda geração, e aviso que aparece só às vezes ensina que a ausência dele é garantia (a mesma razão do aviso de invenção ter nascido fixo em 03/09).

- [ ] **Step 2: Trocar as sugestões, que ensinam o formato**

Substituir as `SUGESTOES` por quatro que mostram o que a ferramenta passou a fazer — inclusive o ditado por aspas e um assunto fora de imóveis:

```tsx
const SUGESTOES = [
  'Arte de feed com a manchete "MUDE AINDA ESTE ANO"',
  "Fachada ao pôr do sol para o feed",
  "Ambiente decorado do zero: sala integrada",
  "Um cachorro vestido de Papai Noel, foto de estúdio",
] as const;
```

A primeira ensina a convenção das aspas sem nenhum texto de ajuda: tocar nela, ver a manchete sair certa, e a regra fica aprendida. A última diz, sem explicar, que o assunto não precisa ser imóvel.

- [ ] **Step 3: Conferir que não corta nem rola de lado no celular**

Run: `npx vitest run src/app/corretor/naoCortaTexto.test.ts src/app/corretor/naoRolaDeLado.test.ts`
Expected: PASS. Se `naoCortaTexto` reprovar o parágrafo novo, é `min-w-0` faltando no item de flex que o contém — não afrouxar a guarda.

- [ ] **Step 4: Verificação final completa**

```bash
npx tsc --noEmit
npx vitest run
node scripts/lintTeto.mjs
npx next build
```
Expected: os quatro verdes. Se `tsc` ou `build` reprovarem em arquivo que esta task não tocou, conferir `git status` — outra sessão pode estar editando o mesmo repositório (já aconteceu em 10 e 11/09), e nesse caso o defeito não é desta mudança.

- [ ] **Step 5: Commit**

```bash
git add "src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx"
git commit -m "feat(estudio): a tela diz que a revisão do texto é humana

Com texto livre na imagem, problemasDaCopy não alcança o que o modelo
desenhou (ninguém lê texto dentro de PNG sem OCR). O aviso é fixo: o
risco vale para toda geração.

As sugestões passam a ensinar as duas capacidades novas — texto ditado
entre aspas e assunto fora de imóveis."
```

---

### Task 7: Registrar no vault e na MEMORIA

**Files:**
- Create: `vault/10-notas/a-clausula-anti-texto-impedia-o-produto.md`
- Modify: `vault/20-mocs/MOC — Ingestão de Mídia.md` (ou `MOC — Lições Gerais.md`, se a nota couber melhor lá)
- Modify: `docs/MEMORIA.md` (seção nova no fim)

**Interfaces:**
- Consumes: tudo o que as tasks 1-6 decidiram.
- Produces: nada de código.

- [ ] **Step 1: Escrever a nota atômica**

Frontmatter completo, com o vocabulário fechado de `vault/10-notas/vocabulario-de-tags.md`: `tags: [midia, licao]`, `type: nota`, `status: growing`, `custou: medio`, `codigo` com os arquivos tocados, `created`/`updated: 2026-09-11`, `fonte: spec 2026-09-11-estudio-de-imagem-livre-design.md`.

O corpo precisa carregar os três fatos que custariam tempo para redescobrir:

1. **`textoNaCena` nunca teve chamador** — 100% das gerações carregavam a cláusula anti-texto, e peça publicitária era impossível por construção. Décimo caso de "construído e nunca ligado" nesta base.
2. **A proibição foi RETIRADA por decisão de produto**, com o risco aceito e escrito: a IA inventa nome, metragem e preço, e quem publica responde.
3. **Aspas duplas são a convenção do texto ditado**, e a soletração mediu 2/2 contra 3/4. Aspas simples ficam de fora porque "marca d'água" viraria texto na peça.

- [ ] **Step 2: Linkar de um MOC**

Acrescentar a linha `- [[a-clausula-anti-texto-impedia-o-produto]] — a fresta que permitia texto nunca teve chamador (11/09)` no MOC escolhido, e atualizar o `updated` do frontmatter dele.

- [ ] **Step 3: Acrescentar a seção na MEMORIA**

Seção nova no fim de `docs/MEMORIA.md`, no tom do arquivo (fato medido, não narrativa), cobrindo além dos três acima: que a gramática reprovava pedido fora de imóveis (sexto caso de critério que reprova o certo), que o objetivo do briefing era literal chumbado, e que a ressalva legal passou a ser condicional com a régua de "aviso onde não se aplica ensina a ignorar aviso".

- [ ] **Step 4: Commit**

```bash
git add vault/ docs/MEMORIA.md
git commit -m "docs: o que a abertura do Estúdio de imagem ensinou"
```

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| 1. `gerarImagem.ts` — cláusula deixa de ser padrão | Task 1 |
| 2. `receitas.test.ts` — guarda reescrita | Task 1 (e Task 5 para a metade do carimbo) |
| 3. `turno.ts` — objetivo derivado | Task 3 |
| 3b. `textoNaCena` ganha chamador | Task 2 |
| 4. `gramatica.ts` — conferência genérica, nunca bloqueio | Task 4 |
| 5. Carimbo condicional | Task 5 |
| Risco 2 — revisão legal é humana (tela diz em uma linha) | Task 6 |
| Testes: caso do cachorro, caso com imóvel, caso com texto ditado | Tasks 1, 2, 4 |
| Vault + MEMORIA (obrigatório pelo AGENTS.md) | Task 7 |

**Fora de escopo, conforme a spec:** `marketing.ts`, motor de vídeo, OCR, arte composta por código.

**Consistência de tipos:** `textosNaCena?: string[] | null` é definido na Task 1 e consumido na Task 2 com o mesmo nome; `promptFinal(pedido, textosNaCena)` tem a mesma assinatura nas duas; `dominio: "imovel" | "livre"` é definido e consumido na Task 3; `conferir` devolve `ChaveSecao[]` (tipo inalterado) na Task 4.

**Um ponto que o executor vai encontrar e o plano já avisa:** o nome da variável do prompt na rota (Task 2, Step 5) precisa ser conferido por `grep` antes da edição — a rota tem `corpo.prompt` e uma variável local, e escolher a errada faria o texto ditado sair do pedido velho.
