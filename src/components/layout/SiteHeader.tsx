import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";

const LINKS = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/mapa", label: "Mapa" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

/** Nav pill fixa, sempre sobre a imagem de fundo — por isso o vidro real importa aqui. */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <GlassSurface
        as="nav"
        preset="nav"
        className="flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-2.5"
      >
        <Link
          href="/"
          className="font-display shrink-0 text-lg leading-none font-medium tracking-tight whitespace-nowrap text-titulo"
        >
          Next<span className="text-acento-forte">Home</span>
        </Link>

        <ul className="hidden items-center gap-6 text-sm text-corpo sm:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition-colors hover:text-acento">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* No mobile a navegação principal fica na barra inferior (Fase 4);
            aqui basta um atalho compacto para não competir com a logo. */}
        <Link
          href="/empreendimentos"
          aria-label="Ver empreendimentos"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-400 sm:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </GlassSurface>
    </header>
  );
}
