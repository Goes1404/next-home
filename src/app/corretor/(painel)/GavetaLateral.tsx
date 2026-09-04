"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { sair } from "@/app/corretor/actions";
import {
  ITENS_DA_CONTA,
  destinoAtivo,
  gruposVisiveis,
  moduloAtivo,
  subitemAtivo,
  type ItemNav,
} from "./_componentes/navegacao";
import { fecharGaveta, useGavetaAberta } from "./_componentes/gavetaStore";

/**
 * A gaveta lateral do celular — o mapa inteiro do painel, pela esquerda.
 *
 * ## A forma
 *
 * Painel que entra pela esquerda cobrindo ~84% da tela, com a página ainda
 * visível e escurecida à direita. É a forma que todo app de celular usa para
 * "todas as seções", e o corretor não precisa aprender: ele já sabe que o
 * hambúrguer no canto abre isto e que tocar fora fecha.
 *
 * Substitui a versão anterior, que era uma FOLHA subindo de baixo. A folha
 * cabia quando a gaveta tinha sete itens planos; com tópicos e subtópicos,
 * a lista fica alta, e lista alta subindo de baixo esconde justamente o topo
 * — onde estão Agora, Pessoas e Imóveis, os três que mais se usam.
 *
 * ## Acordeão
 *
 * Cada tópico com subtópicos tem uma seta que ABRE e FECHA os dele; tocar no
 * rótulo navega. Abre sozinho o tópico da rota atual (é onde a pessoa está),
 * e a pessoa pode abrir outro para espiar sem sair de onde está — é isso
 * que a versão anterior não permitia, e era o que deixava "Criar vídeo"
 * invisível até alguém cair em Marketing por acaso.
 *
 * O tópico aberto à mão é guardado junto com a ROTA em que foi aberto: ao
 * navegar, volta a ser o da rota nova, sem efeito nem setState em cascata.
 *
 * ## Por que um PORTAL
 *
 * A gaveta é `position: fixed`. `backdrop-filter` cria containing block, e o
 * header do painel tem blur: um `fixed` que nascesse ali ficaria preso à
 * barra em vez da viewport. Esta armadilha já mordeu quatro vezes neste
 * projeto. No `document.body`, ela é imune a qualquer ancestral que ganhe
 * blur depois — e por isso o `md:hidden` fica NA gaveta, não num wrapper.
 */

const semInscricao = () => () => {};

