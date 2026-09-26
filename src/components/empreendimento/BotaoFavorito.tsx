"use client";

import { Heart } from "lucide-react";
import { useSyncExternalStore } from "react";
import { alternarFavorito, lerFavoritos, ouvirFavoritos } from "@/lib/favoritos";

/** Cache por conteúdo: `useSyncExternalStore` exige o mesmo objeto entre leituras iguais. */
let ultimo = "";
let ultimaLista: string[] = [];
function instantaneo(): string[] {
  const atual = lerFavoritos();
  const chave = atual.join(",");
  if (chave !== ultimo) {
    ultimo = chave;
    ultimaLista = atual;
  }
  return ultimaLista;
}
const VAZIO: string[] = [];

export function useFavoritos(): string[] {
  return useSyncExternalStore(ouvirFavoritos, instantaneo, () => VAZIO);
}

/**
 * Coração do cartão e da ficha (26/09/2026). Fica FORA do link do cartão:
 * botão dentro de link é HTML inválido e o toque abriria a ficha.
 */
export function BotaoFavorito({
  slug,
  nome,
  className = "",
  sobreFoto = true,
}: {
  slug: string;
  nome: string;
  className?: string;
  sobreFoto?: boolean;
}) {
  const favoritos = useFavoritos();
  const ativo = favoritos.includes(slug);
  return (
    <button
      type="button"
      onClick={() => alternarFavorito(slug)}
      aria-pressed={ativo}
      aria-label={ativo ? `Tirar ${nome} dos favoritos` : `Salvar ${nome} nos favoritos`}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 ${
        sobreFoto ? "bg-ink-950/70 text-white backdrop-blur-sm hover:bg-ink-950/85" : "border border-linha-forte bg-elevado text-titulo hover:bg-vidro"
      } ${className}`}
    >
      <Heart className={`h-5 w-5 ${ativo ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden />
    </button>
  );
}
