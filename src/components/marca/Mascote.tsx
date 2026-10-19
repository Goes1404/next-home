/**
 * O mascote da IA (07/10/2026) com o fundo que o destaca: um disco azul
 * (brilho do centro para fora e anel fino na borda) e a estrela de quatro
 * pontas do peito dele, atrás. Eco do disco com a estrela da arte original.
 *
 * O disco usa `realce` (o azul do logotipo), não o acento do módulo: o
 * mascote é azul em toda tela, e um disco magenta em Pessoas ou verde na
 * Assistente brigaria com ele. `realce` existe no site e no painel.
 *
 * `destaque` é para quando ele é um BOTÃO que precisa chamar o olho (canto
 * do painel, WhatsApp do site): disco mais cheio e um anel que pulsa a cada
 * 6s — a mesma exceção declarada da régua de movimento em repouso que o
 * botão de WhatsApp do site já usa, e `motion-safe` (some para quem pediu
 * menos movimento).
 *
 * Decorativo por inteiro (`alt=""`, `aria-hidden` no fundo): quem o usa como
 * botão dá o nome ao botão.
 */
export function Mascote({
  altura,
  destaque = false,
  className = "",
}: {
  altura: number;
  destaque?: boolean;
  className?: string;
}) {
  const largura = Math.round((altura * 178) / 240);
  const disco = altura * (destaque ? 0.96 : 0.92);
  const topoDoDisco = altura * (destaque ? 0.06 : 0.08);
  const fundo = destaque
    ? "radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--color-realce) 55%, white 45%) 0%, color-mix(in oklab, var(--color-realce) 80%, transparent) 42%, color-mix(in oklab, var(--color-realce) 45%, transparent) 72%)"
    : "radial-gradient(circle at 50% 42%, color-mix(in oklab, var(--color-realce) 70%, white 30%) 0%, color-mix(in oklab, var(--color-realce) 45%, transparent) 38%, color-mix(in oklab, var(--color-realce) 14%, transparent) 70%)";
  const sombra = destaque
    ? "0 0 0 2px color-mix(in oklab, white 55%, var(--color-realce)), 0 10px 28px -6px color-mix(in oklab, var(--color-realce) 70%, black 30%), 0 0 24px color-mix(in oklab, var(--color-realce) 55%, transparent)"
    : "0 0 0 1.5px color-mix(in oklab, var(--color-realce) 45%, transparent), 0 0 18px color-mix(in oklab, var(--color-realce) 45%, transparent)";

  return (
    <span
      className={`relative inline-flex shrink-0 items-end justify-center ${className}`}
      style={{ width: Math.round(altura * 1.05), height: altura }}
    >
      <span aria-hidden className="absolute inset-0">
        {destaque && (
          <span
            // Centrado por margem, não por translate: o pulso anima `transform`.
            className="motion-safe:anel-pulso absolute left-1/2 rounded-full"
            style={{
              width: disco,
              height: disco,
              top: topoDoDisco,
              marginLeft: -disco / 2,
              background: "color-mix(in oklab, var(--color-realce) 50%, transparent)",
            }}
          />
        )}
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: disco, height: disco, top: topoDoDisco, background: fundo, boxShadow: sombra }}
        />
        <svg
          viewBox="0 0 24 24"
          className="absolute left-1/2 -translate-x-1/2"
          style={{ width: altura * 0.8, height: altura * 0.8, top: altura * 0.14 }}
        >
          <path
            d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z"
            fill="color-mix(in oklab, white 70%, var(--color-realce))"
            opacity={destaque ? 0.75 : 0.55}
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
