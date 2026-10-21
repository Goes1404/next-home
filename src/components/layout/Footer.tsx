import { LogoDaMarca } from "@/components/ui/LogoDaMarca";
import Link from "next/link";
import { FundoEmCamadas } from "@/components/motion/FundoEmCamadas";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { linhaDoEndereco, redesDaMarca, type MarcaDoSite } from "@/lib/sites/marca";
import { linkDoPorteiro } from "@/lib/whatsapp/linkDoPorteiro";

const LINKS_RAPIDOS = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/financiamento", label: "Financiamento" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
  { href: "/privacidade", label: "Privacidade" },
];

/**
 * Rodapé institucional — único lugar que precisa existir só uma vez, por
 * isso vive num layout em vez de repetido em cada página (diferente de
 * SiteHeader/WhatsappCta, que dependem do GlassBackgroundProvider local a
 * cada rota).
 *
 * Desde a fase 3 (20/10/2026) mora no layout do SITE (`src/app/s/[site]`),
 * não no raiz, e recebe a marca do site servido: no site de outro grupo,
 * CRECI, endereço e redes da Next Home nunca aparecem — o que ele não tem,
 * some. O "Falar no WhatsApp" é o porteiro relativo (`/wa`), que sorteia
 * entre os corretores do grupo do endereço.
 */
export function Footer({ marca }: { marca: MarcaDoSite }) {
  const endereco = linhaDoEndereco(marca);
  const redes = redesDaMarca(marca);
  return (
    <footer className="relative overflow-hidden border-t border-linha/10 bg-superficie px-4 py-14 sm:px-8">
      <FundoEmCamadas intensidade={0.5} />
      <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg text-titulo">
            <LogoDaMarca marca={marca} destaque="text-acento-forte" altura="h-10" />
          </p>
          <p className="text-fluid-sm mt-3 max-w-xs text-legenda">{marca.descricao}</p>
          {marca.creci && <p className="text-fluid-xs mt-4 text-tenue">CRECI {marca.creci}</p>}
        </div>

        <div>
          <p className="text-fluid-sm font-medium text-corpo">Navegação</p>
          <ul className="mt-3 space-y-2">
            {LINKS_RAPIDOS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-fluid-sm text-legenda inline-flex min-h-11 items-center transition-colors hover:text-acento-suave"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-fluid-sm font-medium text-corpo">Contato</p>
          <ul className="mt-3 space-y-2">
            {endereco && <li className="text-fluid-sm text-legenda">{endereco}</li>}
            <li>
              <a
                href={linkDoPorteiro({ intencao: "saber" })}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluid-sm text-legenda inline-flex min-h-11 items-center transition-colors hover:text-acento-suave"
              >
                Falar no WhatsApp
              </a>
            </li>
            {/* O WhatsApp e o e-mail que a imobiliária pôs em "Meu site" (0209).
                O botão acima segue pelo porteiro (`/wa`); este número é só o
                da casa, para quem prefere ligar. A Next Home não entra aqui. */}
            {!marca.ehNextHome &&
              marca.whatsapp.map((w) => (
                <li key={w.numero}>
                  <a
                    href={`tel:+${w.numero}`}
                    className="text-fluid-sm text-legenda inline-flex min-h-11 items-center transition-colors hover:text-acento-suave"
                  >
                    {w.label}
                  </a>
                </li>
              ))}
            {marca.email && (
              <li>
                <a
                  href={`mailto:${marca.email}`}
                  className="text-fluid-sm text-legenda inline-flex min-h-11 items-center break-all transition-colors hover:text-acento-suave"
                >
                  {marca.email}
                </a>
              </li>
            )}
          </ul>

          <div className="mt-5 flex gap-4">
            {redes.map((rede) => (
              <a
                key={rede.label}
                href={rede.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={rede.label}
                className="text-fluid-xs text-tenue inline-flex min-h-11 items-center transition-colors hover:text-acento-suave"
              >
                {rede.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="text-fluid-xs mx-auto mt-12 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-linha/5 pt-6 text-tenue">
        <p>
          © {new Date().getFullYear()} {marca.nomeCompleto}.{marca.creci ? ` CRECI ${marca.creci}.` : ""}
        </p>

        {/*
          Único acesso à área do corretor no site — sem isso só se chega
          digitando a URL.

          Começou como um link de texto solto aqui e o cliente não o
          encontrou: cinza escuro, 13px, ao lado do copyright, ele não se
          parecia com algo clicável. Agora tem contorno, cadeado e contraste
          de link de verdade. Continua no rodapé, e não no menu, porque é
          ferramenta de equipe — mas achável é requisito, discreto é estilo.

          Aponta para `/corretor` e não para `/corretor/entrar`: quem já tem
          sessão cai direto no painel, e quem não tem é mandado ao login pelo
          proxy. Um link só resolve os dois casos.
        */}
        <Link
          href="/corretor"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-linha/15 px-4 py-2 text-corpo-suave transition-colors hover:border-brand-300/50 hover:text-acento-suave"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" aria-hidden className="h-3.5 w-3.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          Área do corretor
        </Link>

        <SeletorTema />
      </div>
    </footer>
  );
}
