"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ATALHOS_MOBILE, destinoAtivo, gruposVisiveis, subitemAtivo } from "./_componentes/navegacao";

/**
 * Navegação do celular: os quatro destinos de trabalho no polegar mais uma
 * gaveta com o painel inteiro.
 *
 * A gaveta existe porque a barra inferior só cabe cinco alvos e o painel tem
 * vinte e seis telas. Antes as demais simplesmente não tinham como ser
 * abertas no celular — a barra de abas do topo é `hidden md:flex` —, o que
 * deixava o corretor sem acesso a Imóveis, WhatsApp e Campanhas justamente
 * no aparelho em que ele trabalha.
 *
 * Imóveis entrou no polegar quando Conta saiu do menu para o avatar. Medido
 * em 320px, o pior caso real: cinco alvos de 62px, nada cortado e nenhum
 * rótulo em duas linhas — barra fixa que estoura não fica feia, fica
 * inalcançável, porque ali não há rolagem.
 *
 * ## A gaveta vai para um PORTAL
 *
 * Ela é `position: fixed`, e `backdrop-filter` cria containing block: um
 * `fixed` dentro de um ancestral com blur fica preso a ele em vez da viewport.
 * Hoje ela nasce dentro do `<main>`, que não tem blur — mas o header do
 * painel TEM, e esta armadilha já mordeu quatro vezes neste projeto (Lightbox,
 * Lazer, MenuMobile, header condensado). O portal para `document.body` torna
 * a gaveta imune a qualquer ancestral que ganhe `backdrop-filter` depois.
 *
 * Com o portal veio a armadilha de foco (copiada de `MenuMobile.tsx`): antes
 * havia Escape e `inert`, mas o Tab saía da gaveta e passeava pela página
 * atrás do escurecido — onde o dedo não alcança e o olho não vê.
 */

const semInscricao = () => () => {};

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

/** Seta que diz "isto abre": gira quando o tópico está aberto. */
function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform motion-reduce:transition-none",
        aberto && "rotate-90",
      )}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
