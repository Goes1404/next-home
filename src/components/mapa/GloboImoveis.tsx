"use client";

import { useCallback, useEffect, useRef } from "react";
import createGlobe from "cobe";
import { liberarContexto, reservarContexto } from "@/components/glass/orcamentoWebgl";

export type PinoGlobo = { lat: number; lng: number };

/**
 * Globo 3D com os imóveis marcados — a porta de entrada do mapa da home.
 *
 * Adaptado do "Cobe Globe Pulse" (@shuding, 21st.dev): o original girava sobre
 * capitais fixas com pulsos em ciano. Aqui os pinos são os imóveis REAIS
 * (lat/lng do banco — os 27 foram geocodificados, ver docs/MEMORIA.md), a cor
 * é o teal da marca lido dos tokens, e a rotação PARA na região em vez de
 * girar o mundo inteiro: quem chega quer ver Alphaville, não a Austrália.
 *
 * Ele existe para não pagar o Leaflet antes da hora: enquanto o visitante não
 * pede o mapa, a seção mostra o globo (WebGL leve, sem tiles de rede) e o
 * mapa interativo — 146 KB de JS mais 15 requisições de tile a um CDN
 * externo — só entra quando ele toca.
 *
 * O contexto WebGL é reservado no mesmo orçamento dos painéis de vidro
 * (`orcamentoWebgl`): navegador tem poucos contextos, e estourar faz sumir o
 * vidro da página inteira. Sem vaga, o componente não monta e o chamador
 * mostra o mapa direto.
 */

/** Centro de Alphaville/Barueri — para onde o globo aponta. */
const FOCO = { lat: -23.4985, lng: -46.8532 };

/**
 * Converte lat/lng no par phi/theta que o cobe usa para posicionar a câmera.
 *
 * O `- PI/2` foi CALIBRADO em tela, não deduzido: com a fórmula direta o
 * Brasil nascia na borda direita do globo, quase de perfil, e girando para o
 * outro lado aparecia a Austrália. Meio giro para oeste põe a América do Sul
 * de frente, com Alphaville no centro.
 */
function anguloDe(lat: number, lng: number) {
  return {
    phi: (Math.PI * (1 - (lng + 180) / 180)) % (2 * Math.PI) - Math.PI / 2,
    theta: (lat * Math.PI) / 180,
  };
}

