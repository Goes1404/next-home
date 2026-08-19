import { Reveal } from "@/components/motion/Reveal";
import type { Empreendimento } from "@/lib/types";

/**
 * Meio-grau de janela do mapa, em graus decimais (~800 m). As coordenadas
 * cadastradas são centroides de via/bairro, não a porta do prédio — este
 * enquadramento mostra a região com honestidade, sem sugerir uma precisão
 * que o dado não tem.
 */
const RAIO_GRAUS = 0.008;

function urlDoMapa(lat: number, lng: number): string {
  const bbox = [lng - RAIO_GRAUS, lat - RAIO_GRAUS, lng + RAIO_GRAUS, lat + RAIO_GRAUS];
  const params = new URLSearchParams({
    bbox: bbox.join(","),
    layer: "mapnik",
    marker: `${lat},${lng}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params}`;
}

export function Localizacao({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const temCoordenadas = e.lat !== null && e.lng !== null;
  const comoChegar = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    e.endereco || `${e.bairro}, ${e.cidade}`,
  )}`;

  return (
    <section id="localizacao" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-titulo">Localização</h2>

        <div className="mt-6 overflow-hidden rounded-2xl border border-linha/10 bg-superficie">
          {temCoordenadas && (
            <iframe
              src={urlDoMapa(e.lat!, e.lng!)}
              title={`Mapa da região de ${e.nome}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="aspect-[4/3] w-full border-0 sm:aspect-[16/9]"
            />
          )}

          <div className="px-6 py-6">
            <p className="text-fluid-lg text-titulo">{e.endereco}</p>
            <p className="text-fluid-sm mt-1 text-legenda">
              {e.bairro} · {e.cidade}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                href={comoChegar}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluid-sm inline-flex items-center gap-1.5 font-medium text-acento underline-offset-4 hover:underline"
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
                  />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                Como chegar
              </a>
              {temCoordenadas && (
                <p className="text-fluid-xs text-tenue">
                  Mapa aproximado da região, para referência.
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