export function NavMobileBottom({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);
  const dono = destinoAtivo(atual);

  /*
   * A gaveta guarda em que rota foi aberta, em vez de um booleano. Assim ela
   * se fecha sozinha ao navegar — `aberta` deixa de ser verdade no mesmo
   * render em que a rota muda — sem um efeito que chame setState e provoque
   * um render em cascata.
   */
  const [abertaEm, setAbertaEm] = useState<string | null>(null);
  const aberta = abertaEm !== null && abertaEm === atual;
  const setAberta = (valor: boolean) => setAbertaEm(valor ? atual : null);

  const montado = useMontado();
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberta) return;
    const alvo = painel.current;

    const focaveis = () =>
      Array.from(alvo?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter(
        (el) => el.offsetParent !== null,
      );

    focaveis()[0]?.focus();

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setAbertaEm(null);
        return;
      }
      if (ev.key !== "Tab") return;

      // Armadilha de foco: sem isto o Tab sai da gaveta e passeia por trás
      // dela, onde o dedo não alcança e o olho não vê.
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (ev.shiftKey && document.activeElement === primeiro) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    // A página atrás não rola enquanto a gaveta está aberta: rolar o fundo
    // com o polegar em cima do escurecido é o gesto mais comum de "fechar"
    // que dá errado.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Guardado agora: na limpeza, `botao.current` já pode ser outro nó.
    const abridor = botao.current;

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      abridor?.focus();
    };
  }, [aberta]);

  const gaveta = (
    <div
      // `inert` tira o conteúdo fechado do foco e do leitor de tela; só
      // `opacity-0` deixaria treze links tabuláveis atrás da página.
      // `md:hidden` fica AQUI, e não só no wrapper: com o portal a gaveta mora
      // no `<body>`, fora do wrapper — sem isto, abrir no celular e alargar a
      // janela deixaria o escurecido por cima do desktop.
      inert={!aberta}
      aria-hidden={!aberta}
      className={cn(
        "fixed inset-0 z-60 transition-opacity duration-200 md:hidden",
        aberta ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Fechar menu"
          onClick={() => setAberta(false)}
          className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
        />

        <div
          ref={painel}
          id="gaveta-do-painel"
          role="dialog"
          aria-modal="true"
          aria-label="Todas as seções"
          className={cn(
            // O `pb` desconta a ALTURA DA BARRA, não um valor solto: a barra é
            // `fixed` e desenhada por cima da gaveta, então sem isto o último
            // item fica atrás dela. Passou a doer quando a gaveta deixou de
            // repetir a barra e ganhou sete itens em vez de quatro.
            "border-linha bg-superficie pb-safe absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-3 pb-[calc(var(--nav-mobile-h)+1.5rem)] transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
            aberta ? "translate-y-0" : "translate-y-full",
          )}
        >
          <span aria-hidden className="bg-linha-forte mx-auto mb-5 block h-1 w-10 rounded-full" />

          <div className="space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo.titulo}>
                <p className="text-tenue pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
                  {grupo.titulo}
                </p>
                {/* Empilhado, não em duas colunas: com subtópicos, a grade
                    de dois deixaria as listas de tamanhos diferentes lado a
                    lado e a leitura pularia entre colunas. Em pé, cada
                    destino leva os seus embaixo. */}
                <ul className="space-y-2">
                  {grupo.itens.map((item) => {
                    const ativa = dono?.href === item.href;
                    const Icone = item.icone;
                    const subs = ativa ? (item.subitens ?? []) : [];
                    const subAtivo = ativa ? subitemAtivo(atual, item) : null;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={ativa && !subAtivo ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors",
                            ativa
                              ? "border-acento-linha bg-acento-lavado text-acento-suave font-medium"
                              : "border-linha text-corpo",
                          )}
                        >
                          <Icone aria-hidden className="h-[18px] w-[18px] shrink-0" />
                          {item.label}
                          {/* Só quem tem subtópico ganha a seta: é a pista de
                              que há mais ali dentro, antes de tocar. Fechado, a
                              gaveta não mostra os subtópicos dos outros — sem
                              a seta, "Criar vídeo" seria invisível até alguém
                              abrir Marketing por acaso. */}
                          {(item.subitens?.length ?? 0) > 0 && <Chevron aberto={ativa} />}
                        </Link>

                        {subs.length > 0 && (
                          <ul className="border-linha mt-1 ml-[1.65rem] space-y-1 border-l pl-3">
                            {subs.map((sub) => {
                              const aberto = subAtivo?.href === sub.href;
                              return (
                                <li key={sub.href}>
                                  <Link
                                    href={sub.href}
                                    aria-current={aberto ? "page" : undefined}
                                    className={cn(
                                      // min-h-11 ≈ 44px: o alvo mínimo de toque.
                                      // Subtópico não pode ser mais difícil de
                                      // acertar que o tópico.
                                      "flex min-h-11 items-center rounded-lg px-2 text-[13px] transition-colors",
                                      aberto
                                        ? "text-acento-suave font-medium"
                                        : "text-apoio",
                                    )}
                                  >
                                    {sub.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
  );

  return (
    <div className="md:hidden">
      {montado && createPortal(gaveta, document.body)}

      <nav
        aria-label="Atalhos do painel"
        className="border-linha bg-fundo/85 h-nav-safe pb-safe fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t px-1 backdrop-blur-lg"
      >
        {ATALHOS_MOBILE.map((item) => {
          /* Mesmo dono que a gaveta e o sidebar usam. Com `itemAtivo`, a
             barra acenderia "Imóveis" em `/corretor/imoveis/criar-imagem`,
             que é subtópico de Marketing — o polegar diria uma seção e o
             menu diria outra, na mesma tela. */
          const ativa = dono?.href === item.href;
          const Icone = item.icone;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1 transition-colors",
                ativa ? "text-acento-suave" : "text-tenue",
              )}
            >
              <Icone aria-hidden className="h-[22px] w-[22px]" />
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </Link>
          );
        })}

        <button
          ref={botao}
          type="button"
          onClick={() => setAberta(!aberta)}
          aria-expanded={aberta}
          aria-controls="gaveta-do-painel"
          aria-label="Todas as seções"
          className={cn(
            "flex w-full cursor-pointer flex-col items-center justify-center gap-1 transition-colors",
            aberta ? "text-acento-suave" : "text-tenue",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="h-[22px] w-[22px]"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span className="text-[10px] font-medium tracking-wide">Menu</span>
        </button>
      </nav>
    </div>
  );
}
