"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/corretor", label: "Início" },
  { href: "/corretor/funil", label: "Funil" },
  { href: "/corretor/leads", label: "Meus leads" },
  { href: "/corretor/visitas", label: "Visitas" },
  { href: "/corretor/links", label: "Links" },
  { href: "/corretor/perfil", label: "Perfil" },
  { href: "/corretor/senha", label: "Senha" },
];

/** Aba que só o gestor enxerga — a página em si já se protege com notFound. */
const ABA_GESTOR = { href: "/corretor/equipe", label: "Equipe" };

/**
 * Abas do painel. Rola na horizontal no mobile em vez de quebrar em duas
 * linhas — mesmo padrão da barra de âncoras da página de empreendimento.
 */
export function NavPainel({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const abas = ehGestor ? [...ABAS, ABA_GESTOR] : ABAS;

  return (
    <nav className="scrollbar-none mt-6 -mx-4 flex gap-2 overflow-x-auto px-4">
      {abas.map((aba) => {
        // Comparação exata: `startsWith` marcaria "Início" como ativo em
        // todas as abas, já que `/corretor` é prefixo de todas elas.
        const ativa = atual === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
              ativa
                ? "border-brand-300/50 bg-brand-500/15 text-brand-200"
                : "border-white/10 text-mist-300 hover:border-white/25 hover:text-mist-50",
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
