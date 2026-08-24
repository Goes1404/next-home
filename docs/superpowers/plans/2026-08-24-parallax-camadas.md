# Parallax e camadas no site público — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar profundidade em camadas ao site público — parallax cinematográfico no desktop, reduzido no celular — sem mover alvos de clique, mapas, players ou formulários.

**Architecture:** Um controlador central (`controladorCamadas.ts`) mantém UM laço no ticker do GSAP (o mesmo que o Lenis já usa) e um `IntersectionObserver`; elementos se registram e recebem escrita de `transform` por `quickSetter`. A matemática vive separada numa função pura (`camadasCalculo.ts`), que é o que os testes exercitam. Componentes consomem via `<Camada>` ou o hook `useCamada`.

**Tech Stack:** Next.js 16.2.12 (App Router), React 19 (`ViewTransition`), GSAP 3.15 (ScrollTrigger, SplitText), Lenis 1.3, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-parallax-camadas-design.md`

## Global Constraints

- **Só `transform` e `opacity`.** Nenhum `top`, `left`, `margin`, `width` ou `height` animado.
- **Um dono por opacidade e um dono por transform.** Elemento dentro de `<Reveal>` NUNCA recebe camada no mesmo nó. O padrão correto é `<Camada><Reveal>…</Reveal></Camada>`.
- **Nada `position: fixed` dentro de elemento com `transform` ou `backdrop-filter`.** `transform` cria containing block. Já mordeu 3x neste projeto (Lightbox, prévia do Lazer, MenuMobile).
- **Nada `position: sticky` dentro de uma `Camada`.** Mesma causa: o containing block muda e o elemento para de grudar. Vale para a coluna da foto no `Sobre` (`lg:sticky lg:top-28`) e para o `NavAncoras`.
- **`CtaFinal` e os formulários NÃO mudam.** São conversão; movimento contínuo atrás de um botão atrapalha o clique. Ausência deles nas tarefas é decisão, não esquecimento.
- **`cn` (twMerge) descarta `text-fluid-*`.** Em `className` que carregue escala fluida, juntar cru: `[a, b].filter(Boolean).join(" ")`.
- **Contrato `.gsap-pending`** (`src/app/globals.css:723`): nasce invisível, `.no-js` / `.motion-off` devolvem a opacidade. Camadas NÃO usam esse contrato — nascem visíveis e só deslocam.
- **Nenhum `requestAnimationFrame` novo.** Tudo no `gsap.ticker`, que o `SmoothScroll.tsx` já dirige.
- **Redução mobile:** abaixo de 768px, velocidade a 40%. `prefers-reduced-motion` (ou a classe `.motion-off`) zera tudo.
- **Idioma:** identificadores, comentários e mensagens de commit em português, como o resto do repositório.
- Rodar `npm test` e `npx tsc --noEmit` antes de cada commit.

---

### Task 1: Matemática das camadas (pura, testável)

**Files:**
- Create: `src/components/motion/camadasCalculo.ts`
- Test: `src/components/motion/camadasCalculo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type EixoCamada = "x" | "y"`; `type Ambiente = { desktop: boolean; reduzido: boolean }`; `progressoNaViewport(inicio: number, tamanho: number, janela: number): number`; `deslocamentoDe(progresso: number, velocidade: number, referencia: number): number`; `fatorDoAmbiente(ambiente: Ambiente): number`; `FATOR_MOBILE = 0.4`.

- [ ] **Step 1: Write the failing test**

Create `src/components/motion/camadasCalculo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deslocamentoDe,
  fatorDoAmbiente,
  FATOR_MOBILE,
  progressoNaViewport,
} from "./camadasCalculo";

/**
 * A régua do parallax é decisão de produto: se o progresso deixar de ser 0
 * no centro da tela, toda camada passa a nascer deslocada e as fotos entram
 * na viewport já fora do lugar. Sem teste, um ajuste de constante desfaz
 * isso em silêncio — mesma razão de `transicaoGlobo.test.ts`.
 */
describe("progresso na viewport", () => {
  const JANELA = 800;
  const ALTURA = 400;

  it("é zero quando o elemento está centrado na tela", () => {
    const topo = JANELA / 2 - ALTURA / 2;
    expect(progressoNaViewport(topo, ALTURA, JANELA)).toBeCloseTo(0, 5);
  });

  it("é -1 no instante em que o elemento encosta na borda de baixo", () => {
    expect(progressoNaViewport(JANELA, ALTURA, JANELA)).toBeCloseTo(-1, 5);
  });

  it("é 1 no instante em que o elemento sai pela borda de cima", () => {
    expect(progressoNaViewport(-ALTURA, ALTURA, JANELA)).toBeCloseTo(1, 5);
  });

  it("satura fora da faixa em vez de crescer sem limite", () => {
    expect(progressoNaViewport(JANELA * 5, ALTURA, JANELA)).toBe(-1);
    expect(progressoNaViewport(-JANELA * 5, ALTURA, JANELA)).toBe(1);
  });

  it("não divide por zero com janela de altura zero", () => {
    expect(progressoNaViewport(0, 0, 0)).toBe(0);
  });
});

describe("deslocamento", () => {
  it("percorre velocidade × referência do centro até a ponta", () => {
    expect(deslocamentoDe(-1, 0.25, 400)).toBeCloseTo(-100, 5);
    expect(deslocamentoDe(1, 0.25, 400)).toBeCloseTo(100, 5);
  });

  it("velocidade negativa move para o lado contrário — é o par que cria a camada", () => {
    expect(deslocamentoDe(1, -0.25, 400)).toBeCloseTo(-100, 5);
  });

  it("é zero no centro, qualquer que seja a velocidade", () => {
    expect(deslocamentoDe(0, 0.9, 1000)).toBe(0);
  });
});

