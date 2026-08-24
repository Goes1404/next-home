import { Reveal } from "@/components/motion/Reveal";
import type { Midia } from "@/lib/types";
import { PlayerVideo } from "./PlayerVideo";

/**
 * Todos os vídeos do empreendimento (YouTube/Vimeo/arquivo), não mais só o
 * primeiro: com o editor de mídias externas o corretor pode cadastrar
 * institucional + tour do decorado + obra, e cada um merece o próprio
 * player. Um vídeo ocupa a largura toda; dois ou mais viram grade.
 */
export function Video({ videos }: { videos: Midia[] }) {
  if (videos.length === 0) return null;

  return (
    <section id="video" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-titulo">{videos.length === 1 ? "Vídeo" : "Vídeos"}</h2>
        <p className="text-fluid-base mt-2 text-apoio">
          {videos.length === 1
            ? "Conheça o empreendimento em vídeo."
            : "Conheça o empreendimento por todos os ângulos."}
        </p>
      </Reveal>

      <div className={`mt-8 grid gap-4 ${videos.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {videos.map((video, i) => (
          <Reveal key={video.url} delay={i * 0.08}>
            <div className="overflow-hidden rounded-2xl border border-linha bg-superficie/50 shadow-painel">
              <PlayerVideo url={video.url} titulo={video.alt || "Vídeo do empreendimento"} />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
