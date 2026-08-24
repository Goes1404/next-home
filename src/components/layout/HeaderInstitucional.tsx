import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { MenuMobile } from "@/components/layout/MenuMobile";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { getTemaEscolhido } from "@/lib/tema";

const LINKS = [
  { href: "/empreendimentos", label: "Imóveis" },
  { href: "/corretores", label: "Corretores" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

/**
 * Navegação do site institucional.
 *
 * Existe separada de `SiteHeader` de propósito: aquele serve o portfólio, que
 * não pode mudar — mesmo acrescentar um link ali alteraria a navegação dentro
 * do catálogo já aprovado. Os dois compartilham a mesma linguagem de vidro,
 * mas têm conteúdo e propósito diferentes.
 *
 * "Anunciar meu imóvel" ganha peso visual próprio (botão sólido, não link):
 * captar proprietário é o outro lado do negócio e, sem destaque, some no meio
 * dos links de quem quer comprar.
 */
export async function HeaderInstitucional() {
  const tema = await getTemaEscolhido();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <GlassSurface
        as="nav"
        preset="nav"
        className="flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-2.5"
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
              <Link href={link.href} className="transition-colors hover:text-acento-suave">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Some no mobile, junto com os links: só o essencial cabe ao lado
              da logo sem apertar — quem quer trocar o tema chega pelo rodapé. */}
          <div className="hidden sm:block">
            <SeletorTema atual={tema} />
          </div>

          {/* No celular a navegação inteira vive no MenuMobile: antes o
              header tinha só logo + um CTA, e nenhum caminho para catálogo,
              corretores, sobre ou contato. O botão de anunciar continua
              visível no desktop, onde há espaço para ele ao lado dos links. */}
          <Link
            href="/anunciar-imovel"
            className="hidden shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-brand-400 sm:inline-block"
          >
            Anunciar meu imóvel
          </Link>

          <MenuMobile links={LINKS} />
        </div>
      </GlassSurface>
    </header>
  );
}
