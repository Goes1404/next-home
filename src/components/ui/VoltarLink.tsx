import Link from "next/link";

/**
 * Link de "voltar".
 *
 * Duas variantes, e a diferença é ONDE ele fica:
 *
 * - `discreto` (padrão histórico): seta fininha + texto, sem sublinhado,
 *   para não competir com o título logo abaixo.
 * - `pilula`: botão de 44px com fundo, para quando o link tem de ser ACHADO
 *   — no celular, sobre foto, ou numa página em que ele é a única saída
 *   (pedido de 12/09/2026: "deixe o botão de voltar mais visível"). Sobre
 *   foto escura (`sobreFoto`) a tinta é fixa, porque o fundo não acompanha o
 *   tema: token de tema sobre foto some no tema claro (lição do login).
 */
export function VoltarLink({
  href,
  children,
  variante = "discreto",
  sobreFoto = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variante?: "discreto" | "pilula";
  sobreFoto?: boolean;
  className?: string;
}) {
  if (variante === "pilula") {
    const tinta = sobreFoto
      ? "border-white/25 bg-black/45 text-mist-50 backdrop-blur-md hover:bg-black/65"
      : "border-linha bg-superficie/80 text-corpo backdrop-blur hover:border-linha-forte hover:text-titulo active:bg-superficie";
    return (
      <Link
        href={href}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border pr-4 pl-3 text-sm font-medium shadow-md transition-colors ${tinta} ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" aria-hidden className="size-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
        </svg>
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`text-fluid-xs mb-4 inline-flex min-h-11 items-center gap-1.5 text-apoio transition-colors hover:text-titulo ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
      </svg>
      {children}
    </Link>
  );
}
