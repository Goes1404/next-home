import { Wordmark } from "@/components/ui/Wordmark";
import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { HeaderCondensado } from "@/components/motion/HeaderCondensado";
import { MenuMobile } from "@/components/layout/MenuMobile";
import { LinksDoCabecalho } from "@/components/layout/LinksDoCabecalho";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { getTemaEscolhido } from "@/lib/tema";

const LINKS = [
  { href: "/empreendimentos", label: "Imóveis" },
  { href: "/financiamento", label: "Financiamento" },
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
    <HeaderCondensado className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <GlassSurface
        as="nav"
        preset="nav"
        className="flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-2.5"
      >
        <Link
          href="/"
          className="font-display shrink-0 text-lg leading-none font-medium tracking-tight whitespace-nowrap text-titulo"
        >
          <Wordmark destaque="text-acento-forte" />
        </Link>

        <LinksDoCabecalho links={LINKS} />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Some no mobile, junto com os links: só o essencial cabe ao lado
              da logo sem apertar — quem quer trocar o tema chega pelo rodapé. */}
          <div className="hidden sm:block">
            <SeletorTema atual={tema} />
          </div>

          {/* "Anunciar meu imóvel" saiu do menu em 13/09/2026 (pedido do
              usuário). A página /anunciar-imovel continua existindo — chega
              por link direto e pelo cartão do vendedor na home. */}
          <MenuMobile links={LINKS} />
        </div>
      </GlassSurface>
    </HeaderCondensado>
  );
}
