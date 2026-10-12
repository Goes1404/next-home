"use client";

import { resolverVariante } from "./variantes";

/**
 * Loader do `next/image` (next.config → `images.loaderFile`).
 *
 * Substitui o otimizador da Vercel, que no Hobby tem cota e quebrava a foto
 * ao estourá-la (09/10/2026). Ele não redimensiona nada em tempo de
 * requisição: devolve a variante WebP que `registrarMidia` já deixou no
 * Storage, escolhida pela largura que o navegador pediu — e só quando a URL
 * traz a marca de que a variante existe (`#v=480,960`, ver variantes.ts).
 * Qualquer outra URL (logo em `public/`, miniatura do YouTube, foto de
 * corretor, data URL) volta exatamente como veio, que é o comportamento de
 * `unoptimized`.
 */
export default function loaderDeImagem({ src, width }: { src: string; width: number; quality?: number }) {
  return resolverVariante(src, width);
}
