"use client";

import { ComponentPropsWithoutRef } from "react";

type WhatsappLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  origem: string;
  corretorId?: string | null;
  empreendimentoSlug?: string | null;
};

export function WhatsappLink({
  href,
  origem,
  corretorId,
  empreendimentoSlug,
  onClick,
  children,
  ...props
}: WhatsappLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const payload = JSON.stringify({
        origem,
        corretorId: corretorId ?? null,
        empreendimentoSlug: empreendimentoSlug ?? null,
        urlOrigem: typeof window !== "undefined" ? window.location.pathname : null,
      });

      // Dispara em background via sendBeacon ou fetch com keepalive
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/clique-whatsapp", blob);
      } else {
        fetch("/api/clique-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Falha silenciosa para não impedir a abertura do WhatsApp
    }

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      {...props}
    >
      {children}
    </a>
  );
}
