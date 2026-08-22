"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGlassBackground } from "@/components/glass/GlassBackground";
import { HERO_VIDEO_URL, HERO_VIDEO_WEBM_URL } from "@/lib/site";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/** Não exibe se o usuário pediu menos movimento ou está economizando dados. */
function podeExibirVideo(): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

function inscrever(aoMudar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_MOVIMENTO);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

/**
 * `false` no servidor e na primeira pintura — o HTML entregue nunca contém
 * o vídeo, então quem pediu movimento reduzido ou economia de dados não
 * chega a baixar o arquivo.
 */
function usePodeExibirVideo(): boolean {
  return useSyncExternalStore(inscrever, podeExibirVideo, () => false);
}

/**
 * Vídeo decorativo por trás do hero, com o próprio scroll da página como
 * controle remoto: no topo mostra o primeiro quadro, no fim da página
 * mostra o último, e rolar pra cima volta o vídeo — nunca toca sozinho.
 *
 * A imagem estática (renderizada pelo chamador, por baixo deste componente)
 * garante um LCP rápido via SSR; o vídeo só começa a baixar depois de
 * montado no cliente e só aparece quando os metadados chegam — daí o
 * fade-in em vez de um corte brusco.
 *
 * O `ScrollTrigger` compartilha o relógio do Lenis (ver SmoothScroll.tsx),
 * então o progresso lido aqui é o mesmo scroll suavizado que o resto do
 * site anima com — sem isso o vídeo saltaria à frente do que a rolagem
 * suave ainda está desenhando na tela.
 *
 * A suavização do `currentTime` é um lerp contínuo no ticker do GSAP, e
 * não um `gsap.to` por evento de scroll: criar um tween novo (com
 * `overwrite`) a cada tique de rolagem gerava rajadas de tweens que
 * nasciam e morriam dezenas de vezes por segundo — cada troca reiniciava a
 * curva de easing e o vídeo andava em degraus. O lerp persegue o alvo no
 * mesmo relógio do Lenis, quadro a quadro, e só escreve em `currentTime`
 * quando o seek anterior já terminou (`seeking`), para não enfileirar
 * seeks que o decoder ainda não drenou.
 *
 * Isso só é fluido de verdade porque o arquivo coopera: o vídeo do hero é
 * codificado com todo quadro sendo keyframe (ver HERO_VIDEO_URL em
 * site.ts) — seek em vídeo de keyframe esparso obriga o decoder a
 * redecodificar o GOP inteiro a cada scroll, que era a causa raiz dos
 * engasgos.
 *
 * Assim que os metadados chegam, se registra no `GlassBackgroundProvider` —
 * os painéis de vidro passam a refratar o próprio vídeo (ver
 * GlassCanvas.tsx), em vez de caírem no gradiente procedural que existe
 * para quando não há nada para refratar.
 */
/**
 * Tempo até desistir de um vídeo que nem metadados entrega.
 *
 * Sem este teto, um fundo que trava no meio do download deixa o `<video>`
 * em `opacity: 0` PARA SEMPRE — a tela fica no gradiente liso e o site
 * parece quebrado (foi o sintoma relatado: "às vezes não carrega o
 * efeito"). Vale para o vídeo do site e, principalmente, para o fundo
 * personalizado do corretor, que vem de um bucket externo.
 */
const LIMITE_CARREGAMENTO_MS = 8000;