/** `false` no servidor; `true` depois de hidratar — o portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

function Chevron({ aberto, className }: { aberto: boolean; className?: string }) {
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
        "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
        aberto && "rotate-90",
        className,
      )}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function GavetaLateral({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const aberta = useGavetaAberta(atual);
  const montado = useMontado();
  const grupos = gruposVisiveis(ehGestor);
  const dono = destinoAtivo(atual);
  const modulo = moduloAtivo(atual);

  /*
   * Acordeão: o tópico expandido é o da rota, a menos que a pessoa tenha
   * aberto outro À MÃO nesta mesma rota. Derivado no render, sem efeito.
   */
  const [manual, setManual] = useState<{ rota: string | null; href: string | null } | null>(null);
  const expandido = manual && manual.rota === atual ? manual.href : (dono?.href ?? null);
  const alternarTopico = (href: string) =>
    setManual({ rota: atual, href: expandido === href ? null : href });

  const painel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!aberta) return;
    const alvo = painel.current;

    const focaveis = () =>
      Array.from(alvo?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter(
        (el) => el.offsetParent !== null,
      );

    // Quem abriu com o hambúrguer está no canto superior; o primeiro foco vai
    // para a primeira coisa clicável, que é o item de topo.
    focaveis()[0]?.focus();

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        fecharGaveta();
        return;
      }
      if (ev.key !== "Tab") return;
      // Armadilha de foco: sem isto o Tab sai da gaveta e passeia pela
      // página atrás do escurecido, onde o dedo não alcança e o olho não vê.
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
    // A página atrás não rola com a gaveta aberta: arrastar o polegar sobre o
    // escurecido é o gesto de "fechar" mais comum, e rolar o fundo o quebra.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      // O foco volta ao hambúrguer que estiver na tela (topo ou barra).
      document.querySelector<HTMLElement>('[aria-controls="gaveta-do-painel"]')?.focus();
    };
  }, [aberta]);

  if (!montado) return null;

  return createPortal(
    <div
      /*
       * A gaveta mora no `<body>`, FORA do `<main data-rota="painel"
       * data-modulo>` que carrega a paleta do painel e a cor do módulo. Sem
       * repetir os dois atributos aqui, ela nasce com a paleta do SITE e o
       * acento padrão — o tópico ativo deixa de acompanhar a seção. Foi
       * exatamente isso que aconteceu na primeira versão portalada
       * (04/09/2026): o resto do painel mudava de cor, a gaveta não.
       *
       * O portal tira a gaveta da árvore do DOM; a cor viaja por CSS
       * custom property, que só herda pela árvore. Todo elemento portalado
       * deste painel precisa carregar os dois atributos por conta própria.
       */
      data-rota="painel"
      data-modulo={modulo ?? undefined}
      // `inert` tira o conteúdo fechado do foco e do leitor de tela; só
      // `opacity-0` deixaria vinte links tabuláveis atrás da página.
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
        onClick={fecharGaveta}
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
      />

      <aside
        ref={painel}
        id="gaveta-do-painel"
        role="dialog"
        aria-modal="true"
        aria-label="Todas as seções"
        className={cn(
          "bg-superficie border-linha absolute inset-y-0 left-0 flex w-[84vw] max-w-[22rem] flex-col border-r shadow-2xl",
          "transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          aberta ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Marca: diz onde a pessoa está antes de qualquer item. */}
        <div className="border-linha flex items-center gap-3 border-b px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
          <span
            aria-hidden
            className="bg-acento text-sobre-cor font-display grid h-10 w-10 place-items-center rounded-xl text-lg"
          >
            N
          </span>
          <div className="min-w-0 leading-tight">
            <p className="font-display text-titulo text-lg">
              Next<span className="text-acento-suave">Home</span>
            </p>
            <p className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">
              Painel do corretor
            </p>
          </div>
        </div>

        {/* Só `overflow-y`: rolagem lateral em navegação esconde alvo sem
            avisar que ele existe (naoRolaDeLado.test.ts). */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo.titulo}>
                {grupos.length > 1 && (
                  <p className="text-tenue px-3 pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
                    {grupo.titulo}
                  </p>
                )}
                <ul className="space-y-1">
                  {grupo.itens.map((item) => (
                    <Topico
                      key={item.href}
                      item={item}
                      atual={atual}
                      ativo={dono?.href === item.href}
                      expandido={expandido === item.href}
                      aoAlternar={() => alternarTopico(item.href)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Rodapé: conta e saída, como todo app. Sair é o ÚNICO item em cor
            de perigo, porque é o único que tira a pessoa daqui. */}
        <div className="border-linha border-t px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <ul className="space-y-0.5">
            {ITENS_DA_CONTA.map((item) => {
              const Icone = item.icone;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-apoio hover:bg-vidro hover:text-titulo flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors"
                  >
                    <Icone aria-hidden className="h-[18px] w-[18px] shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <form action={sair}>
                <button
                  type="submit"
                  className="text-perigo hover:bg-perigo-lavado flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M15 17l5-5-5-5" />
                    <path d="M20 12H9" />
                    <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
                  </svg>
                  Sair
                </button>
              </form>
            </li>
          </ul>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function Topico({
  item,
  atual,
  ativo,
  expandido,
  aoAlternar,
}: {
  item: ItemNav;
  atual: string | null;
  ativo: boolean;
  expandido: boolean;
  aoAlternar: () => void;
}) {
  const Icone = item.icone;
  const subs = item.subitens ?? [];
  const subAtivo = ativo ? subitemAtivo(atual, item) : null;
  const temSubs = subs.length > 0;
  const idSubs = `subs-${item.href.replace(/\//g, "-")}`;

  return (
    <li>
      <div
        className={cn(
          "flex items-stretch rounded-2xl transition-colors",
          // Tópico ativo é SÓLIDO, como um botão principal: é a resposta a
          // "onde estou" e tem de ser lida de relance, no celular, ao sol.
          ativo ? "bg-acento text-sobre-cor" : "text-corpo hover:bg-vidro",
        )}
      >
        <Link
          href={item.href}
          aria-current={ativo && !subAtivo ? "page" : undefined}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 text-[15px] font-medium"
        >
          <Icone aria-hidden className="h-5 w-5 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>

        {temSubs && (
          /* Seta separada do rótulo: tocar no nome NAVEGA, tocar na seta só
             ABRE. Juntar os dois obrigaria a escolher entre "ver o que tem
             dentro" e "ir para lá", e a referência de produto separa os dois. */
          <button
            type="button"
            onClick={aoAlternar}
            aria-expanded={expandido}
            aria-controls={idSubs}
            aria-label={`${expandido ? "Fechar" : "Abrir"} ${item.label}`}
            className={cn(
              "grid w-12 shrink-0 cursor-pointer place-items-center rounded-r-2xl transition-colors",
              ativo ? "hover:bg-white/10" : "hover:bg-vidro",
            )}
          >
            <Chevron aberto={expandido} className={ativo ? "" : "opacity-60"} />
          </button>
        )}
      </div>

      {temSubs && (
        <ul
          id={idSubs}
          hidden={!expandido}
          // Recuo alinhado ao rótulo do pai (ícone 20px + gap 12px) e uma
          // régua vertical: é isso que diz "pertence àquele".
          className="border-linha mt-1 mb-1 ml-[2.1rem] space-y-0.5 border-l pl-2"
        >
          {subs.map((sub) => {
            const aberto = subAtivo?.href === sub.href;
            const IconeSub = sub.icone;
            return (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  aria-current={aberto ? "page" : undefined}
                  className={cn(
                    // 44px: subtópico não pode ser mais difícil de acertar
                    // que tópico.
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors",
                    aberto
                      ? "bg-acento-lavado text-acento-suave font-medium"
                      : "text-corpo hover:bg-vidro",
                  )}
                >
                  {IconeSub && <IconeSub aria-hidden className="h-[18px] w-[18px] shrink-0" />}
                  {sub.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