function lerCor(token: string, reserva: string): [number, number, number] {
  const bruto = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const hex = bruto.startsWith("#") ? bruto : reserva;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * A paleta do globo acompanha o TEMA. O exemplo original era um disco preto
 * sobre fundo preto — no tema claro do site isso vira um buraco na página
 * (visto em tela antes do conserto). No claro o globo é uma esfera clara com
 * o continente desenhado em teal escuro; no escuro, o inverso.
 */
function paleta() {
  const claro = !document.documentElement.matches('[data-tema="escuro"]')
    && (document.documentElement.matches('[data-tema="claro"]')
      || !window.matchMedia("(prefers-color-scheme: dark)").matches);

  return {
    dark: claro ? 0 : 1,
    base: (claro ? [0.92, 0.95, 0.94] : [0.09, 0.16, 0.15]) as [number, number, number],
    brilho: (claro ? [0.85, 0.92, 0.9] : [0.05, 0.11, 0.1]) as [number, number, number],
    mapa: claro ? 8 : 5,
    marca: lerCor("--color-acento-forte", claro ? "#00443c" : "#2fd6a4"),
  };
}

export function GloboImoveis({
  pinos,
  aoAtivar,
  className = "",
}: {
  pinos: PinoGlobo[];
  /** Chamado quando o visitante pede o mapa de perto. */
  aoAtivar: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  const arrasto = useRef({ phi: 0, theta: 0 });
  const acumulado = useRef({ phi: 0, theta: 0 });
  const parado = useRef(false);
  // Distingue arrastar de clicar: sem isto, girar o globo abriria o mapa ao
  // soltar o dedo.
  const girou = useRef(false);

  const aoPressionar = useCallback((e: React.PointerEvent) => {
    arrastando.current = { x: e.clientX, y: e.clientY };
    girou.current = false;
    parado.current = true;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  useEffect(() => {
    const aoMover = (e: PointerEvent) => {
      if (!arrastando.current) return;
      const dx = e.clientX - arrastando.current.x;
      const dy = e.clientY - arrastando.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) girou.current = true;
      arrasto.current = { phi: dx / 300, theta: dy / 1000 };
    };

    const aoSoltar = () => {
      if (arrastando.current) {
        acumulado.current.phi += arrasto.current.phi;
        acumulado.current.theta += arrasto.current.theta;
        arrasto.current = { phi: 0, theta: 0 };
      }
      arrastando.current = null;
      parado.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    };

    window.addEventListener("pointermove", aoMover, { passive: true });
    window.addEventListener("pointerup", aoSoltar, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!reservarContexto()) return;

    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const foco = anguloDe(FOCO.lat, FOCO.lng);

    let globo: ReturnType<typeof createGlobe> | null = null;
    let quadro = 0;
    // Nasce um pouco antes do foco e assenta nele: a chegada mostra que é um
    // globo, e o repouso mostra QUAL pedaço do mundo interessa.
    let phi = foco.phi - 0.6;

    const iniciar = () => {
      // Mede a MOLDURA, não o pai imediato: o cobe injeta dois divs sem
      // classe entre o container e o canvas (para as âncoras dos marcadores),
      // e eles quebram tanto a medida quanto a centralização do flex — o
      // globo saía encostado à esquerda e cortado (visto em tela).
      const caixa = molduraRef.current?.getBoundingClientRect();
      const largura = Math.floor(Math.min(caixa?.width ?? 0, caixa?.height ?? 0) * 0.86);
      if (largura <= 0 || globo) return;
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${largura}px`;

      const cores = paleta();

      globo = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: largura,
        height: largura,
        phi,
        theta: foco.theta,
        dark: cores.dark,
        diffuse: 1.1,
        mapSamples: 12000,
        mapBrightness: cores.mapa,
        baseColor: cores.base,
        markerColor: cores.marca,
        glowColor: cores.brilho,
        markerElevation: 0.01,
        markers: pinos.map((p) => ({ location: [p.lat, p.lng] as [number, number], size: 0.035 })),
        opacity: 0.95,
      });

      const animar = () => {
        // A rotação livre é uma respiração lenta em torno do foco, não uma
        // volta ao mundo: o assunto da página é esta região.
        if (!parado.current && !reduzido) {
          phi += (foco.phi - phi) * 0.02;
        }
        globo!.update({
          phi: phi + acumulado.current.phi + arrasto.current.phi,
          theta: foco.theta + acumulado.current.theta + arrasto.current.theta,
        });
        quadro = requestAnimationFrame(animar);
      };

      animar();
      requestAnimationFrame(() => {
        canvas.style.opacity = "1";
      });
    };

    const caixaInicial = molduraRef.current?.getBoundingClientRect();
    if ((caixaInicial?.width ?? 0) > 0 && (caixaInicial?.height ?? 0) > 0) {
      iniciar();
    } else {
      const observador = new ResizeObserver((entradas) => {
        if ((entradas[0]?.contentRect.width ?? 0) > 0) {
          observador.disconnect();
          iniciar();
        }
      });
      if (molduraRef.current) observador.observe(molduraRef.current);
      return () => {
        observador.disconnect();
        liberarContexto();
      };
    }

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      globo?.destroy();
      liberarContexto();
    };
  }, [pinos]);

  return (
    <div ref={molduraRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={aoPressionar}
        onPointerUp={() => {
          // Só abre o mapa se foi TOQUE, não arrasto.
          if (!girou.current) aoAtivar();
        }}
        aria-hidden
        // Centralizado por posicionamento absoluto justamente por causa dos
        // wrappers que o cobe injeta: eles ignoram o flex da moldura.
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-opacity duration-1000"
        style={{ touchAction: "none" }}
      />

      {/* O convite é um botão de verdade: o canvas é aria-hidden e o teclado
          precisa de um alvo com nome para chegar ao mapa. */}
      <button
        type="button"
        onClick={aoAtivar}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-linha/20 bg-fundo/85 px-6 py-3 text-fluid-sm font-medium text-titulo shadow-lg backdrop-blur-md transition-transform duration-300 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
      >
        Ver o mapa de perto
      </button>
    </div>
  );
}
