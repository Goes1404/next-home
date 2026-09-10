"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, LockKeyhole, Menu, X } from "lucide-react";
import { linkWhatsapp } from "@/lib/site";

export type LinkMenu = { href: string; label: string };

/**
 * Menu de navegação do celular — a peça que faltava no header institucional.
 *
 * ## O desenho (refeito em 10/09/2026)
 *
 * Era uma folha que cobria a tela inteira com cinco links soltos. Virou um
 * PAINEL LATERAL que desliza da direita sobre um véu escuro — o padrão que
 * todo app do telefone usa, e que a pessoa já sabe fechar tocando fora. O
 * painel tem cabeçalho próprio (marca + fechar), os destinos com seta, as
 * duas ações da casa (WhatsApp e anunciar) e, no pé, a porta da equipe:
 * "Área do corretor", com cadeado, dizendo em voz alta que é acesso
 * restrito. Antes essa porta só existia no rodapé, e o corretor no celular
 * rolava a página inteira para achá-la.
 *
 * ## Movimento
 *
 * Véu esmaece e painel desliza (CSS, `.menu-veu` / `.menu-painel`); os
 * itens entram em cascata. Fechar também anima — o painel só desmonta
 * depois do recolhimento (`fechando`), senão ele some num corte seco.
 * `prefers-reduced-motion` desliga tudo de uma vez pelo CSS.
 *
 * ## Acessibilidade que um painel modal exige
 *
 * - foco preso enquanto aberto (Tab cicla dentro do painel);
 * - Esc fecha, e tocar no véu fecha;
 * - o foco volta para o botão que abriu;
 * - a rolagem do corpo trava enquanto o painel cobre a tela.
 *
 * O painel vai para um PORTAL, e isso não é preferência: ele é `position:
 * fixed` e nasce dentro do header, que é um `GlassSurface` com
 * `backdrop-filter` — e backdrop-filter cria containing block, prendendo o
 * fixed ao header em vez da viewport. Mesma armadilha já documentada no
 * Lightbox e no Lazer. É também o que permite ao header ganhar `transform`
 * para se esconder ao rolar (ver HeaderCondensado).
 */
const semInscricao = () => () => {};

/** Quanto dura o recolhimento no CSS — o desmonte espera por ele. */
const DURACAO_FECHAR_MS = 240;

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

