"use client";

import { useSyncExternalStore } from "react";

/**
 * O estado da gaveta lateral, compartilhado entre quem a ABRE e quem a
 * DESENHA.
 *
 * Ela tem dois gatilhos em lugares diferentes da árvore — o hambúrguer no
 * topo (como todo app de celular) e o botão "Menu" da barra do polegar, que
 * já existia e a corretora já usa. Os dois moram em componentes irmãos sob um
 * layout de servidor, então não há pai cliente para segurar um `useState`.
 * Um store externo minúsculo resolve sem Context nem provider.
 *
 * Guarda a ROTA em que foi aberta, não um booleano: assim a gaveta se fecha
 * sozinha ao navegar — `aberta` deixa de ser verdade no mesmo render em que o
 * pathname muda — sem efeito chamando setState em cascata. É o mesmo truque
 * que a versão anterior usava com `useState`, só que fora do componente.
 */

let abertaEm: string | null = null;
const ouvintes = new Set<() => void>();

function emitir(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function abrirGaveta(rota: string): void {
  if (abertaEm === rota) return;
  abertaEm = rota;
  emitir();
}

export function fecharGaveta(): void {
  if (abertaEm === null) return;
  abertaEm = null;
  emitir();
}

export function alternarGaveta(rota: string): void {
  if (abertaEm === rota) fecharGaveta();
  else abrirGaveta(rota);
}

/** `true` só se a gaveta foi aberta NESTA rota — em outra, ela já fechou. */
export function useGavetaAberta(rota: string | null): boolean {
  const atual = useSyncExternalStore(
    assinar,
    () => abertaEm,
    // No servidor a gaveta está sempre fechada: nada de flash aberto no HTML.
    () => null,
  );
  return rota !== null && atual === rota;
}
