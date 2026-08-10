"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { liberarContexto, reservarContexto } from "./orcamentoWebgl";
import { useGlassFallback } from "./useGlassFallback";

// O canvas só existe no cliente e só é baixado quando algum painel usa WebGL.
const GlassCanvas = dynamic(() => import("./GlassCanvas"), { ssr: false });

type Preset = "painel" | "nav" | "card" | "pill";

/** Ajustes por contexto de uso: superfícies pequenas pedem menos refração. */
const PRESETS = {
  painel: { radius: 24, thickness: 26, refraction: 0, chromatic: 0, blur: 14, liquid: 0 },
  nav: { radius: 999, thickness: 18, refraction: 14, chromatic: 0.12, blur: 5, liquid: 0 },
  card: { radius: 20, thickness: 22, refraction: 18, chromatic: 0.14, blur: 2, liquid: 0.5 },
  pill: { radius: 999, thickness: 14, refraction: 11, chromatic: 0.1, blur: 5, liquid: 0 },
} as const satisfies Record<Preset, Record<string, number>>;

/** Teal da marca em 0..1, para tingir o vidro. */
const TINT_MARCA: [number, number, number] = [0, 0.349, 0.31];

export type GlassSurfaceProps = {
  children?: React.ReactNode;
  className?: string;
  preset?: Preset;
  /** Multiplica refração e ondulação do preset. */
  intensity?: number;
  /** Quanto do teal da marca entra no vidro (0 a 1). */
  tint?: number;
  as?: "div" | "header" | "nav" | "section" | "article" | "aside";
};

export function GlassSurface({
  children,
  className,
  preset = "painel",
  intensity = 1,
  tint = 0.12,
  as: Tag = "div",
}: GlassSurfaceProps) {
  const modo = useGlassFallback();
  const [temSlot, setTemSlot] = useState(false);

  // Reserva um contexto WebGL; se a cota da página acabou, fica no fallback.
  // A aquisição de um recurso externo finito (a cota de contextos do
  // navegador) é síncrona por natureza — não há valor derivável de
  // props/state que substitua isto, por isso o setState direto no efeito é
  // intencional aqui.
  //
  // O preset "painel" nunca pede WebGL: por escolha visual (o fallback em
  // CSS — backdrop-filter nativo — ficou com a cara que o cliente queria,
  // mais suave que o shader), esses painéis sempre caem no `vidro-css`. Como
  // bônus, param de disputar os 5 slots do orçamento com nav/pill/card.
  useEffect(() => {
    if (preset === "painel") return;
    if (modo !== "webgl") return;
    if (!reservarContexto()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTemSlot(true);
    return () => {
      liberarContexto();
      setTemSlot(false);
    };
  }, [modo, preset]);

  const p = PRESETS[preset];
  const usaWebgl = preset !== "painel" && modo === "webgl" && temSlot;
  const opaco = preset === "nav" || preset === "pill";

  return (
    <Tag
      className={cn(
        "relative isolate overflow-hidden",
        // `backdrop-filter` é caro; com o canvas cobrindo o painel inteiro ele
        // seria trabalho jogado fora, então cada modo pinta só o que precisa.
        // As utilities do Tailwind (não CSS à mão) porque o Lightning CSS
        // descarta `backdrop-filter` sem prefixo em produção quando escrito
        // manualmente em globals.css — ver comentário em `.vidro-css`.
        usaWebgl ? "vidro-webgl" : ["vidro-css", opaco ? "backdrop-blur-2xl backdrop-saturate-150" : "backdrop-blur-xl backdrop-saturate-150"],
        // Nav e pill ficam fixos na tela com conteúdo passando por baixo o
        // tempo todo ao rolar; precisam de mais opacidade para não brigar
        // visualmente com o que está sendo rolado.
        opaco && "vidro-opaco",
        opaco ? "rounded-full" : "rounded-glass",
        className,
      )}
    >
      {usaWebgl && (
        <GlassCanvas
          radius={p.radius}
          thickness={p.thickness}
          refraction={p.refraction * intensity}
          chromatic={p.chromatic}
          blur={p.blur}
          liquid={p.liquid * intensity}
          tint={TINT_MARCA}
          tintAmount={tint}
        />
      )}
      {children}
    </Tag>
  );
}
