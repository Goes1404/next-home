"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { INTRO_VIDEO_URL, INTRO_VIDEO_WEBM_URL } from "@/lib/site";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOBILE = "(max-width: 767px)";
const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/**
 * Não exibe fora do celular, com movimento reduzido ou em economia de dados —
 * ao contrário do skyline de partículas (que era cálculo local), aqui há
 * download de verdade, então `saveData` volta a valer.
 */
function podeExibir(): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  if (!window.matchMedia(CONSULTA_MOBILE).matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

function inscrever(aoMudar: () => void): () => void {
  const mobile = window.matchMedia(CONSULTA_MOBILE);
  const movimento = window.matchMedia(CONSULTA_MOVIMENTO);
  mobile.addEventListener("change", aoMudar);
  movimento.addEventListener("change", aoMudar);
  return () => {
    mobile.removeEventListener("change", aoMudar);
    movimento.removeEventListener("change", aoMudar);
  };
}

function usePodeExibir(): boolean {
  return useSyncExternalStore(inscrever, podeExibir, () => false);
}

/**
 * Fundo do CELULAR: o vídeo da vinheta de abertura (public/video/intro.*)
 * em loop mudo atrás do conteúdo — a mesma peça de marca do Preloader,
 * agora morando também no background.
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
export function FundoVideoMobile() {
  const exibir = usePodeExibir();
  const ref = useRef<HTMLVideoElement>(null);
  const [pronto, setPronto] = useState(false);

  if (!exibir) return null;

  return (
    <video
      ref={ref}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      onLoadedData={() => setPronto(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src={INTRO_VIDEO_WEBM_URL} type="video/webm" />
      <source src={INTRO_VIDEO_URL} type="video/mp4" />
    </video>
  );
}
