"use client";

import { useEffect, useState } from "react";

/**
 * A barra de progresso do placar (0246, 29/10/2026), com uma animação leve:
 * nasce vazia e cresce até o valor ao aparecer na tela. Quem pede menos
 * movimento no sistema vê a barra já cheia (`motion-reduce`). A marca do
 * ritmo (onde o mês está) é um traço fino por cima.
 *
 * O valor passa de 100% (meta superada); a barra para no fim e fica verde.
 */
export function BarraDoPlacar({
  progresso,
  ritmo,
  rotulo,
  fina = false,
}: {
  /** feito ÷ meta (0,5 = metade). */
  progresso: number;
  /** Fração do mês corrida, para a marca; `null` sem marca. */
  ritmo?: number | null;
  rotulo: string;
  fina?: boolean;
}) {
  const alvo = Math.round(Math.min(1, Math.max(0, progresso)) * 100);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    // Dois quadros: o primeiro pinta a barra vazia, o segundo dispara a transição.
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setLargura(alvo));
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, [alvo]);

  const marca = ritmo === null || ritmo === undefined ? null : Math.round(Math.min(1, Math.max(0, ritmo)) * 100);

  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={alvo}
      className={`bg-campo relative w-full overflow-hidden rounded-full ${fina ? "h-1.5" : "h-2.5"}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${
          progresso >= 1 ? "bg-ok" : "bg-acento"
        }`}
        style={{ width: `${largura}%` }}
      />
      {marca !== null && marca > 0 && marca < 100 && (
        <span aria-hidden className="bg-titulo absolute inset-y-0 w-0.5 opacity-60" style={{ left: `${marca}%` }} />
      )}
    </div>
  );
}
