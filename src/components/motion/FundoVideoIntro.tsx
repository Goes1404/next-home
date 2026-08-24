"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { INTRO_VIDEO_URL, INTRO_VIDEO_WEBM_URL } from "@/lib/site";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/**
 * Não exibe com movimento reduzido ou em economia de dados. Não há mais
 * corte por largura: a vinheta é o fundo em TODA tela.
 */
function podeExibir(): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

function inscrever(aoMudar: () => void): () => void {
  const movimento = window.matchMedia(CONSULTA_MOVIMENTO);
  movimento.addEventListener("change", aoMudar);
  return () => movimento.removeEventListener("change", aoMudar);
}

function usePodeExibir(): boolean {
  return useSyncExternalStore(inscrever, podeExibir, () => false);
}

/**
 * Fundo da home: o vídeo da vinheta de abertura (public/video/intro.*), a
 * mesma peça que o Preloader acabou de mostrar — ela desce para trás do
 * conteúdo e congela no último quadro. A continuidade é o ponto: a marca não
 * "sai" da tela quando a vinheta acaba, ela recua e vira ambiente.
 *
 * Por que o intro e não o hero-scroll: o intro pesa 0,7 MB (webm) contra
 * os 14,8 MB do vídeo de scrub — cabe no 4G sem comprometer a página. O
 * desktop continua com o hero-scroll intacto (HeroVideoBackground); este
 * componente é o par mobile dele, e os dois nunca montam juntos.
 *
 * O HTML do servidor nunca contém o vídeo (useSyncExternalStore devolve
 * false no SSR): quem está no desktop, com movimento reduzido ou com
 * Save-Data não baixa um byte. O fade-in evita o corte seco quando o
 * primeiro quadro chega.
 */
export function FundoVideoIntro() {
  const exibir = usePodeExibir();
  const ref = useRef<HTMLVideoElement>(null);
  const [pronto, setPronto] = useState(false);

  /**
   * Trava no último quadro em vez de repetir. `loop` sozinho reiniciaria a
   * vinheta a cada ciclo — a logo fecharia e sumiria sem parar; e só tirar
   * `loop` deixaria o vídeo "acabado" (alguns navegadores repintam o poster
   * ou o primeiro quadro no `ended`). Voltar um tico antes do fim e pausar
   * fixa a imagem final na tela.
   */
  const pararNoFim = () => {
    const v = ref.current;
    if (!v) return;
    if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.05);
    v.pause();
  };

  if (!exibir) return null;

  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden
      data-fundo-video
      onLoadedData={() => setPronto(true)}
      onEnded={pararNoFim}
      // `object-contain` e não `cover`: a peça é a LOGO da marca, e cortar as
      // bordas para preencher a tela decepava justamente o desenho. Contido,
      // ela aparece inteira; o que sobra em volta é o gradiente do layout.
      className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src={INTRO_VIDEO_WEBM_URL} type="video/webm" />
      <source src={INTRO_VIDEO_URL} type="video/mp4" />
    </video>
  );
}
