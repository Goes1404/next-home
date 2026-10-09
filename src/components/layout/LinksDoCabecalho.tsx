"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LinkMenu } from "@/components/layout/MenuMobile";

/**
 * Os links do cabeçalho do site no computador, com a página atual marcada
 * (09/10/2026).
 *
 * O sublinhado da página atual já existia no CSS (`.link-nav[aria-current]`)
 * e nenhum cabeçalho escrevia o `aria-current`: o menu do celular dizia onde
 * a pessoa estava, o do computador não. Mora num componente à parte porque
 * os cabeçalhos são de servidor, e a rota atual só se lê no navegador.
 *
 * A ficha do imóvel acende "Imóveis": a página atual é ela ou qualquer uma
 * abaixo dela, como no menu do celular.
 */
export function LinksDoCabecalho({ links }: { links: LinkMenu[] }) {
  const caminho = usePathname();
  const atual = (href: string) => caminho === href || caminho.startsWith(`${href}/`);

  return (
    <ul className="hidden items-center gap-6 text-sm text-corpo sm:flex">
      {links.map((link) => {
        const aqui = atual(link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={aqui ? "page" : undefined}
              // Só a cor e o sublinhado: negrito alargaria o rótulo e empurraria
              // os vizinhos a cada troca de página.
              className={"link-nav transition-colors hover:text-acento-suave" + (aqui ? " text-titulo" : "")}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
