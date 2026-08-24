import { Reveal } from "@/components/motion/Reveal";
import type { Midia } from "@/lib/types";

/**
 * Tours virtuais do empreendimento. `url` é a página do tour hospedada por
 * terceiro (Matterport, Kuula, tour da construtora...) e entra direto num
 * iframe. Vários tours (decorado, área comum, planta A/B) aparecem
 * empilhados, cada um com o próprio título e link de tela cheia.
 */
export function Tour360({ tours }: { tours: Midia[] }) {
  if (tours.length === 0) return null;

  return (
    <section id="tour360" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-titulo">{tours.length === 1 ? "Tour 360°" : "Tours 360°"}</h2>
        <p className="text-fluid-base mt-2 text-apoio">
          Ande pelo imóvel sem sair de casa — arraste para olhar ao redor.
        </p>
      </Reveal>

      <div className="mt-8 space-y-10">
        {tours.map((tour, i) => (
          <Reveal key={tour.url} delay={i * 0.08}>
            {tours.length > 1 && tour.alt && (
              <h3 className="font-display mb-3 text-lg text-titulo">{tour.alt}</h3>
            )}
            <div className="overflow-hidden rounded-2xl border border-linha bg-superficie/50 shadow-painel">
              <iframe
                src={tour.url}
                title={tour.alt || `Tour virtual 360° ${i + 1}`}
                className="aspect-video w-full sm:aspect-[16/10]"
                allow="accelerometer; gyroscope; fullscreen; xr-spatial-tracking"
                allowFullScreen
                loading="lazy"
              />
            </div>
            <a
              href={tour.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluid-sm mt-3 inline-block font-medium text-acento-suave underline-offset-4 hover:underline"
            >
              Abrir {tour.alt ? `"${tour.alt}"` : "tour"} em tela cheia →
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