export function HeroVideoBackground({ src, srcWebm }: { src: string; srcWebm?: string }) {
  const permitido = usePodeExibirVideo();
  /*
   * Fonte em uso. Quando o fundo PERSONALIZADO do corretor falha, cai uma
   * vez para o vídeo padrão do site (local, sempre disponível) em vez de
   * deixar a tela sem fundo nenhum: o visitante vê o site da imobiliária
   * funcionando, não um erro de cadastro de outra pessoa.
   */
  const [estado, setEstado] = useState<{
    /** src que a prop tinha quando este estado nasceu — trocou, tudo recomeça. */
    origem: string;
    fonte: { src: string; webm?: string };
    pronto: boolean;
    falhou: boolean;
  } | null>(null);

  const atual =
    estado?.origem === src
      ? estado
      : { origem: src, fonte: { src, webm: srcWebm }, pronto: false, falhou: false };
  const { fonte, pronto, falhou } = atual;
  const { definirVideo } = useGlassBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => definirVideo(null);
  }, [definirVideo]);

  /**
   * Rede lenta não avisa que desistiu: o `<video>` simplesmente nunca
   * dispara `loadedmetadata` nem `error`. Este relógio é o que transforma
   * "carregando para sempre" numa decisão.
   */
  const aoFalhar = useCallback(() => {
    setEstado((anterior) => {
      const base = anterior?.origem === src ? anterior : atual;
      if (base.falhou) return base;

      // Queda única: o fundo PERSONALIZADO do corretor falhou, então entra o
      // vídeo padrão do site (local, sempre disponível). O visitante vê o
      // site da imobiliária funcionando, não o erro de cadastro de alguém.
      if (base.fonte.src !== HERO_VIDEO_URL && HERO_VIDEO_URL) {
        console.warn("Fundo personalizado indisponível; usando o vídeo padrão do site.");
        return {
          origem: src,
          fonte: { src: HERO_VIDEO_URL, webm: HERO_VIDEO_WEBM_URL },
          pronto: false,
          falhou: false,
        };
      }
      return { ...base, origem: src, pronto: false, falhou: true };
    });
    // `atual` é derivado das props a cada render; a dependência real é o src.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (!permitido || pronto || falhou) return;
    const relogio = window.setTimeout(aoFalhar, LIMITE_CARREGAMENTO_MS);
    return () => window.clearTimeout(relogio);
  }, [permitido, pronto, falhou, fonte.src, aoFalhar]);

  useEffect(() => {
    if (!pronto) return;
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;

    gsap.registerPlugin(ScrollTrigger);

    let alvo = video.currentTime;

    const gatilho = ScrollTrigger.create({
      // Sem `trigger`, só o range numérico: com `document.documentElement`
      // como trigger, `top top`/`bottom bottom` nunca reconhece o scroll da
      // página inteira (o retângulo do próprio <html> não se move) — o
      // `onUpdate` simplesmente não dispara. Faixa numérica é o jeito que
      // funciona para "progresso da página toda".
      start: 0,
      end: () => document.documentElement.scrollHeight - window.innerHeight,
      onUpdate: (self) => {
        alvo = self.progress * video.duration;
      },
    });

    const perseguir = (_t: number, deltaMs: number) => {
      if (video.seeking) return;

      const distancia = alvo - video.currentTime;
      // Perto o bastante do alvo: para de escrever. Sem esta folga, o lerp
      // escreveria `currentTime` a 60fps mesmo com a página parada, e cada
      // escrita é um seek que custa decodificação.
      if (Math.abs(distancia) < 1 / 60) return;

      // Fator compensado pelo delta real do frame: a perseguição tem a
      // mesma "elasticidade" a 60Hz ou 144Hz.
      const fator = 1 - Math.exp(-deltaMs / 180);
      video.currentTime += distancia * fator;
    };

    gsap.ticker.add(perseguir);

    return () => {
      gsap.ticker.remove(perseguir);
      gatilho.kill();
    };
  }, [pronto]);

  // Falhou de vez: o gradiente do layout é o piso do desenho, e é melhor
  // que um elemento invisível ocupando a tela.
  if (!permitido || falhou) return null;

  return (
    <video
      key={fonte.src}
      ref={videoRef}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
      muted
      playsInline
      preload="auto"
      // O vídeo vira textura WebGL (GlassCanvas) — sem crossOrigin, o WebGL
      // recusa ler pixels de um <video> de outra origem (o bucket do
      // Supabase Storage usado pelo fundo personalizado do corretor).
      crossOrigin="anonymous"
      onLoadedMetadata={() => {
        setEstado((anterior) => ({ ...(anterior?.origem === src ? anterior : atual), origem: src, pronto: true }));
        definirVideo(videoRef.current);
      }}
      onError={aoFalhar}
      aria-hidden
    >
      {/* WebM primeiro: menor e é o que Chromium sem codecs proprietários
          decodifica; o MP4 cobre Safari antigo. Só o vídeo padrão do site
          tem as duas versões — o fundo personalizado do corretor (Supabase
          Storage) chega como MP4 único. */}
      {fonte.webm && <source src={fonte.webm} type="video/webm" />}
      <source src={fonte.src} type="video/mp4" />
    </video>
  );
}
