"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Arrastar para reordenar uma lista ou uma grade. Serve ao mouse e ao dedo com
 * o mesmo código, porque usa POINTER EVENTS. O HTML5 drag-and-drop não dispara
 * em toque, e por isso o kanban de 02/09 era enfeite no celular.
 *
 * Como funciona:
 *
 * - O gesto começa numa ALÇA, que é o único elemento com `touch-none`. O resto
 *   do item continua rolando a página com o dedo.
 * - A lista se rearruma DURANTE o arrasto. Quando o ponteiro passa sobre outro
 *   item, `aoMover(de, para)` roda na hora e o arrastado ocupa aquele lugar.
 *   Assim quem arrasta vê onde a peça vai cair, sem precisar de fantasma.
 * - O item sob o ponteiro é encontrado por `elementFromPoint` e pelo atributo
 *   `data-ordenavel="<escopo>"` com `data-indice`. A conta não depende de a
 *   lista ser coluna ou grade.
 * - Com o dedo parado perto da borda da tela não chega `pointermove`. Por isso
 *   um laço de quadro rola a janela e relê o alvo (mesma solução do funil).
 *
 * Arrastar é atalho: as setas continuam em cada item, para teclado e leitor de
 * tela.
 */

const MARGEM_ROLAGEM = 72;
const PASSO_ROLAGEM = 12;

export function useArrastarParaOrdenar({
  escopo,
  aoMover,
  desativado = false,
}: {
  escopo: string;
  aoMover: (de: number, para: number) => void;
  desativado?: boolean;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const indiceAtual = useRef<number | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  const aoMoverRef = useRef(aoMover);
  useEffect(() => {
    aoMoverRef.current = aoMover;
  }, [aoMover]);

  function indiceSob(x: number, y: number): number | null {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>(`[data-ordenavel="${escopo}"]`);
    const valor = el?.dataset.indice;
    return valor === undefined ? null : Number(valor);
  }

  function reavaliar() {
    const de = indiceAtual.current;
    if (de === null) return;
    const para = indiceSob(pos.current.x, pos.current.y);
    if (para === null || para === de) return;
    aoMoverRef.current(de, para);
    indiceAtual.current = para;
    setArrastando(para);
  }

  useEffect(() => {
    if (arrastando === null) return;
    let quadro = 0;
    const passo = () => {
      const { y } = pos.current;
      if (y < MARGEM_ROLAGEM) window.scrollBy(0, -PASSO_ROLAGEM);
      else if (y > window.innerHeight - MARGEM_ROLAGEM) window.scrollBy(0, PASSO_ROLAGEM);
      reavaliar();
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // `reavaliar` lê só refs; religar o laço a cada render não muda nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastando === null]);

  function terminar() {
    indiceAtual.current = null;
    setArrastando(null);
  }

  /** Props da alça do item na posição `indice`. */
  function alca(indice: number) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (desativado || e.button > 0) return;
        // Sem isto o navegador trata o gesto como seleção de texto (mouse) ou
        // como rolagem (toque), e o arrasto morre no primeiro milímetro.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pos.current = { x: e.clientX, y: e.clientY };
        indiceAtual.current = indice;
        setArrastando(indice);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (indiceAtual.current === null) return;
        pos.current = { x: e.clientX, y: e.clientY };
        reavaliar();
      },
      onPointerUp: terminar,
      onPointerCancel: terminar,
    };
  }

  /** Props do contêiner de cada item — é por elas que o alvo é achado. */
  function item(indice: number) {
    return { "data-ordenavel": escopo, "data-indice": indice };
  }

  return { arrastando, alca, item };
}

/** Tira da posição `de` e põe na posição `para`, deslocando o resto. */
export function moverPara<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const nova = [...lista];
  const [peca] = nova.splice(de, 1);
  nova.splice(para, 0, peca);
  return nova;
}
