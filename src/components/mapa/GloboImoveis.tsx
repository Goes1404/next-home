"use client";

import { useCallback, useEffect, useRef } from "react";
import createGlobe from "cobe";
import { liberarContexto, reservarContexto } from "@/components/glass/orcamentoWebgl";
import { DURACAO_MERGULHO_MS, estadoDaTransicao } from "./transicaoGlobo";

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

/** Posições fixas da poeira estelar (percentuais da moldura). */
const POEIRA = [
  { x: 12, y: 18, dur: 3.2, atraso: 0 },
  { x: 88, y: 22, dur: 4.1, atraso: 0.6 },
  { x: 24, y: 74, dur: 3.6, atraso: 1.2 },
  { x: 76, y: 68, dur: 4.6, atraso: 0.3 },
  { x: 8, y: 52, dur: 3.9, atraso: 1.8 },
  { x: 94, y: 48, dur: 3.3, atraso: 0.9 },
  { x: 34, y: 8, dur: 4.3, atraso: 1.5 },
  { x: 62, y: 90, dur: 3.5, atraso: 0.4 },
  { x: 18, y: 36, dur: 4.8, atraso: 2.1 },
  { x: 82, y: 84, dur: 3.1, atraso: 1.1 },
  { x: 46, y: 14, dur: 4.4, atraso: 0.8 },
  { x: 56, y: 82, dur: 3.7, atraso: 1.6 },
];

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

  // Nos DOIS temas o globo é ESCURO: uma esfera de teal profundo com os
  // continentes desenhados em pontos claros. A primeira tentativa deixava o
  // globo claro no tema claro para "combinar" com a página — e o resultado
  // foi um disco lavado, sem massa nem contorno, que sumia no fundo. Uma
  // esfera escura sobre página clara é justamente o que dá o destaque: vira
  // objeto, não mancha.
  return {
    dark: 1,
    base: [0.02, 0.15, 0.13] as [number, number, number],
    brilho: (claro ? [0.11, 0.5, 0.4] : [0.06, 0.36, 0.29]) as [number, number, number],
    // Brilho do mapa alto: é o que faz os continentes aparecerem como pontos
    // luminosos em vez de um chuvisco cinza.
    mapa: 14,
    marca: lerCor("--color-acento-forte", "#2fd6a4"),
    difusa: 1.6,
  };
}

