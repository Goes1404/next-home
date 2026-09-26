"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { TETO_COMPARAR } from "@/lib/favoritos";
import { useFavoritos } from "./BotaoFavorito";

/**
 * A porta para os favoritos (26/09/2026): aparece no canto esquerdo quando o
 * visitante salvou algum imóvel. O direito já é do WhatsApp e do voltar ao
 * topo — empilhar ali é como um toque cai no alvo errado.
 */
export function BarraDeFavoritos() {
  const favoritos = useFavoritos();
  const caminho = usePathname();
  if (favoritos.length === 0 || caminho.startsWith("/comparar")) return null;
  const alvo = `/comparar?imoveis=${favoritos.slice(0, TETO_COMPARAR).join(",")}`;
  return (
    <Link
      href={alvo}
      className="botao-vivo fixed bottom-6 left-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-950/90 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur"
    >
      <Heart className="h-4 w-4 fill-rose-500 text-rose-500" aria-hidden />
      {favoritos.length} {favoritos.length === 1 ? "favorito" : "favoritos"}
      {favoritos.length > 1 && <span className="text-brand-200">· comparar</span>}
    </Link>
  );
}
