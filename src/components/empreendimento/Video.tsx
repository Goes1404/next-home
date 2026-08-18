import { Reveal } from "@/components/motion/Reveal";
import { videoEmbedUrl } from "@/lib/embedMidia";
import type { Midia } from "@/lib/types";

/**
 * Um vídeo por empreendimento — sempre `videos[0]`, como o site legado
 * também tratava. `url` é o link colado à mão (YouTube/Vimeo); quando não
 * bate com nenhum dos dois, cai pro `<video>` nativo (arquivo direto).
 */
export function Video({ videos }: { videos: Midia[] }) {
  if (videos.length === 0) return null;
  const video = videos[0];
  const embedUrl = videoEmbedUrl(video.url);

  return (
    <section id="video" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Vídeo</h2>
        <p className="text-fluid-base mt-2 text-mist-300">Conheça o empreendimento em vídeo.</p>
      </Reveal>

      <Reveal className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/50">
        <div className="aspect-video">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={video.alt || "Vídeo do empreendimento"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <video src={video.url} controls className="h-full w-full" />
          )}
        </div>
      </Reveal>
    </section>
  );
}