export function GloboImoveis({
  pinos,
  aoAtivar,
  aoAproximar,
  mergulhando = false,
  aoFimDoMergulho,
  className = "",
}: {
  pinos: PinoGlobo[];
  /** Chamado quando o visitante pede o mapa de perto. */
  aoAtivar: () => void;
  /**
   * O visitante demonstrou intenção (o ponteiro chegou no botão, ou o dedo
   * encostou no globo). Serve para o pai montar o mapa ANTES da queda: o
   * Leaflet trava a thread ao nascer, e esse engasgo no meio da animação é
   * visível. Medido em dev: durante a montagem o rAF fica ~900ms sem tique.
   */
  aoAproximar?: () => void;
  /**
   * A câmera está caindo sobre a região. Quem decide é o pai, porque é ele
   * que monta o mapa por baixo — a transição é um cruzamento entre os dois,
   * não um efeito interno do globo.
   */
  mergulhando?: boolean;
  /** O mergulho acabou: o globo já não é visível e pode ser desmontado. */
  aoFimDoMergulho?: () => void;
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
  // O mergulho é lido pelo laço de animação, que não re-renderiza: por isso
  // ref, e não estado. `useEffect` abaixo só espelha a prop aqui dentro.
  const mergulho = useRef<{ inicio: number } | null>(null);
  const fimDoMergulho = useRef(aoFimDoMergulho);
  const aoAproximarRef = useRef(aoAproximar);

  const aoPressionar = useCallback((e: React.PointerEvent) => {
    // No toque não existe "passar o ponteiro por cima": o aviso de intenção
    // possível é o dedo encostando.
    aoAproximarRef.current?.();
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

  // Escrever em ref durante o render é proibido (o React pode descartar o
  // trabalho e a escrita fica); num efeito é sempre depois do commit.
  useEffect(() => {
    fimDoMergulho.current = aoFimDoMergulho;
    aoAproximarRef.current = aoAproximar;
  }, [aoFimDoMergulho, aoAproximar]);

  useEffect(() => {
    if (mergulhando && !mergulho.current) mergulho.current = { inicio: performance.now() };
  }, [mergulhando]);

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
      const largura = Math.floor(Math.min(caixa?.width ?? 0, caixa?.height ?? 0) * 0.78);
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
        diffuse: cores.difusa,
        // Mais amostras: com 12 000 os pontos ficavam esparsos e a costa do
        // Brasil não se lia.
        mapSamples: 18000,
        mapBrightness: cores.mapa,
        baseColor: cores.base,
        markerColor: cores.marca,
        glowColor: cores.brilho,
        markerElevation: 0.02,
        markers: pinos.map((p) => ({ location: [p.lat, p.lng] as [number, number], size: 0.045 })),
        opacity: 1,
      });

      const moldura = molduraRef.current;
      let terminou = false;

      const animar = () => {
        // A rotação livre é uma respiração lenta em torno do foco, não uma
        // volta ao mundo: o assunto da página é esta região.
        if (!parado.current && !reduzido && !mergulho.current) {
          phi += (foco.phi - phi) * 0.02;
        }

        /*
         * MERGULHO. A curva mora em `transicaoGlobo.ts`; aqui só se aplica
         * o que ela diz, em três lugares: o estado do cobe (escala, brilho,
         * difusa), o CSS do canvas (escala e desfoque, que continuam o
         * movimento para fora da moldura) e a atmosfera, que sai antes.
         */
        if (mergulho.current) {
          const t = (performance.now() - mergulho.current.inicio) / DURACAO_MERGULHO_MS;
          const e = estadoDaTransicao(t);

          // A câmera volta ao foco antes de cair: mergulhar a partir do
          // ângulo que o visitante deixou levaria a lente ao Atlântico.
          const peso = e.pesoDoArrasto;
          globo!.update({
            phi: phi + (acumulado.current.phi + arrasto.current.phi) * peso,
            theta: foco.theta + (acumulado.current.theta + arrasto.current.theta) * peso,
            scale: e.escalaGlobo,
            mapBrightness: e.brilhoDoMapa,
            diffuse: e.difusa,
            opacity: e.opacidadeGlobo,
          });

          canvas.style.transform = `translate(-50%, -50%) scale(${e.escalaCss})`;
          canvas.style.filter = e.desfoque > 0.05 ? `blur(${e.desfoque.toFixed(2)}px)` : "";
          canvas.style.opacity = String(e.opacidadeGlobo);
          if (moldura) moldura.style.setProperty("--atmosfera", String(e.opacidadeAtmosfera));

          if (t >= 1 && !terminou) {
            terminou = true;
            fimDoMergulho.current?.();
          }
          quadro = requestAnimationFrame(animar);
          return;
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
    <div
      ref={molduraRef}
      /*
       * `--atmosfera` é escrita pelo laço de animação e lida pelas três
       * camadas decorativas. Uma variável só, num pai só: mexer em doze
       * elementos por quadro custaria doze escritas de estilo, e o efeito é
       * o mesmo.
       */
      style={{ "--atmosfera": 1 } as React.CSSProperties}
      className={`relative overflow-hidden ${className}`}
    >
      {/* ATMOSFERA — três camadas atrás do globo, todas decorativas e em
          transform/opacity puros (nada que peça layout). Sem elas o globo
          flutuava sozinho num retângulo vazio e parecia um recorte. */}

      {/* 1. Halo: o brilho que sai de trás da esfera e respira devagar. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl motion-safe:animate-[respirar_7s_ease-in-out_infinite]"
        style={{
          opacity: "calc(var(--atmosfera) * 0.9)",
          background:
            "radial-gradient(circle, var(--color-acento-forte) 0%, color-mix(in oklab, var(--color-acento-forte) 45%, transparent) 38%, transparent 66%)",
        }}
      />

      {/* 2. Órbitas: dois anéis finos inclinados, girando em ritmos
             diferentes — dão escala e movimento sem competir com o globo.

             Cada anel é um PAR: o pai posiciona e inclina, o filho só gira.
             Juntar as duas coisas num elemento só fazia o transform da
             animação sobrescrever o do posicionamento, e os anéis saíam
             deslocados para fora do globo. */}
      <span
        aria-hidden
        style={{ opacity: "var(--atmosfera)" }}
        className="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[94%] -translate-x-1/2 -translate-y-1/2 [perspective:900px]"
      >
        <span className="block h-full w-full rounded-full border border-acento-forte/30 [transform:rotateX(74deg)] motion-safe:animate-[girar_26s_linear_infinite]" />
      </span>
      <span
        aria-hidden
        style={{ opacity: "var(--atmosfera)" }}
        className="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-[112%] -translate-x-1/2 -translate-y-1/2 [perspective:900px]"
      >
        <span className="block h-full w-full rounded-full border border-acento-forte/18 [transform:rotateX(66deg)_rotateZ(28deg)] motion-safe:animate-[girar_40s_linear_infinite_reverse]" />
      </span>

      {/* 3. Poeira estelar: pontos fixos que cintilam. São 12 posições
             escritas à mão em vez de sorteadas — sorteio no render daria
             posições diferentes no servidor e no cliente. */}
      {POEIRA.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute h-[3px] w-[3px] rounded-full bg-acento-forte/70 motion-safe:animate-[cintilar_var(--dur)_ease-in-out_infinite]"
          style={
            {
              top: `${p.y}%`,
              left: `${p.x}%`,
              opacity: "calc(var(--atmosfera) * 0.85)",
              "--dur": `${p.dur}s`,
              animationDelay: `${p.atraso}s`,
            } as React.CSSProperties
          }
        />
      ))}

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
        className="absolute top-1/2 left-1/2 cursor-grab opacity-0 transition-opacity duration-1000"
        // O transform base é inline porque o laço do mergulho o reescreve a
        // cada quadro; com a classe utilitária, a escala do mergulho e a
        // centralização brigariam pelo mesmo `transform` (a mesma armadilha
        // que já aconteceu com os anéis de órbita).
        style={{ touchAction: "none", transform: "translate(-50%, -50%)" }}
      />

      {/* O convite é um botão de verdade: o canvas é aria-hidden e o teclado
          precisa de um alvo com nome para chegar ao mapa. */}
      <button
        type="button"
        onClick={aoAtivar}
        onPointerEnter={aoAproximar}
        onFocus={aoAproximar}
        // Durante a queda ele sai de cena junto com o resto: um convite
        // parado sobre uma câmera em movimento é o que denuncia efeito
        // colado por cima.
        style={{ opacity: mergulhando ? 0 : 1, pointerEvents: mergulhando ? "none" : undefined }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 rounded-full border border-linha/20 bg-fundo/85 px-6 py-3 text-fluid-sm font-medium text-titulo shadow-lg backdrop-blur-md transition-transform duration-300 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
      >
        Ver o mapa de perto
      </button>
    </div>
  );
}
