"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  cliqueDeWhatsapp,
  idDoPixelValido,
  imovelDaPagina,
  paginaRastreavel,
} from "./pixelMeta";

/**
 * Pixel da Meta no site público (02/10/2026).
 *
 * Eventos, todos disparados por este código e nenhum pela ferramenta de
 * clicar da Meta:
 *   - PageView em cada página rastreável;
 *   - ViewContent na ficha do imóvel (`content_ids` = slug);
 *   - Lead no clique de qualquer link de WhatsApp. Dispara no CLIQUE porque
 *     o atalho `/wa` redireciona direto para o WhatsApp, sem página onde o
 *     pixel possa rodar.
 *
 * Duas coisas da Meta ficam desligadas de propósito:
 *   - `disablePushState`: o pixel dispara PageView sozinho a cada troca de
 *     rota, inclusive para as páginas de token, mandando o token à Meta. Aqui
 *     o PageView sai só pelo efeito abaixo, que conhece a lista do que fica
 *     de fora.
 *   - `autoConfig` (eventos automáticos de botão): eles mandariam cliques de
 *     qualquer página, com o texto do botão, sem passar pela mesma lista.
 *
 * Sem `NEXT_PUBLIC_META_PIXEL_ID` (ou com valor inválido) nada carrega. Cada
 * instalação tem o seu pixel (ver docs/INSTALAR-NOVO-CLIENTE.md).
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: Fbq;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const ID = idDoPixelValido(process.env.NEXT_PUBLIC_META_PIXEL_ID);

/** O carregador padrão da Meta, sem o PageView automático. */
function carregar(id: string) {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  fbq.disablePushState = true;
  window.fbq = fbq;
  window._fbq = fbq;

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);

  fbq("set", "autoConfig", false, id);
  fbq("init", id);
}

export function PixelMeta() {
  const caminho = usePathname() ?? "/";
  const ultimo = useRef<string | null>(null);

  // PageView e ViewContent a cada página nova que pode ser rastreada.
  useEffect(() => {
    if (!ID || !paginaRastreavel(caminho) || ultimo.current === caminho) return;
    ultimo.current = caminho;
    carregar(ID);
    window.fbq?.("track", "PageView");
    const imovel = imovelDaPagina(caminho);
    if (imovel) {
      window.fbq?.("track", "ViewContent", {
        content_ids: [imovel],
        content_type: "product",
      });
    }
  }, [caminho]);

  // Lead: um ouvinte só, para todo link de WhatsApp da página, sem depender
  // de cada botão lembrar de chamar o pixel.
  useEffect(() => {
    if (!ID) return;
    function aoClicar(ev: MouseEvent) {
      const alvo = ev.target as Element | null;
      const link = alvo?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !window.fbq) return;
      if (!paginaRastreavel(window.location.pathname)) return;
      const clique = cliqueDeWhatsapp(link.getAttribute("href") ?? "", window.location.origin);
      if (!clique) return;
      window.fbq(
        "track",
        "Lead",
        clique.imovel ? { content_ids: [clique.imovel], content_name: clique.imovel } : {},
      );
    }
    // Captura: dispara antes de o navegador sair da página pelo link.
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  return null;
}
