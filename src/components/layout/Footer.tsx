import Link from "next/link";
import { enderecoLinha, linkWhatsapp, site } from "@/lib/site";

const LINKS_RAPIDOS = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
  { href: "/privacidade", label: "Privacidade" },
];

const REDES = [
  { href: site.social.instagram, label: "Instagram" },
  { href: site.social.facebook, label: "Facebook" },
  { href: site.social.youtube, label: "YouTube" },
  { href: site.social.linkedin, label: "LinkedIn" },
];

/**
 * Rodapé institucional — único lugar que precisa existir só uma vez, por
 * isso vive no layout raiz em vez de repetido em cada página (diferente de
 * SiteHeader/WhatsappCta, que dependem do GlassBackgroundProvider local a
 * cada rota).
 */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-900 px-4 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg text-mist-50">
            Next<span className="text-brand-300">Home</span>
          </p>
          <p className="text-fluid-sm mt-3 max-w-xs text-mist-400">{site.descricao}</p>
          <p className="text-fluid-xs mt-4 text-mist-500">CRECI {site.creci}</p>
        </div>

        <div>
          <p className="text-fluid-sm font-medium text-mist-100">Navegação</p>
          <ul className="mt-3 space-y-2">
            {LINKS_RAPIDOS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-fluid-sm text-mist-400 transition-colors hover:text-brand-200"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-fluid-sm font-medium text-mist-100">Contato</p>
          <ul className="mt-3 space-y-2">
            <li className="text-fluid-sm text-mist-400">{enderecoLinha}</li>
            {site.whatsapp.map((w) => (
              <li key={w.numero}>
                <a
                  href={linkWhatsapp()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fluid-sm text-mist-400 transition-colors hover:text-brand-200"
                >
                  {w.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex gap-4">
            {REDES.map((rede) => (
              <a
                key={rede.label}
                href={rede.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={rede.label}
                className="text-fluid-xs text-mist-500 transition-colors hover:text-brand-200"
              >
                {rede.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <p className="text-fluid-xs mx-auto mt-12 w-full max-w-5xl border-t border-white/5 pt-6 text-mist-500">
        © {new Date().getFullYear()} {site.nomeCompleto}. CRECI {site.creci}.
      </p>
    </footer>
  );
}