export function MenuMobile({ links }: { links: LinkMenu[] }) {
  const montado = useMontado();
  const [aberto, setAberto] = useState(false);
  const [fechando, setFechando] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const caminho = usePathname();
  // O painel não pode sobreviver à troca de página. Derivar do pathname
  // durante o render (e não zerar o estado num efeito) evita a cascata de
  // renders que o setState-em-efeito provoca. Sem animação aqui: a página
  // nova já está entrando.
  const [caminhoAnterior, setCaminhoAnterior] = useState(caminho);
  if (caminho !== caminhoAnterior) {
    setCaminhoAnterior(caminho);
    setAberto(false);
    setFechando(false);
  }

  const fechar = useCallback(() => {
    setFechando(true);
    window.setTimeout(() => {
      setAberto(false);
      setFechando(false);
    }, DURACAO_FECHAR_MS);
  }, []);

  useEffect(() => {
    if (!aberto) return;

    const alvo = painel.current;
    if (!alvo) return;

    const focaveis = () =>
      Array.from(alvo.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
        (el) => el.offsetParent !== null,
      );

    focaveis()[0]?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fechar();
        return;
      }
      if (e.key !== "Tab") return;

      // Armadilha de foco: sem isto o Tab sai do painel e passeia por trás
      // dele, onde o dedo não alcança e o olho não vê.
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    window.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Guardado agora: na limpeza, `botao.current` já pode apontar para outro
    // nó (ou nenhum), e o foco voltaria para o lugar errado.
    const abridor = botao.current;

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      abridor?.focus();
    };
  }, [aberto, fechar]);

  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-expanded={aberto}
        aria-controls="menu-mobile"
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        className="border-linha bg-superficie/60 text-titulo active:bg-superficie focus-visible:outline-acento-forte flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {montado &&
        aberto &&
        createPortal(
          <div
            id="menu-mobile"
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            data-fechando={fechando ? "sim" : "nao"}
            className="fixed inset-0 z-50 sm:hidden"
          >
            {/* O véu é um botão: tocar fora fecha, e leitor de tela sabe o
                que ele faz. `bg-black/…` literal — é véu sobre a página, e
                escurece nos dois temas de propósito. */}
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar menu"
              className="menu-veu absolute inset-0 bg-black/55 backdrop-blur-sm"
            />

            <div className="menu-painel bg-fundo border-linha shadow-painel-alto absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto border-l pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
              <div className="border-linha flex h-16 shrink-0 items-center justify-between border-b px-5">
                <Link
                  href="/"
                  onClick={fechar}
                  className="font-display text-titulo text-lg leading-none font-medium tracking-tight"
                >
                  Next<span className="text-realce">Home</span>
                </Link>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar menu"
                  className="text-corpo hover:text-titulo active:bg-superficie flex size-11 items-center justify-center rounded-full transition-colors"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              <nav aria-label="Páginas" className="flex flex-col gap-1 px-3 py-4">
                {[{ href: "/", label: "Início" }, ...links].map((l, i) => {
                  const atual = ativo(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={fechar}
                      aria-current={atual ? "page" : undefined}
                      // Entrada em cascata sem JS de animação: cada item tem
                      // seu atraso, e `motion-reduce` desliga tudo de uma vez.
                      style={{ animationDelay: `${80 + i * 45}ms` }}
                      className={[
                        "menu-item font-display text-fluid-lg flex min-h-13 items-center justify-between gap-3 rounded-xl px-3 transition-colors motion-reduce:animate-none",
                        atual
                          ? "bg-superficie text-acento-suave"
                          : "text-titulo hover:bg-superficie/70 active:bg-superficie",
                      ].join(" ")}
                    >
                      {l.label}
                      <ChevronRight
                        aria-hidden
                        className={`size-4 shrink-0 ${atual ? "text-acento-suave" : "text-tenue"}`}
                      />
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto flex flex-col gap-3 px-5 pt-2">
                <a
                  href={linkWhatsapp()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={fechar}
                  className="bg-brand-500 hover:bg-brand-400 active:bg-brand-600 flex min-h-12 items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
                    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
                  </svg>
                  Falar no WhatsApp
                </a>
                <Link
                  href="/anunciar-imovel"
                  onClick={fechar}
                  className="border-linha text-corpo hover:border-acento-linha hover:text-titulo active:bg-superficie flex min-h-12 items-center justify-center rounded-full border text-sm font-medium transition-colors"
                >
                  Anunciar meu imóvel
                </Link>
              </div>

              {/* A porta da equipe. Aponta para `/corretor`, não para
                  `/corretor/entrar`: quem já tem sessão cai no painel, quem
                  não tem é mandado ao login pelo proxy. Um link resolve os
                  dois casos — a mesma decisão do rodapé. */}
              <Link
                href="/corretor"
                onClick={fechar}
                className="border-linha bg-superficie/60 hover:border-acento-linha active:bg-superficie mx-5 mt-5 mb-6 flex items-center gap-3 rounded-2xl border p-4 transition-colors"
              >
                <span className="bg-acento-lavado text-acento-suave flex size-10 shrink-0 items-center justify-center rounded-full">
                  <LockKeyhole className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-titulo block text-sm font-medium">Área do corretor</span>
                  <span className="text-fluid-xs text-apoio block">
                    Acesso restrito à equipe · CRM
                  </span>
                </span>
                <ChevronRight aria-hidden className="text-tenue size-4 shrink-0" />
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
