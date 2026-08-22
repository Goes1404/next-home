import { Reveal } from "@/components/motion/Reveal";
import type { Midia } from "@/lib/types";

/**
 * Um tour por empreendimento — sempre `tours[0]`. `url` é a página do tour
 * hospedada por terceiro (construtora, Matterport, Kuula...) e entra direto
 * num iframe, sem transformação — é assim que o site legado também fazia.
 */
export function Tour360({ tours }: { tours: Midia[] }) {
  if (tours.length === 0) return null;
  const tour = tours[0];

  return (
    <section id="tour360" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-titulo">Tour 360°</h2>
        <p className="text-fluid-base mt-2 text-apoio">
          Ande pelo decorado — arraste pra olhar ao redor.
        </p>
      </Reveal>

      <Reveal className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-superficie/50">
        <iframe
          src={tour.url}
          title={tour.alt || "Tour virtual 360°"}
          className="aspect-video w-full sm:aspect-[16/10]"
          allow="accelerometer; gyroscope; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </Reveal>

      <a
        href={tour.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-fluid-sm mt-3 inline-block text-acento-suave underline-offset-4 hover:underline"
      >
        Abrir tour em tela cheia →
      </a>
    </section>
  );
}
