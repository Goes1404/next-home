"use client";

import { useEffect, useRef } from "react";

/**
 * O cabeçalho do painel, que no CELULAR sai de cena ao rolar para baixo e
 * volta ao primeiro gesto para cima (09/10/2026, "melhorar a navegação de ir
 * para baixo"). É o mesmo comportamento do cabeçalho do site
 * (`HeaderCondensado`), e pelo mesmo motivo: lendo uma lista no telefone, o
 * cabeçalho fixo mais a barra do polegar comiam um quinto da tela, e é ao
 * subir que alguém procura a navegação.
 *
 * No computador ele fica: é fino, e a lateral grudenta se ancora na altura
 * dele.
 *
 * ## Quem depende da altura dele
 *
 * Dois elementos do painel se posicionam logo abaixo do cabeçalho no celular:
 * a barra de busca grudenta da Lista de leads e o chat aberto por cima da
 * tela de Respostas da IA. Os dois leem `--painel-topo-visivel`, que vale a
 * altura do cabeçalho e cai para zero quando ele some — escrito aqui como
 * `data-cabecalho` no `<main>` do painel. Sem isso, o cabeçalho sairia e
 * deixaria um vão por onde o conteúdo aparece rolando.
 *
 * Ele não some com o menu do avatar aberto (o menu mora dentro dele), nem
 * com o chat aberto por cima de tudo (`data-segura-cabecalho`): a rolagem do
 * fim de uma conversa escorrega para a página de trás, e o chat inteiro
 * pularia junto.
 *
 * O `transform` vem da mesma regra do site (`header[data-oculto]` no
 * globals.css). É seguro porque nada `fixed` mora dentro do cabeçalho: a
 * gaveta e os menus que abrem dele vivem em portal ou em `absolute`.
 *
 * ## A altura é medida, não suposta
 *
 * `--painel-header-h` dizia 3,75rem (60px) e o cabeçalho do celular tem 69px:
 * o hambúrguer tem 44px de alvo de toque. Medido em 09/10/2026, a barra de
 * busca da Lista e o chat aberto começavam 9px POR BAIXO dele. Agora a altura
 * real é escrita no `<main>` sempre que muda (fonte, zoom, quebra de linha);
 * os 3,75rem do CSS ficam só para o primeiro quadro, antes do JavaScript.
 */
const LIMIAR_OCULTAR_PX = 120;
/** Gesto menor que isto é ruído do dedo, não intenção de direção. */
const PASSO_MINIMO_PX = 6;

export function CabecalhoDoPainel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raiz = el.closest<HTMLElement>("main");
    let oculto = false;
    let ultimoY = window.scrollY;
    let quadro = 0;

    const aplicar = (agora: boolean) => {
      if (agora === oculto) return;
      oculto = agora;
      el.dataset.oculto = agora ? "sim" : "nao";
      if (raiz) raiz.dataset.cabecalho = agora ? "oculto" : "visivel";
    };

    const conferir = () => {
      quadro = 0;
      const y = window.scrollY;
      if (window.innerWidth >= 768) {
        ultimoY = y;
        aplicar(false);
        return;
      }
      if (document.querySelector("[data-segura-cabecalho]")) {
        ultimoY = y;
        return;
      }
      const delta = y - ultimoY;
      if (Math.abs(delta) < PASSO_MINIMO_PX && y > LIMIAR_OCULTAR_PX) return;
      ultimoY = y;
      const algoAberto = el.querySelector('[aria-expanded="true"]') !== null;
      aplicar(delta > 0 && y > LIMIAR_OCULTAR_PX && !algoAberto);
    };

    // Um quadro por vez: o evento de rolagem chega dezenas de vezes por
    // gesto, e a decisão só precisa de uma leitura por pintura.
    const agendar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(conferir);
    };

    // `transform` não muda a caixa, então a altura medida é a do cabeçalho
    // inteiro, escondido ou não.
    const medir = () => raiz?.style.setProperty("--painel-header-h", `${el.offsetHeight}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);

    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar, { passive: true });
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) window.cancelAnimationFrame(quadro);
      observador.disconnect();
      raiz?.style.removeProperty("--painel-header-h");
      aplicar(false);
    };
  }, []);

  return (
    <header ref={ref} data-oculto="nao" className={className}>
      {children}
    </header>
  );
}
