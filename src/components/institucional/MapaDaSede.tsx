import { enderecoLinha, site } from "@/lib/site";

/** Mesma janela de ~800 m usada nas páginas de empreendimento, centrada no escritório. */
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

/**
 * O mapa do escritório — em Contato e em Sobre, o MESMO. Duas cópias da
 * mesma moldura divergiriam no primeiro ajuste.
 *
 * A coordenada é o centroide da via (Nominatim), não a porta do prédio; a
 * legenda diz "aproximado" por isso, e o link abre o mapa completo para
 * quem vai de fato até lá.
 */
export function MapaDaSede({ className }: { className?: string }) {
  const { lat, lng } = site.endereco;

  return (
    <figure
      className={["border-linha bg-superficie/50 overflow-hidden rounded-2xl border", className]
        .filter(Boolean)
        .join(" ")}
    >
      <iframe
        src={urlDoMapa(lat, lng)}
        title={`Mapa da região de ${enderecoLinha}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="aspect-[4/3] w-full border-0 sm:aspect-[16/10]"
      />
      <figcaption className="text-fluid-xs text-tenue flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2">
        <span>Mapa aproximado da região, para referência.</span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-acento-suave inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        >
          Abrir o mapa completo
        </a>
      </figcaption>
    </figure>
  );
}
