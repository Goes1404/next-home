import Link from "next/link";

/**
 * Link de "voltar", no mesmo traço já usado no Hero de empreendimento:
 * seta fininha + texto, sem sublinhado — para não competir visualmente
 * com o título da página logo abaixo.
 */
export function VoltarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-fluid-xs mb-4 inline-flex items-center gap-1.5 text-mist-300 transition-colors hover:text-mist-50"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
      </svg>
      {children}
    </Link>
  );
}
