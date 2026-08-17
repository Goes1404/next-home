import Link from "next/link";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { enderecoLinha, linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

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
export async function Footer() {
  const corretorAtivo = await getCorretorAtivo();

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
            {corretorAtivo ? (
              <li>
                <a
                  href={linkWhatsappPara(corretorAtivo.whatsapp, `Olá, ${corretorAtivo.nome}! Vim pelo site.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fluid-sm text-mist-400 transition-colors hover:text-brand-200"
                >
                  Falar com {corretorAtivo.nome}
                </a>
              </li>
            ) : (
              site.whatsapp.map((w, i) => (
                <li key={w.numero}>
                  <a
                    href={linkWhatsapp(undefined, i)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fluid-sm text-mist-400 transition-colors hover:text-brand-200"
                  >
                    {w.label}
                  </a>
                </li>
              ))
            )}
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

      <div className="text-fluid-xs mx-auto mt-12 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-6 text-mist-500">
        <p>
          © {new Date().getFullYear()} {site.nomeCompleto}. CRECI {site.creci}.
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
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-mist-200 transition-colors hover:border-brand-300/50 hover:text-brand-200"
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
      </div>
    </footer>
  );
}