describe("fator do ambiente", () => {
  it("desktop roda a intensidade cheia", () => {
    expect(fatorDoAmbiente({ desktop: true, reduzido: false })).toBe(1);
  });

  it("celular roda reduzido — o tráfego real vem de link de WhatsApp", () => {
    expect(fatorDoAmbiente({ desktop: false, reduzido: false })).toBe(FATOR_MOBILE);
    expect(FATOR_MOBILE).toBeLessThan(1);
  });

  it("movimento reduzido zera tudo, inclusive no desktop", () => {
    expect(fatorDoAmbiente({ desktop: true, reduzido: true })).toBe(0);
    expect(fatorDoAmbiente({ desktop: false, reduzido: true })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/motion/camadasCalculo.test.ts`
Expected: FAIL — `Failed to resolve import "./camadasCalculo"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/motion/camadasCalculo.ts`:

```ts
/**
 * A régua do parallax, separada do DOM de propósito.
 *
 * O controlador (`controladorCamadas.ts`) só lê retângulos e escreve
 * transform; toda a decisão de QUANTO mover mora aqui, onde dá para testar
 * sem navegador. Mesmo desenho de `transicaoGlobo.ts`.
 */

export type EixoCamada = "x" | "y";

export type Ambiente = {
  desktop: boolean;
  /** `prefers-reduced-motion: reduce` ou a classe `.motion-off` no <html>. */
  reduzido: boolean;
};

/**
 * No celular a intensidade cai a 40%: lá o gesto de rolagem é do dedo, e
 * movimento forte sob o polegar parece software travando, não profundidade.
 */
export const FATOR_MOBILE = 0.4;

/**
 * Onde o elemento está na passagem pela tela, de -1 a 1.
 *
 * -1 = encostando na borda de baixo (acabou de entrar);
 *  0 = centro do elemento no centro da janela;
 *  1 = saindo pela borda de cima.
 *
 * O zero no centro é o que faz a camada nascer no lugar certo: se o
 * progresso começasse em 0 na entrada, toda foto apareceria já deslocada.
 */
export function progressoNaViewport(
  inicio: number,
  tamanho: number,
  janela: number,
): number {
  const faixa = (janela + tamanho) / 2;
  if (faixa <= 0) return 0;

  const centroDoElemento = inicio + tamanho / 2;
  const bruto = (janela / 2 - centroDoElemento) / faixa;

  return Math.max(-1, Math.min(1, bruto));
}

/**
 * Quanto o elemento anda, em pixels. `referencia` é o próprio tamanho dele
 * no eixo — assim a mesma velocidade rende o mesmo efeito visual numa foto
 * de 300px e numa de 900px.
 */
export function deslocamentoDe(
  progresso: number,
  velocidade: number,
  referencia: number,
): number {
  return progresso * velocidade * referencia;
}

/** Multiplicador global de intensidade, decidido em UM lugar só. */
export function fatorDoAmbiente({ desktop, reduzido }: Ambiente): number {
  if (reduzido) return 0;
  return desktop ? 1 : FATOR_MOBILE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/motion/camadasCalculo.test.ts`
Expected: PASS — 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/camadasCalculo.ts src/components/motion/camadasCalculo.test.ts docs/superpowers
git commit -m "feat: a régua do parallax, medida antes de mover um pixel"
```

---

### Task 2: Controlador central de camadas

**Files:**
- Create: `src/components/motion/controladorCamadas.ts`

**Interfaces:**
- Consumes: `progressoNaViewport`, `deslocamentoDe`, `fatorDoAmbiente`, `Ambiente`, `EixoCamada` (Task 1).
- Produces: `type OpcoesCamada = { velocidade: number; eixo?: EixoCamada; apenasDesktop?: boolean; escala?: number; aoAtualizar?: (progresso: number) => void }`; `registrarCamada(el: HTMLElement, opcoes: OpcoesCamada): () => void`.

- [ ] **Step 1: Escrever o controlador**

Create `src/components/motion/controladorCamadas.ts`:

```ts
"use client";

import { gsap } from "gsap";
import {
  deslocamentoDe,
  fatorDoAmbiente,
  progressoNaViewport,
  type Ambiente,
  type EixoCamada,
} from "./camadasCalculo";

export type OpcoesCamada = {
  /**
   * Fração do próprio tamanho que o elemento percorre do centro até a ponta
   * da passagem. 0.25 = anda 25% da própria altura para cada lado. Negativo
   * inverte o sentido — é assim que se faz o par foto/texto.
   */
  velocidade: number;
  eixo?: EixoCamada;
  /** Não se registra abaixo de 768px (pin, scrub e tilt seguem essa regra). */
  apenasDesktop?: boolean;
  /** Zoom nas pontas da passagem: 1.12 = 12% maior. `1` desliga. */
  escala?: number;
  /**
   * Escape para efeitos que não são deslocamento (véu que fecha, header que
   * condensa). Recebe o progresso de -1 a 1 e escreve o que quiser.
   */
  aoAtualizar?: (progresso: number) => void;
};

type Entrada = {
  el: HTMLElement;
  opcoes: OpcoesCamada;
  visivel: boolean;
  aplicar: (valor: Record<string, number>) => void;
  /** Medidas lidas na fase de leitura do frame. */
  inicio: number;
  tamanho: number;
};

const entradas = new Set<Entrada>();
let observador: IntersectionObserver | null = null;
let ligado = false;
let ambiente: Ambiente = { desktop: true, reduzido: false };

const CONSULTA_DESKTOP = "(min-width: 768px)";
const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function lerAmbiente(): Ambiente {
  return {
    desktop: window.matchMedia(CONSULTA_DESKTOP).matches,
    // `.motion-off` é carimbada pelo SmoothScroll; respeitá-la aqui mantém
    // UM interruptor para todo o movimento do site.
    reduzido:
      window.matchMedia(CONSULTA_MOVIMENTO).matches ||
      document.documentElement.classList.contains("motion-off"),
  };
}

/**
 * Um frame = uma fase de LEITURA e uma de ESCRITA, nessa ordem.
 *
 * Intercalar `getBoundingClientRect` com escrita de transform força o
 * navegador a recalcular layout no meio do laço (layout thrashing) — com
 * uma dúzia de camadas visíveis, é a diferença entre 60fps e 30.
 */
function aoTique() {
  const fator = fatorDoAmbiente(ambiente);
  const janelaY = window.innerHeight;
  const janelaX = window.innerWidth;

  const ativas: Entrada[] = [];

  // FASE 1 — leitura. Nenhuma escrita aqui dentro.
  for (const entrada of entradas) {
    if (!entrada.visivel) continue;
    if (entrada.opcoes.apenasDesktop && !ambiente.desktop) continue;

    const r = entrada.el.getBoundingClientRect();
    const horizontal = entrada.opcoes.eixo === "x";
    entrada.inicio = horizontal ? r.left : r.top;
    entrada.tamanho = horizontal ? r.width : r.height;
    ativas.push(entrada);
  }

  // FASE 2 — escrita. Nenhuma leitura de layout aqui dentro.
  for (const entrada of ativas) {
    const horizontal = entrada.opcoes.eixo === "x";
    const progresso = progressoNaViewport(
      entrada.inicio,
      entrada.tamanho,
      horizontal ? janelaX : janelaY,
    );

    const px = deslocamentoDe(progresso, entrada.opcoes.velocidade * fator, entrada.tamanho);

    // O zoom acompanha a saída da tela: 1 no centro, `escala` nas pontas.
    const escalaMax = entrada.opcoes.escala ?? 1;
    const escala = fator === 0 ? 1 : 1 + (escalaMax - 1) * Math.abs(progresso);

    entrada.aplicar(horizontal ? { x: px, scale: escala } : { y: px, scale: escala });

    entrada.opcoes.aoAtualizar?.(progresso);
  }
}

function ligar() {
  if (ligado) return;
  ligado = true;

  ambiente = lerAmbiente();

  observador = new IntersectionObserver(
    (registros) => {
      for (const registro of registros) {
        for (const entrada of entradas) {
          if (entrada.el === registro.target) entrada.visivel = registro.isIntersecting;
        }
      }
    },
    // Margem generosa: a camada precisa estar no lugar certo ANTES de o
    // elemento aparecer, senão ele entra na tela e só então salta.
    { rootMargin: "30% 0px 30% 0px" },
  );

  for (const entrada of entradas) observador.observe(entrada.el);

  gsap.ticker.add(aoTique);
}

function desligar() {
  if (!ligado) return;
  ligado = false;
  gsap.ticker.remove(aoTique);
  observador?.disconnect();
  observador = null;
}

function aoMudarAmbiente() {
  ambiente = lerAmbiente();
  if (fatorDoAmbiente(ambiente) === 0) {
    // Devolve todo mundo ao lugar: com movimento reduzido o site é o mesmo
    // site, só sem deslocamento.
    for (const entrada of entradas) entrada.aplicar({ x: 0, y: 0, scale: 1 });
  }
}

let ouvindo = false;
function ouvirAmbiente() {
  if (ouvindo) return;
  ouvindo = true;
  window.matchMedia(CONSULTA_DESKTOP).addEventListener("change", aoMudarAmbiente);
  window.matchMedia(CONSULTA_MOVIMENTO).addEventListener("change", aoMudarAmbiente);
}

/**
 * Registra um elemento como camada. Devolve a função de baixa.
 *
 * Todos os registrados dividem UM `gsap.ticker` e UM `IntersectionObserver`.
 * O padrão antigo (um `ScrollTrigger` por componente) daria 60–90 gatilhos
 * por página, todos recalculando a cada `refresh` — que acontece em resize,
 * troca de tema e navegação.
 */
export function registrarCamada(el: HTMLElement, opcoes: OpcoesCamada): () => void {
  const entrada: Entrada = {
    el,
    opcoes,
    visivel: false,
    aplicar: gsap.quickSetter(el, "css") as Entrada["aplicar"],
    inicio: 0,
    tamanho: 0,
  };

  entradas.add(entrada);
  ouvirAmbiente();
  ligar();
  observador?.observe(el);

  return () => {
    observador?.unobserve(el);
    entradas.delete(entrada);
    gsap.set(el, { clearProps: "transform" });
    if (entradas.size === 0) desligar();
  };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/motion/controladorCamadas.ts
git commit -m "feat: um controlador para todas as camadas, um laço só"
```

---

### Task 3: Primitiva `Camada` e reescrita do `ParallaxImagem`

**Files:**
- Create: `src/components/motion/Camada.tsx`
- Modify: `src/components/motion/ParallaxImagem.tsx` (arquivo inteiro)
- Test: `src/components/motion/camadasGuardas.test.ts`

**Interfaces:**
- Consumes: `registrarCamada`, `OpcoesCamada` (Task 2).
- Produces: `useCamada(ref: React.RefObject<HTMLElement | null>, opcoes: OpcoesCamada): void`; `<Camada velocidade eixo apenasDesktop escala as className>`. `ParallaxImagem` mantém a API atual (`children`, `className`, `intensidade`).

- [ ] **Step 1: Escrever o teste de guarda**

Create `src/components/motion/camadasGuardas.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste que LÊ O CÓDIGO, como `escalaDoPainel.test.ts`.
 *
 * A regra não é sobre o resultado de uma função: é sobre QUAIS telas podem
 * receber camada. Mapa, player, formulário e navegação ficam parados por
 * decisão de produto — e a regressão, se acontecer, falha calada: o site
 * continua "funcionando", só com o mapa tremendo sob o dedo.
 */
const RAIZ = join(process.cwd(), "src", "components");

const PROIBIDOS = [
  "empreendimento/Localizacao.tsx",
  "empreendimento/Contato.tsx",
  "empreendimento/NavAncoras.tsx",
  "empreendimento/Video.tsx",
  "empreendimento/Tour360.tsx",
  "mapa/MapaInterativoClient.tsx",
  "mapa/MapaLocalClient.tsx",
  "mapa/GloboImoveis.tsx",
  "layout/MenuMobile.tsx",
  "busca/FiltroForm.tsx",
  "busca/FiltroSheet.tsx",
];

describe("onde camada NÃO pode entrar", () => {
  for (const caminho of PROIBIDOS) {
    it(`${caminho} continua sem camada`, () => {
      const fonte = readFileSync(join(RAIZ, caminho), "utf8");
      expect(fonte).not.toMatch(/motion\/Camada|useCamada|registrarCamada/);
    });
  }
});
```

- [ ] **Step 2: Rodar o teste — ele nasce verde de propósito**

Run: `npx vitest run src/components/motion/camadasGuardas.test.ts`
Expected: PASS. É uma trava para o futuro, não um TDD de feature: nada tem camada ainda, e o valor dele é reprovar a regressão que virá depois.

- [ ] **Step 3: Escrever a primitiva**

Create `src/components/motion/Camada.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { registrarCamada, type OpcoesCamada } from "./controladorCamadas";

/**
 * Liga um elemento ao controlador de camadas.
 *
 * Use o hook quando o componente já tem ref própria ou precisa do
 * `aoAtualizar` (véu que fecha, header que condensa). Para o caso comum,
 * `<Camada>` logo abaixo é mais direto.
 */
export function useCamada(
  ref: React.RefObject<HTMLElement | null>,
  opcoes: OpcoesCamada,
) {
  // As opções vivem numa ref para o efeito não re-registrar a cada render
  // por causa de um callback recriado — re-registrar limpa o transform e o
  // elemento pisca de volta ao lugar.
  const atuais = useRef(opcoes);
  atuais.current = opcoes;

  const { velocidade, eixo, apenasDesktop, escala } = opcoes;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return registrarCamada(el, {
      velocidade,
      eixo,
      apenasDesktop,
      escala,
      aoAtualizar: (p) => atuais.current.aoAtualizar?.(p),
    });
  }, [ref, velocidade, eixo, apenasDesktop, escala]);
}

type Tag = "div" | "section" | "figure" | "span" | "li";

/**
 * Camada de profundidade: o elemento anda mais devagar (ou mais rápido, ou
 * ao contrário) que o scroll.
 *
 * Não mexe em opacidade de propósito — quem revela é o `Reveal`, e dois
 * donos da mesma opacidade fazem o elemento sumir. Pelo mesmo motivo, nunca
 * ponha `Camada` e `Reveal` no MESMO nó: os dois escrevem transform.
 */
export function Camada({
  children,
  className,
  as: TagName = "div",
  velocidade,
  eixo,
  apenasDesktop,
  escala,
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
} & OpcoesCamada) {
  const ref = useRef<HTMLElement>(null);
  useCamada(ref, { velocidade, eixo, apenasDesktop, escala });

  return (
    // Junção crua: o twMerge do `cn` descarta os utilitários `text-fluid-*`.
    <TagName
      ref={ref as never}
      className={["will-change-transform", className].filter(Boolean).join(" ")}
    >
      {children}
    </TagName>
  );
}
```

- [ ] **Step 4: Reescrever o `ParallaxImagem` por dentro**

Replace the entire contents of `src/components/motion/ParallaxImagem.tsx`:

```tsx
"use client";

import { useRef } from "react";
import { useCamada } from "./Camada";
import { cn } from "@/lib/utils";

/**
 * Moldura de parallax: o filho (uma imagem `fill`) anda mais devagar que o
 * scroll, dando profundidade à foto sem custo de layout — só transform.
 *
 * A imagem é levemente ampliada (`scale`) para o deslocamento nunca expor
 * borda vazia. `intensidade` é o quanto ela percorre, em % da própria
 * altura, do centro até a ponta da passagem pela viewport.
 *
 * Desde 08/2026 a API é a mesma mas o motor mudou: em vez de um
 * `ScrollTrigger` próprio, delega ao controlador central — um laço só para
 * as ~40 camadas do site (ver `controladorCamadas.ts`).
 */
export function ParallaxImagem({
  children,
  className,
  intensidade = 12,
}: {
  children: React.ReactNode;
  className?: string;
  intensidade?: number;
}) {
  const alvo = useRef<HTMLDivElement>(null);

  useCamada(alvo, { velocidade: intensidade / 100 });

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={alvo}
        className="absolute inset-0 will-change-transform"
        style={{ scale: `${1 + (intensidade * 2) / 100}` }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rodar a bateria**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS em todos. Conferir no navegador (`npm run dev`) que a galeria e o Sobre de uma página de imóvel continuam com o parallax de antes — a API não mudou, mas o motor sim.

- [ ] **Step 6: Commit**

```bash
git add src/components/motion/Camada.tsx src/components/motion/ParallaxImagem.tsx src/components/motion/camadasGuardas.test.ts
git commit -m "feat: a primitiva de camada, e o parallax antigo passa a usá-la"
```

---

### Task 4: Hero da página do imóvel — o maior ganho

**Files:**
- Create: `src/components/empreendimento/CapaHero.tsx`
- Modify: `src/components/empreendimento/Hero.tsx` (o bloco `fixed inset-0` e o bloco de texto)

**Interfaces:**
- Consumes: `useCamada`, `Camada` (Task 3).
- Produces: `<CapaHero slug={string} capa={Midia} />`.

`Hero.tsx` é Server Component e deve continuar sendo (usa `linkWhatsappPara`). Por isso a capa vira componente cliente próprio, em vez de marcar o arquivo inteiro com `"use client"`.

- [ ] **Step 1: Criar o componente da capa**

Create `src/components/empreendimento/CapaHero.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useRef, ViewTransition } from "react";
import { useCamada } from "@/components/motion/Camada";
import type { Midia } from "@/lib/types";

/**
 * A capa do hero em três planos.
 *
 * Ela já era `fixed inset-0`, o que dá parallax "de graça" — a página
 * desliza por cima de uma foto parada. O que faltava era a foto REAGIR:
 * aqui ela amplia até 12% conforme o scroll avança, e um segundo véu fecha
 * junto, escurecendo a imagem à medida que o conteúdo opaco sobe. Sem esse
 * véu progressivo, a passagem do hero para a primeira banda opaca é um
 * corte seco.
 */
export function CapaHero({ slug, capa }: { slug: string; capa: Midia }) {
  const foto = useRef<HTMLDivElement>(null);
  const veu = useRef<HTMLDivElement>(null);

  useCamada(foto, {
    // Positivo e baixo: a foto anda DEVAGAR contra o conteúdo, que sobe
    // rápido. É o par que faz o texto parecer estar à frente dela.
    velocidade: 0.08,
    escala: 1.12,
    aoAtualizar: (progresso) => {
      const el = veu.current;
      if (!el) return;
      el.style.opacity = String(Math.max(0, Math.min(1, progresso)));
    },
  });

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div ref={foto} className="absolute inset-0 will-change-transform">
        <ViewTransition name={`capa-${slug}`}>
          <Image
            src={capa.url}
            alt={capa.alt}
            fill
            priority
            sizes="100vw"
            placeholder={capa.blurDataUrl ? "blur" : "empty"}
            blurDataURL={capa.blurDataUrl ?? undefined}
            className="object-cover"
          />
        </ViewTransition>
      </div>

      {/* Cor literal de propósito: este véu escurece a FOTO de capa para o
          texto branco por cima ficar legível. O fundo dele é a imagem, não a
          página — num tema claro ele continua escuro, senão o texto some. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/15 to-ink-950" />

      {/* Segundo véu, este comandado pelo scroll: fecha a foto conforme o
          conteúdo opaco sobe. */}
      <div ref={veu} className="absolute inset-0 bg-ink-950 opacity-0" />
    </div>
  );
}
```

- [ ] **Step 2: Trocar o bloco no `Hero.tsx`**

Em `src/components/empreendimento/Hero.tsx`:

1. Remover `import Image from "next/image";` e `import { ViewTransition } from "react";`.
2. Acrescentar `import { CapaHero } from "./CapaHero";` e `import { Camada } from "@/components/motion/Camada";`.
3. Substituir todo o `<div className="fixed inset-0 -z-10"> … </div>` (a capa, a `ViewTransition` e o véu) por uma linha:

```tsx
      <CapaHero slug={e.slug} capa={e.capa} />
```

- [ ] **Step 3: Dar velocidade própria ao conteúdo do hero**

Ainda em `Hero.tsx`, trocar a abertura do bloco de texto

```tsx
      <div className="mx-auto w-full max-w-7xl px-4 pt-28 sm:px-8">
```

por

```tsx
      <Camada velocidade={-0.18} className="mx-auto w-full max-w-7xl px-4 pt-28 sm:px-8">
```

e o `</div>` correspondente por `</Camada>`. Velocidade NEGATIVA: o conteúdo sobe mais rápido que a foto. O par (foto +0.08 / texto -0.18) é o que produz a separação de planos — sozinha, cada metade só parece "uma foto grande".

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev` e abrir `/empreendimentos/<qualquer-slug>`.
Expected: a foto amplia devagar ao rolar e escurece antes de a ficha de números chegar; o nome do imóvel sobe à frente dela; nada pisca ao carregar; a transição do card da listagem para o hero (View Transition) continua interpolando a capa.

- [ ] **Step 5: Rodar a bateria e commitar**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/empreendimento/CapaHero.tsx src/components/empreendimento/Hero.tsx
git commit -m "feat: a capa do imóvel ganha profundidade em três planos"
```

---

### Task 5: Hero da home e do portfólio

**Files:**
- Modify: `src/app/(institucional)/page.tsx` (a `<section>` do hero, por volta da linha 105)
- Modify: `src/app/(vitrine)/portfolio/page.tsx` (a `<section>` do hero, por volta da linha 81)

**Interfaces:**
- Consumes: `Camada` (Task 3).
- Produces: nada novo.

Os itens `data-abertura` são conduzidos pela `AberturaHome`, que controla a opacidade DELES. A `Camada` só escreve transform e entra POR FORA — nunca no mesmo nó de um `data-abertura` nem de um `Reveal`.

- [ ] **Step 1: Envolver os blocos da home**

Em `src/app/(institucional)/page.tsx`, importar:

```tsx
import { Camada } from "@/components/motion/Camada";
```

Trocar

```tsx
          <div className="w-full max-w-4xl text-center">
```

por

```tsx
          <Camada velocidade={-0.22} className="w-full max-w-4xl text-center">
```

(fechando com `</Camada>`), e trocar

```tsx
          <div data-abertura className="gsap-pending mt-8 w-full max-w-3xl sm:mt-10">
```

por

```tsx
          <Camada velocidade={-0.1} className="mt-8 w-full max-w-3xl sm:mt-10">
            <div data-abertura className="gsap-pending">
```

(fechando com `</div></Camada>`).

Título a -0.22 e busca a -0.1: o título escapa da tela antes da busca, e é essa diferença que se lê como camadas separadas em vez de um bloco só subindo.

- [ ] **Step 2: Envolver o hero do portfólio**

Em `src/app/(vitrine)/portfolio/page.tsx`, importar `Camada` e trocar

```tsx
          <Reveal className="w-full max-w-xl">
```

por

```tsx
          <Camada velocidade={-0.16} className="w-full max-w-xl">
            <Reveal>
```

fechando com `</Reveal>` antes do `</Camada>`. A ordem importa: `Camada` por FORA do `Reveal`, para os dois transforms não colidirem no mesmo nó.

- [ ] **Step 3: Verificar no navegador**

Run: `npm run dev`, abrir `/` e `/portfolio`.
Expected: título e busca saem da tela em ritmos diferentes. Limpar `sessionStorage` e recarregar para conferir que a vinheta de abertura continua conduzindo os `data-abertura` sem nada sumir.

- [ ] **Step 4: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add "src/app/(institucional)/page.tsx" "src/app/(vitrine)/portfolio/page.tsx"
git commit -m "feat: título e busca do hero saem da tela em ritmos diferentes"
```

---

### Task 6: A capa se move dentro do card

**Files:**
- Modify: `src/components/empreendimento/CardEmpreendimento.tsx`
- Modify: `src/components/empreendimento/Similares.tsx`
- Modify: `src/app/(institucional)/page.tsx` (grade de destaques e grade da equipe)
- Modify: `src/app/(vitrine)/empreendimentos/page.tsx` (grade da listagem)
- Modify: `src/app/(vitrine)/portfolio/page.tsx` (grade de destaques)
- Modify: `src/components/corretores/CardCorretor.tsx`

**Interfaces:**
- Consumes: `Camada` (Task 3), `CartaoTilt` (já existe).
- Produces: `CardEmpreendimento` ganha a prop `velocidadeCapa?: number` (padrão `0.12`).

`CardEmpreendimento` é Server Component e pode renderizar `Camada` (cliente): as props são serializáveis (números e strings).

- [ ] **Step 1: Pôr a capa em camada**

Em `src/components/empreendimento/CardEmpreendimento.tsx`, importar `Camada`, acrescentar a prop na assinatura:

```tsx
  /** Velocidade da capa dentro da moldura. A grade escalona por coluna. */
  velocidadeCapa = 0.12,
```

```tsx
  velocidadeCapa?: number;
```

e envolver a capa POR DENTRO da moldura que já tem `overflow-hidden`:

```tsx
          <Camada velocidade={velocidadeCapa} className="absolute inset-0 scale-110">
            <ViewTransition name={`capa-${e.slug}`}>
              <Image
                src={e.capa.url}
                alt={e.capa.alt}
                fill
                sizes={sizes}
                priority={prioridade}
                placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
                blurDataURL={e.capa.blurDataUrl ?? undefined}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            </ViewTransition>
          </Camada>
```

A `scale-110` na camada evita borda vazia — mesma razão do `ParallaxImagem`.

- [ ] **Step 2: Escalonar por coluna nas quatro grades**

A conta é a mesma em todas: `0.08 + (i % 3) * 0.05` nas grades de 3 colunas, `0.08 + (i % 2) * 0.06` nas de 2. `i` é o índice que o `.map` já fornece.

Em `src/components/empreendimento/Similares.tsx` (3 colunas):

```tsx
              <CardEmpreendimento
                empreendimento={e}
                velocidadeCapa={0.08 + (i % 3) * 0.05}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              />
```

Em `src/app/(institucional)/page.tsx` (grade de destaques, 3 colunas):

```tsx
                    <Reveal key={e.slug} delay={(i % 3) * 0.1} from="baixo">
                      <CardEmpreendimento
                        empreendimento={e}
                        velocidadeCapa={0.08 + (i % 3) * 0.05}
                      />
                    </Reveal>
```

Em `src/app/(vitrine)/empreendimentos/page.tsx`, acrescentar a prop ao `<CardEmpreendimento>` da grade. O `i` do `.map` já existe (é o mesmo que calcula `destaqueGrande` e o `delay` do `Reveal`):

```tsx
                  <CardEmpreendimento
                    empreendimento={e}
                    prioridade={i < 3}
                    velocidadeCapa={0.08 + (i % 3) * 0.05}
                    aspecto={destaqueGrande ? "aspect-[4/3] sm:aspect-[21/10]" : undefined}
                    sizes={
                      destaqueGrande
                        ? "(min-width: 1024px) 66vw, 100vw"
                        : undefined
                    }
                  />
```

Em `src/app/(vitrine)/portfolio/page.tsx` a grade é de 2 colunas e monta o card à mão (não usa `CardEmpreendimento`): envolver o `<Image>` da capa numa `<Camada velocidade={0.08 + (i % 2) * 0.06} className="absolute inset-0 scale-110">`.

- [ ] **Step 3: Tilt leve nos cards de corretor**

Foto de pessoa deslizando dentro da moldura fica esquisita — aqui o ganho é o tilt, não a camada. Em `src/components/corretores/CardCorretor.tsx`, importar

```tsx
import { CartaoTilt } from "@/components/motion/CartaoTilt";
```

e envolver a superfície do card com `<CartaoTilt indice={0} className="rounded-glass">…</CartaoTilt>`.

O `CartaoTilt` faz a própria entrada (cortina de `clip-path`) e assume a opacidade. Portanto, em `src/app/(institucional)/page.tsx`, na grade da equipe, REMOVER o `<Reveal>` que hoje envolve cada `<CardCorretor>` — dois donos da opacidade fazem o card sumir.

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev`, abrir `/`, `/empreendimentos`, `/portfolio` e uma página de imóvel.
Expected: ao rolar, as capas deslizam DENTRO das molduras, com colunas em ritmos diferentes. Nenhum card invisível, nenhuma borda vazia aparecendo nos cantos, e o clique continua abrindo a página do imóvel certo.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/empreendimento/CardEmpreendimento.tsx src/components/empreendimento/Similares.tsx src/components/corretores/CardCorretor.tsx "src/app/(institucional)/page.tsx" "src/app/(vitrine)/empreendimentos/page.tsx" "src/app/(vitrine)/portfolio/page.tsx"
git commit -m "feat: a capa se move dentro do card, e cada coluna no seu ritmo"
```

---

### Task 7: Galeria — o mosaico ganha ritmo por coluna

**Files:**
- Modify: `src/components/motion/CartaoTilt.tsx`
- Modify: `src/components/empreendimento/Galeria.tsx`

**Interfaces:**
- Consumes: `useCamada` (Task 3).
- Produces: `CartaoTilt` ganha a prop `velocidadeCamada?: number` (padrão `0` = desligado).

- [ ] **Step 1: Somar camada ao `CartaoTilt`**

A camada vai no elemento INTERNO, não no `el` externo: o externo já é dono do `clipPath` e do tilt (`rotationX`/`rotationY` via `quickTo`), e somar `y` ali brigaria pela mesma matriz.

Em `src/components/motion/CartaoTilt.tsx`:

```tsx
import { useCamada } from "./Camada";
```

Na assinatura:

```tsx
  /** Deslocamento do conteúdo dentro da moldura. 0 desliga. */
  velocidadeCamada = 0,
```

```tsx
  velocidadeCamada?: number;
```

No corpo, antes do `useEffect`:

```tsx
  const interno = useRef<HTMLDivElement>(null);
  useCamada(interno, { velocidade: velocidadeCamada });
```

E no JSX, envolver `{children}`:

```tsx
      <div
        ref={interno}
        className={
          velocidadeCamada
            ? "absolute inset-0 scale-110 will-change-transform"
            : "contents"
        }
      >
        {children}
      </div>
```

`contents` quando desligado: sem camada, a div não pode ocupar lugar no layout, senão o `aspect-*` da moldura para de valer para o filho.

O efeito existente lê `el.firstElementChild` para o zoom da cortina. Com a div nova, `firstElementChild` passa a ser ela — o que continua correto, é ela que contém a foto.

- [ ] **Step 2: Escalonar as células da galeria**

Em `src/components/empreendimento/Galeria.tsx`, na grade do `resto`:

```tsx
            <CartaoTilt
              key={foto.url}
              indice={i}
              velocidadeCamada={0.06 + (i % 3) * 0.06}
              className={
                "overflow-hidden rounded-2xl " +
                (i % 5 === 0 ? "row-span-2 aspect-[3/4]" : "aspect-[4/3]")
              }
            >
```

Coluna 1 a 0.06, coluna 2 a 0.12, coluna 3 a 0.18. É a diferença ENTRE colunas que produz o efeito de revista.

- [ ] **Step 3: Subir a intensidade do destaque**

Na mesma tela, trocar `intensidade={8}` por `intensidade={18}` no `ParallaxImagem` do destaque — a foto de abertura é grande o bastante para aguentar.

- [ ] **Step 4: Verificar no navegador**

Run: `npm run dev`, abrir a galeria de um imóvel com 6+ fotos.
Expected: as colunas deslizam em ritmos distintos; o clique abre o Lightbox na foto certa; o Lightbox abre em TELA CHEIA.

Este último ponto é o risco da tarefa: `CartaoTilt` cria containing block e o `Lightbox` já usa portal por causa disso. Se ele abrir preso dentro da célula, o portal foi perdido em algum ponto — reverter e investigar antes de seguir.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/motion/CartaoTilt.tsx src/components/empreendimento/Galeria.tsx
git commit -m "feat: cada coluna do mosaico anda no seu ritmo"
```

---

### Task 8: Sobre, ficha de números, tipologias e book

**Files:**
- Modify: `src/components/empreendimento/Sobre.tsx`
- Modify: `src/components/empreendimento/FichaNumeros.tsx`
- Modify: `src/components/empreendimento/Tipologias.tsx`
- Modify: `src/components/empreendimento/BookDigital.tsx`

**Interfaces:**
- Consumes: `Camada` (Task 3).

- [ ] **Step 1: `Sobre` — o par foto/texto**

Importar `Camada`, trocar `intensidade={10}` por `intensidade={20}` no `ParallaxImagem`, e trocar o `<div>` que abre a coluna de texto (o primeiro filho do grid) por uma camada de velocidade contrária:

```tsx
        <Camada velocidade={-0.07}>
          <p className="text-fluid-xs mb-4 tracking-[0.22em] text-acento-suave uppercase">
            Sobre o empreendimento
          </p>
          <TituloEditorial className="font-display text-fluid-2xl leading-snug text-titulo">
            {e.tagline}
          </TituloEditorial>
          <Reveal from="nenhuma" delay={0.25}>
            <p className="text-fluid-lg mt-8 leading-relaxed whitespace-pre-line text-corpo-suave">
              {e.descricao}
            </p>
          </Reveal>
        </Camada>
```

A coluna da foto continua `<Reveal from="baixo" className="lg:sticky lg:top-28">` — NÃO envolver essa em `Camada`: `position: sticky` dentro de um elemento com transform para de grudar, e o efeito de coluna fixa é o que segura a foto ao lado do texto longo.

O par (+0.20 na foto, -0.07 no texto) é o que se lê como camada. Foto sozinha se lê como foto grande.

- [ ] **Step 2: `FichaNumeros` — deslocamento por coluna**

O `<Reveal stagger>` já é dono da opacidade E do transform de entrada dos FILHOS DIRETOS. Somar camada nesses mesmos nós faria dois donos da mesma matriz. A camada entra POR DENTRO de cada célula:

```tsx
        {numeros.map((n, i) => (
          <div key={n.rotulo}>
            <Camada velocidade={0.05 + (i % 3) * 0.04}>
              <p className="font-display text-fluid-3xl leading-none text-titulo">
                {"texto" in n ? (
                  n.texto
                ) : (
                  <ContadorNumero valor={n.valor} sufixo={n.sufixo ?? ""} />
                )}
              </p>
              <p className="text-fluid-xs mt-3 tracking-[0.18em] text-legenda uppercase">
                {n.rotulo}
              </p>
            </Camada>
          </div>
        ))}
```

- [ ] **Step 3: `Tipologias` — planta deslizando na janela**

Envolver o `<Image>` da planta:

```tsx
                    <Camada velocidade={0.09} className="absolute inset-0 scale-105">
                      <Image
                        src={t.plantaUrl}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 340px, 100vw"
                        className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                      />
                    </Camada>
```

`scale-105` e não 110: planta é `object-contain`, e ampliar demais corta o desenho.

- [ ] **Step 4: `BookDigital` — a luz de fundo vira camada**

O `<div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />` já existe e é puramente decorativo. Trocar por:

```tsx
          <Camada
            velocidade={0.4}
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl"
          >
            <span />
          </Camada>
```

Velocidade alta é segura aqui: é um borrão sem borda definida — ninguém percebe deslocamento, percebe só que o painel tem profundidade.

- [ ] **Step 5: Verificar e commitar**

Run: `npm run dev` e rolar uma página de imóvel inteira.
Expected: nenhuma seção pisca; o `ContadorNumero` continua contando ao entrar; a planta continua abrindo no Lightbox.

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/empreendimento/Sobre.tsx src/components/empreendimento/FichaNumeros.tsx src/components/empreendimento/Tipologias.tsx src/components/empreendimento/BookDigital.tsx
git commit -m "feat: profundidade no sobre, na ficha, nas plantas e no book"
```

---

### Task 9: `CenaShowcase` — Ken Burns e uma versão para o celular

**Files:**
- Modify: `src/components/empreendimento/CenaShowcase.tsx`

- [ ] **Step 1: Ken Burns por cena no desktop**

Dentro do `mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", …)`, depois de montar a timeline, acrescentar:

```ts
        // A foto continua viva durante o respiro entre cenas. Sem isto, o
        // trecho "sem nada mudando" da timeline vira imagem congelada — que
        // parece player pausado, não cinema.
        quadros.forEach((quadro) => {
          const img = quadro.querySelector("img");
          if (!img) return;
          gsap.fromTo(
            img,
            { scale: 1, xPercent: 0 },
            {
              scale: 1.09,
              xPercent: -2,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top top",
                end: `+=${(quadros.length - 1) * 90}%`,
                scrub: 0.6,
              },
            },
          );
        });
```

- [ ] **Step 2: Camada na versão mobile**

O celular fica sem pin, mas não precisa ficar sem profundidade. Na `<section className="space-y-10 px-4 py-16 md:hidden">`, importar `Camada` e trocar

```tsx
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                <Image … />
              </div>
```

por

```tsx
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                <Camada velocidade={0.14} className="absolute inset-0 scale-110">
                  <Image
                    src={c.foto.url}
                    alt={c.foto.alt}
                    fill
                    sizes="100vw"
                    placeholder={c.foto.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={c.foto.blurDataUrl ?? undefined}
                    className="object-cover"
                  />
                </Camada>
              </div>
```

A velocidade escrita é sempre a de desktop: o fator de 40% do controlador reduz isso a ~0.056 na prática.

- [ ] **Step 3: Verificar**

Run: `npm run dev`, abrir uma página de imóvel com 4+ fotos, em desktop e em viewport de celular (DevTools).
Expected: desktop — as cenas passam pinadas e a foto respira durante o respiro; celular — as fotos deslizam levemente e o gesto de rolagem continua natural.

- [ ] **Step 4: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/empreendimento/CenaShowcase.tsx
git commit -m "feat: as cenas respiram, e o celular deixa de ficar sem nada"
```

---

### Task 10: Header que condensa

**Files:**
- Create: `src/components/motion/HeaderCondensado.tsx`
- Modify: `src/app/globals.css` (junto das regras de `.gsap-pending`, por volta da linha 730)
- Modify: `src/components/layout/SiteHeader.tsx`
- Modify: `src/components/layout/HeaderInstitucional.tsx`

**Interfaces:**
- Produces: `<HeaderCondensado className={string}>{children}</HeaderCondensado>` — renderiza um `<header>` que carimba `data-condensado="sim" | "nao"` em si mesmo.

Atributo em vez de transform, de propósito: este elemento contém o `MenuMobile`, cujo painel é `fixed` num portal. Transform no ancestral criaria containing block e traria de volta a armadilha já paga três vezes.

- [ ] **Step 1: Criar o componente**

Create `src/components/motion/HeaderCondensado.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Header que condensa ao sair do topo.
 *
 * Marca `data-condensado` em vez de escrever transform: este elemento
 * contém o MenuMobile, cujo painel é `fixed` num portal — e transform no
 * ancestral criaria containing block, prendendo o menu dentro da barra.
 * Armadilha já paga três vezes neste projeto.
 *
 * O estado é lido no ticker do GSAP (o mesmo do Lenis) e só escreve quando
 * MUDA de faixa: carimbar atributo a 60fps invalida estilo à toa.
 */
const LIMIAR_PX = 80;

export function HeaderCondensado({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let condensado: boolean | null = null;

    const conferir = () => {
      const agora = window.scrollY > LIMIAR_PX;
      if (agora === condensado) return;
      condensado = agora;
      el.dataset.condensado = agora ? "sim" : "nao";
    };

    conferir();
    gsap.ticker.add(conferir);
    return () => gsap.ticker.remove(conferir);
  }, []);

  return (
    <header ref={ref} data-condensado="nao" className={className}>
      {children}
    </header>
  );
}
```

- [ ] **Step 2: Estilo do estado condensado**

Acrescentar em `src/app/globals.css`, junto das regras de `.gsap-pending`:

```css
  /* Header condensado: encolhe o respiro e fecha o vidro ao sair do topo.
     Só padding e sombra — nada de transform, que criaria containing block e
     prenderia o painel `fixed` do MenuMobile dentro da barra. */
  header[data-condensado] {
    transition:
      padding-top 400ms cubic-bezier(0.22, 1, 0.36, 1),
      filter 400ms ease;
  }

  header[data-condensado="sim"] {
    padding-top: 0.35rem;
    filter: drop-shadow(0 8px 24px rgb(0 0 0 / 0.18));
  }

  @media (prefers-reduced-motion: reduce) {
    header[data-condensado] {
      transition: none;
    }
  }
```

- [ ] **Step 3: Trocar os dois headers**

Em `src/components/layout/SiteHeader.tsx` e `src/components/layout/HeaderInstitucional.tsx`, importar

```tsx
import { HeaderCondensado } from "@/components/motion/HeaderCondensado";
```

e trocar

```tsx
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
```

por

```tsx
    <HeaderCondensado className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
```

com o `</header>` virando `</HeaderCondensado>`.

`HeaderInstitucional` é `async` (Server Component) e passa a renderizar um componente cliente — permitido; `className` e children são serializáveis.

- [ ] **Step 4: Verificar**

Run: `npm run dev`, rolar qualquer página.
Expected: a barra encosta no topo e ganha sombra ao sair do topo.

O teste que importa é o menu mobile: abrir o `MenuMobile` em viewport de celular, com a página rolada. Se ele abrir espremido dentro da barra, algum transform voltou — reverter e investigar antes de commitar.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/motion/HeaderCondensado.tsx src/components/layout/SiteHeader.tsx src/components/layout/HeaderInstitucional.tsx src/app/globals.css
git commit -m "feat: o header encosta no topo quando a página desce"
```

---

### Task 11: Bandas de fundo em camadas

**Files:**
- Create: `src/components/motion/FundoEmCamadas.tsx`
- Modify: `src/components/home/Regioes.tsx`
- Modify: `src/components/empreendimento/Lazer.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/app/(institucional)/page.tsx` (a seção do card do vendedor)

**Interfaces:**
- Consumes: `Camada` (Task 3), `CartaoTilt` (já existe).
- Produces: `<FundoEmCamadas intensidade?: number />` — decoração absoluta, sem filhos úteis, para pôr dentro de uma seção `relative overflow-hidden`.

Onde o conteúdo é alvo de clique (chip de região, item de lazer), quem se move é o FUNDO. É assim que essas seções ganham profundidade sem que nada sob o dedo saia do lugar.

- [ ] **Step 1: Criar o fundo**

Create `src/components/motion/FundoEmCamadas.tsx`:

```tsx
"use client";

import { Camada } from "./Camada";

/**
 * Duas manchas de luz que atravessam a seção em velocidades diferentes.
 *
 * Existe para as seções cujo CONTEÚDO não pode se mover: chip de região é
 * alvo de clique, item de lazer é alvo de toque. Mover o fundo dá a mesma
 * profundidade sem tirar nada do lugar sob o dedo.
 *
 * `aria-hidden` e `pointer-events-none`: é decoração, e não pode roubar
 * clique de nada. A seção que a recebe PRECISA ter `overflow-hidden`, senão
 * as manchas vazam e criam barra de rolagem horizontal.
 */
export function FundoEmCamadas({ intensidade = 1 }: { intensidade?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Camada
        velocidade={0.35 * intensidade}
        className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl"
      >
        <span />
      </Camada>
      <Camada
        velocidade={-0.22 * intensidade}
        className="absolute -right-32 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-acento-forte/10 blur-3xl"
      >
        <span />
      </Camada>
    </div>
  );
}
```

- [ ] **Step 2: Ligar nas três seções**

Em `src/components/home/Regioes.tsx`:

```tsx
    <section className="relative overflow-hidden px-4 pb-16 sm:pb-24">
      <FundoEmCamadas />
```

Em `src/components/empreendimento/Lazer.tsx`:

```tsx
    <section
      id="lazer"
      className="relative overflow-hidden scroll-mt-24 bg-superficie/40 px-4 py-16 sm:px-8 sm:py-28"
    >
      <FundoEmCamadas intensidade={0.7} />
```

Em `src/components/layout/Footer.tsx`: acrescentar `relative overflow-hidden` às classes do `<footer>` externo e `<FundoEmCamadas intensidade={0.5} />` como primeiro filho.

O `overflow-hidden` é obrigatório nos três.

- [ ] **Step 3: Brilho que segue o cursor no card do vendedor**

Em `src/app/(institucional)/page.tsx`, na seção do `VENDEDOR`, trocar

```tsx
            <Reveal from="baixo" className="mx-auto w-full max-w-4xl">
```

por

```tsx
            <CartaoTilt indice={0} className="mx-auto w-full max-w-4xl">
```

(fechando com `</CartaoTilt>`), importando `CartaoTilt`. Ele já traz o brilho radial que segue o ponteiro e já faz a própria entrada — por isso o `Reveal` sai, e não fica junto: dois donos da opacidade.

- [ ] **Step 4: Verificar**

Run: `npm run dev`, abrir `/` e uma página de imóvel.
Expected: manchas de luz atravessando as bandas ao rolar; chips de região e itens de lazer continuam clicáveis e parados; o card do vendedor acende sob o cursor.

Conferir `overflow-x` em viewport de 360px de largura: nenhuma barra horizontal em nenhuma das três seções.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/motion/FundoEmCamadas.tsx src/components/home/Regioes.tsx src/components/empreendimento/Lazer.tsx src/components/layout/Footer.tsx "src/app/(institucional)/page.tsx"
git commit -m "feat: onde o conteúdo não pode se mover, quem se move é o fundo"
```

---

### Task 12: Institucionais e o carrossel horizontal

**Files:**
- Modify: `src/components/institucional/TimelineEmpreendimentos.tsx`
- Modify: `src/components/institucional/NossaEssencia.tsx`
- Modify: `src/components/institucional/SeloSegurancaJuridica.tsx`
- Modify: `src/components/institucional/VitrineOportunidadesSobre.tsx`

- [ ] **Step 1: Parallax horizontal no carrossel**

`TimelineEmpreendimentos` é um slider HORIZONTAL, não uma linha do tempo vertical — o eixo do efeito acompanha o eixo do movimento. Em `src/components/institucional/TimelineEmpreendimentos.tsx`, dentro do `.map` (por volta da linha 135), o `<Image>` que vive na moldura `relative h-[400px] … overflow-hidden` (linha ~146) passa a:

```tsx
                <Camada
                  eixo="x"
                  velocidade={0.1}
                  apenasDesktop
                  className="absolute inset-0 scale-110"
                >
                  <Image … as props que já estavam … />
                </Camada>
```

`eixo="x"` faz o controlador medir contra `window.innerWidth` e a posição horizontal: a foto desliza conforme o cartão atravessa a tela.

`apenasDesktop`: no celular o carrossel já é arrastado com o dedo, e somar deslocamento ao gesto confunde.

A moldura já tem `overflow-hidden` e o cartão já tem `group-hover:-translate-y-2` — o hover fica no cartão, a camada na foto, então os dois transforms vivem em nós diferentes.

- [ ] **Step 2: Camada leve nos três blocos institucionais**

Em cada um, o alvo é o BLOCO VISUAL, nunca o texto:

- `VitrineOportunidadesSobre.tsx` — o `<Image>` dentro de `<div className="relative aspect-[16/11] w-full overflow-hidden rounded-2xl bg-superficie">` (linha ~49) ganha `<Camada velocidade={0.09} className="absolute inset-0 scale-110">`.
- `SeloSegurancaJuridica.tsx` — o cartão do selo (`<div className="relative flex flex-col items-center justify-center p-8 rounded-3xl …">`, linha ~44) ganha `<Camada velocidade={-0.06}>` por fora. Negativo: ele sobe contra o painel, que fica parado.
- `NossaEssencia.tsx` — a `<section className="relative py-16 sm:py-24 border-t border-linha/10">` (linha 4) ganha `overflow-hidden` e um `<FundoEmCamadas intensidade={0.5} />` (Task 11) como primeiro filho. O grid de três colunas é texto: não se move.

Onde já houver `Reveal`, a `Camada` entra POR FORA dele.

- [ ] **Step 3: Verificar**

Run: `npm run dev`, abrir `/sobre`.
Expected: as capas do carrossel deslizam conforme ele anda no desktop; nada pisca; nada some; o arrasto no celular continua natural.

- [ ] **Step 4: Commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/components/institucional/
git commit -m "feat: as capas do carrossel deslizam conforme ele anda"
```

---

### Task 13: Passagem final — modos, orçamento de frames e memória

**Files:**
- Modify: `src/components/motion/camadasGuardas.test.ts`
- Modify: `docs/MEMORIA.md`

- [ ] **Step 1: Somar a regra "camada e reveal não dividem nó"**

Acrescentar ao fim de `src/components/motion/camadasGuardas.test.ts`:

```ts
/**
 * Dois donos da mesma matriz de transform fazem o elemento saltar: o Reveal
 * anima `x`/`y` na entrada e a camada escreve `y` a cada frame. O padrão
 * correto é `<Camada><Reveal>…</Reveal></Camada>` — nunca os dois no mesmo
 * nó, e nunca as props de um na tag do outro.
 */
describe("camada e reveal não dividem nó", () => {
  const ARQUIVOS = [
    "empreendimento/Galeria.tsx",
    "empreendimento/Sobre.tsx",
    "empreendimento/FichaNumeros.tsx",
    "empreendimento/Tipologias.tsx",
    "empreendimento/CardEmpreendimento.tsx",
    "home/Regioes.tsx",
  ];

  for (const caminho of ARQUIVOS) {
    it(`${caminho} não mistura as props das duas primitivas`, () => {
      const fonte = readFileSync(join(RAIZ, caminho), "utf8");
      expect(fonte).not.toMatch(/<Reveal[^>]*\bvelocidade=/);
      expect(fonte).not.toMatch(/<Camada[^>]*\bstagger=/);
      expect(fonte).not.toMatch(/<Camada[^>]*\bfrom=/);
    });
  }
});
```

Run: `npx vitest run src/components/motion/camadasGuardas.test.ts`
Expected: PASS.

- [ ] **Step 2: Conferir os três modos à mão**

Run: `npm run dev` e conferir, em cada modo, a home, a listagem e uma página de imóvel:

1. **Desktop normal** — camadas visíveis, nada saltando ao entrar na tela.
2. **Movimento reduzido** — DevTools → Rendering → emular `prefers-reduced-motion: reduce`. Expected: tudo estático, nada invisível, nada deslocado do lugar.
3. **Celular** — viewport de 390px. Expected: deslocamento perceptível mas discreto; rolagem com o dedo natural; nenhum scroll horizontal.

- [ ] **Step 3: Conferir o orçamento de frames**

DevTools → Performance, gravar 5s rolando a home no desktop.
Expected: nenhum frame longo (>50ms) em rajada de "Recalculate Style" / "Layout". Se houver, a causa provável é leitura e escrita intercaladas — conferir que `aoTique` mantém as duas fases separadas, e que nenhum `aoAtualizar` de algum componente lê `getBoundingClientRect`.

- [ ] **Step 4: Registrar na memória do projeto**

Acrescentar a `docs/MEMORIA.md`, na seção "Front público — a reforma editorial":

```markdown
- **O parallax do site inteiro roda em UM laço** (`controladorCamadas.ts`), não
  um `ScrollTrigger` por componente: com ~40 camadas, o padrão antigo daria
  60–90 gatilhos recalculando a cada `refresh` (resize, troca de tema,
  navegação). A matemática vive separada e testada em `camadasCalculo.ts`.
- **O laço tem fase de LEITURA e fase de ESCRITA, nessa ordem.** Intercalar
  `getBoundingClientRect` com escrita de transform força relayout no meio do
  laço — com uma dúzia de camadas visíveis, é a diferença entre 60 e 30fps.
- **`Camada` e `Reveal` nunca no mesmo nó.** Os dois escrevem transform; o
  padrão é `<Camada><Reveal>…</Reveal></Camada>`. Onde entra `CartaoTilt`, o
  `Reveal` SAI: o tilt já assume a opacidade (cortina de clip-path).
- **Onde o conteúdo é alvo de clique, quem se move é o FUNDO**
  (`FundoEmCamadas.tsx`): chip de região e item de lazer não saem do lugar.
  A seção que recebe o fundo precisa de `overflow-hidden`, senão as manchas
  vazam e criam barra de rolagem horizontal.
- **`camadasGuardas.test.ts` LÊ O CÓDIGO** e reprova camada em mapa, player,
  formulário e navegação — a regressão aqui falha calada: o site "funciona",
  só com o mapa tremendo sob o dedo.
- **O header condensa por ATRIBUTO (`data-condensado`), não por transform**:
  ele contém o MenuMobile, cujo painel é `fixed` num portal, e transform no
  ancestral criaria containing block. Quarta vez que essa armadilha aparece.
```

- [ ] **Step 5: Commit final**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add src/components/motion/camadasGuardas.test.ts docs/MEMORIA.md
git commit -m "test: trava as regras das camadas e registra o que custou descobrir"
```
