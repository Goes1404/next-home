import Link from "next/link";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { enderecoLinha, linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";
import { getTemaEscolhido } from "@/lib/tema";

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
  const [corretorAtivo, tema] = await Promise.all([getCorretorAtivo(), getTemaEscolhido()]);

  return (
    <footer className="border-t border-linha/10 bg-superficie px-4 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 sm:grid-cols-3">
        <div>
          <p className="font-display text-lg text-titulo">
            Next<span className="text-acento-forte">Home</span>
          </p>
          <p className="text-fluid-sm mt-3 max-w-xs text-legenda">{site.descricao}</p>
          <p className="text-fluid-xs mt-4 text-tenue">CRECI {site.creci}</p>
        </div>

        <div>
          <p className="text-fluid-sm font-medium text-corpo">Navegação</p>
          <ul className="mt-3 space-y-2">
            {LINKS_RAPIDOS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-fluid-sm text-legenda transition-colors hover:text-acento"
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
            <li className="text-fluid-sm text-legenda">{enderecoLinha}</li>
            {corretorAtivo ? (
              <li>
                <a
                  href={linkWhatsappPara(corretorAtivo.whatsapp, `Olá, ${corretorAtivo.nome}! Vim pelo site.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fluid-sm text-legenda transition-colors hover:text-acento"
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
                    className="text-fluid-sm text-legenda transition-colors hover:text-acento"
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
                className="text-fluid-xs text-tenue transition-colors hover:text-acento"
              >
                {rede.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="text-fluid-xs mx-auto mt-12 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-linha/5 pt-6 text-tenue">
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
          className="inline-flex items-center gap-2 rounded-full border border-linha/15 px-4 py-2 text-corpo-suave transition-colors hover:border-brand-300/50 hover:text-acento"
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

        <SeletorTema atual={tema} />
      </div>
    </footer>
  );
}
