import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";

/**
 * O selo da Astro Soluções (28/10/2026): ladrilho azul-marinho com um "A"
 * aberto, a órbita e uma estrela. Mesmo desenho do ícone gerado por
 * `scripts/marca/gerarIconeAstroimob.mjs`. Cores fixas: é a marca da
 * plataforma, não segue o tema nem a cor do grupo.
 */
export function SeloAstro({ className = "size-8", titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true}>
      {titulo && <title>{titulo}</title>}
      <defs>
        <linearGradient id="selo-astro-fundo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b3a6b" />
          <stop offset="1" stopColor="#0a1830" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#selo-astro-fundo)" />
      <path d="M18 48 L32 15 L46 48" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="32" cy="37" rx="24" ry="7.5" transform="rotate(-18 32 37)" fill="none" stroke={MARCA_DA_PLATAFORMA.cores.claro} strokeWidth="2.6" />
      <path d="M49 15 L50.6 19.4 L55 21 L50.6 22.6 L49 27 L47.4 22.6 L43 21 L47.4 19.4 Z" fill="#fff" />
    </svg>
  );
}

/** Selo + "Astro Soluções" escrito, para o login e a área da plataforma. */
export function MarcaAstro({ selo = "size-8", destaque, className }: { selo?: string; destaque: string; className?: string }) {
  const [a, b] = MARCA_DA_PLATAFORMA.wordmark;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <SeloAstro className={`${selo} shrink-0`} />
      <span className="whitespace-nowrap">
        {a}
        <span className={destaque}>{b}</span>
      </span>
    </span>
  );
}
