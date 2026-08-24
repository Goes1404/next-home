"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";

export type LinkMenu = { href: string; label: string };

/**
 * Menu de navegação do celular — a peça que faltava no header institucional.
 *
 * Referência: "Glass Video Hero" (21st.dev, semana 15), cujo menu mobile com
 * armadilha de foco é a parte reaproveitável; o resto (vídeo de fundo, navbar
 * de vidro) o projeto já tem. O código de lá está atrás de login, então a
 * implementação é nossa, sobre a linguagem de vidro da casa.
 *
 * O que ele resolve, medido no diagnóstico da home: em 375px o header tinha
 * DOIS controles visíveis (logo e um CTA) e nenhum caminho para o catálogo,
 * corretores, sobre ou contato — a navegação simplesmente não existia no
 * celular, que é de onde vem o tráfego.
 *
 * Acessibilidade que um menu em tela cheia exige e que costuma faltar:
 * - foco preso enquanto aberto (Tab cicla dentro do painel);
 * - Esc fecha;
 * - o foco volta para o botão que abriu;
 * - o resto da página fica `inert` para leitor de tela e teclado;
 * - a rolagem do corpo trava enquanto o painel cobre a tela.
 *
 * O painel vai para um PORTAL, e isso não é preferência: ele é `position:
 * fixed` e nasce dentro do header, que é um `GlassSurface` com
 * `backdrop-filter` — e backdrop-filter cria containing block, prendendo o
 * fixed ao header em vez da viewport. Sem o portal, o menu abre espremido
 * dentro da barra. Mesma armadilha já documentada no Lightbox e no Lazer.
 */
const semInscricao = () => () => {};

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

export function MenuMobile({ links }: { links: LinkMenu[] }) {
  const montado = useMontado();
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const caminho = usePathname();
  // O painel não pode sobreviver à troca de página. Derivar do pathname
  // durante o render (e não zerar o estado num efeito) evita a cascata de
  // renders que o setState-em-efeito provoca.
  const [caminhoAnterior, setCaminhoAnterior] = useState(caminho);
  if (caminho !== caminhoAnterior) {
    setCaminhoAnterior(caminho);
    setAberto(false);
  }

  const fechar = useCallback(() => setAberto(false), []);

  useEffect(() => {
    if (!aberto) return;

    const alvo = painel.current;
    if (!alvo) return;

    const focaveis = () =>
      Array.from(
        alvo.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((el) => el.offsetParent !== null);

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

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="menu-mobile"
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-corpo transition-colors hover:text-titulo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte sm:hidden"
      >
        {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
            // `pt-24`: o painel cobre a tela inteira mas o conteúdo começa
            // abaixo do header de vidro, que segue visível com o X de fechar.
            className="fixed inset-0 z-30 flex flex-col gap-1 bg-fundo/95 px-6 pt-24 pb-10 backdrop-blur-2xl sm:hidden"
          >
            {links.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={fechar}
                // Entrada em cascata sem JS de animação: cada item tem seu
                // atraso, e `motion-reduce` desliga tudo de uma vez.
                style={{ animationDelay: `${i * 55}ms` }}
                className="animate-[intro-socorro_0.45s_var(--ease-out-expo)_both] border-b border-linha/10 py-4 font-display text-fluid-xl text-titulo transition-colors hover:text-acento-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte motion-reduce:animate-none"
              >
                {l.label}
              </Link>
            ))}

            <Link
              href="/anunciar-imovel"
              onClick={fechar}
              className="mt-6 rounded-full bg-brand-500 px-6 py-4 text-center text-sm font-medium text-white transition-colors hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
            >
              Anunciar meu imóvel
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}
