/**
 * O mascote da IA (07/10/2026) com o halo que o destaca: um brilho redondo e
 * a estrela de quatro pontas do peito dele, ao fundo. Eco do disco com a
 * estrela da arte original, sem o disco sólido que pesava no botão.
 *
 * O halo usa `realce` (o azul do logotipo), não o acento do módulo: o
 * mascote é azul em toda tela, e um halo magenta em Pessoas ou verde na
 * Assistente brigaria com ele.
 *
 * Decorativo por inteiro (`alt=""`, `aria-hidden` no fundo): quem o usa como
 * botão dá o nome ao botão.
 */
export function Mascote({ altura, className = "" }: { altura: number; className?: string }) {
  const largura = Math.round((altura * 178) / 240);
  return (
    <span
      className={`relative inline-flex shrink-0 items-end justify-center ${className}`}
      style={{ width: Math.round(altura * 1.05), height: altura }}
    >
      <span aria-hidden className="absolute inset-0">
        {/* O disco: brilho do centro para fora, com um anel fino na borda. */}
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: altura * 0.92,
            height: altura * 0.92,
            top: altura * 0.08,
            background:
              "radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--color-realce) 70%, white 30%) 0%, color-mix(in oklab, var(--color-realce) 45%, transparent) 38%, color-mix(in oklab, var(--color-realce) 14%, transparent) 70%)",
            boxShadow:
              "0 0 0 1.5px color-mix(in oklab, var(--color-realce) 45%, transparent), 0 0 18px color-mix(in oklab, var(--color-realce) 45%, transparent)",
          }}
        />
        {/* A estrela de quatro pontas do peito dele, maior, atrás. */}
        <svg
          viewBox="0 0 24 24"
          className="absolute left-1/2 -translate-x-1/2"
          style={{ width: altura * 0.8, height: altura * 0.8, top: altura * 0.14 }}
        >
          <path
            d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z"
            fill="color-mix(in oklab, white 70%, var(--color-realce))"
            opacity="0.55"
          />
        </svg>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marca/mascote.webp"
        alt=""
        width={largura}
        height={altura}
        className="relative h-full w-auto drop-shadow-[0_6px_10px_rgb(0_0_0/0.28)]"
      />
    </span>
  );
}
