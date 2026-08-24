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
   *
   * Não pode ler layout (`getBoundingClientRect`, `offsetTop`): roda na fase
   * de ESCRITA do frame, e uma leitura ali força relayout no meio do laço.
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
const porElemento = new WeakMap<Element, Entrada>();
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

    const px = deslocamentoDe(
      progresso,
      entrada.opcoes.velocidade * fator,
      entrada.tamanho,
    );

    // O zoom acompanha a saída da tela: 1 no centro, `escala` nas pontas.
    const escalaMax = entrada.opcoes.escala ?? 1;
    const escala = fator === 0 ? 1 : 1 + (escalaMax - 1) * Math.abs(progresso);

    entrada.aplicar(
      horizontal ? { x: px, scale: escala } : { y: px, scale: escala },
    );

    entrada.opcoes.aoAtualizar?.(progresso);
  }
}

function aoObservar(registros: IntersectionObserverEntry[]) {
  for (const registro of registros) {
    const entrada = porElemento.get(registro.target);
    if (entrada) entrada.visivel = registro.isIntersecting;
  }
}

function ligar() {
  if (ligado) return;
  ligado = true;

  ambiente = lerAmbiente();

  observador = new IntersectionObserver(aoObservar, {
    // Margem generosa: a camada precisa estar no lugar certo ANTES de o
    // elemento aparecer, senão ele entra na tela e só então salta.
    rootMargin: "30% 0px 30% 0px",
  });

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
  porElemento.set(el, entrada);
  ouvirAmbiente();
  ligar();
  observador?.observe(el);

  return () => {
    observador?.unobserve(el);
    porElemento.delete(el);
    entradas.delete(entrada);
    gsap.set(el, { clearProps: "transform" });
    if (entradas.size === 0) desligar();
  };
}
