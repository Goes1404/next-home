import { Wordmark } from "@/components/ui/Wordmark";
import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { HeaderCondensado } from "@/components/motion/HeaderCondensado";
import { MenuMobile } from "@/components/layout/MenuMobile";
import { LinksDoCabecalho } from "@/components/layout/LinksDoCabecalho";

const LINKS = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/mapa", label: "Mapa" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

/*
 * O menu do celular leva o site INTEIRO, e não só os quatro links de cima.
 * No computador o catálogo mantém a própria navegação (ver
 * HeaderInstitucional); no telefone, este menu é a única saída da página —
 * sem ele, quem caía num imóvel pelo anúncio não chegava a Financiamento nem
 * a Corretores sem rolar até o rodapé.
 */
const LINKS_DO_CELULAR = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/mapa", label: "Mapa" },
  { href: "/financiamento", label: "Financiamento" },
  { href: "/corretores", label: "Corretores" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

/**
 * Nav pill fixa, sempre sobre a imagem de fundo — por isso o vidro real
 * importa aqui.
 *
 * No celular ele tinha só a logo e uma seta para a listagem (09/10/2026): a
 * "barra inferior" que levaria a navegação nunca foi feita, e na própria
 * listagem a seta apontava para a página em que a pessoa já estava. Ganhou o
 * mesmo menu lateral do resto do site.
 */
export function SiteHeader() {
  return (
    <HeaderCondensado className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <GlassSurface
        as="nav"
        preset="nav"
        className="flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-2.5"
      >
        <Link
          href="/"
          className="font-display shrink-0 text-lg leading-none font-medium tracking-tight whitespace-nowrap text-titulo"
        >
          <Wordmark destaque="text-acento-forte" />
        </Link>

        <LinksDoCabecalho links={LINKS} />

        <MenuMobile links={LINKS_DO_CELULAR} />
      </GlassSurface>
    </HeaderCondensado>
  );
}
