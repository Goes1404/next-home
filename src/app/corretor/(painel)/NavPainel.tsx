"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/corretor", label: "Início" },
  { href: "/corretor/imoveis", label: "Imóveis" },
  { href: "/corretor/funil", label: "Funil" },
  { href: "/corretor/leads", label: "Meus leads" },
  { href: "/corretor/whatsapp", label: "WhatsApp IA" },
  { href: "/corretor/campanhas", label: "Campanhas" },
  { href: "/corretor/visitas", label: "Visitas" },
  { href: "/corretor/links", label: "Links" },
  { href: "/corretor/templates", label: "Templates" },
  { href: "/corretor/perfil", label: "Perfil" },
  { href: "/corretor/senha", label: "Senha" },
];

/** Abas que só o gestor enxerga — a página em si já se protege com notFound. */
const ABAS_GESTOR = [
  { href: "/corretor/precos", label: "Preços" },
  { href: "/corretor/equipe", label: "Equipe" },
];

/**
 * Abas do painel. Rola na horizontal no mobile em vez de quebrar em duas
 * linhas — mesmo padrão da barra de âncoras da página de empreendimento.
 */
export function NavPainel({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const abas = ehGestor ? [...ABAS, ...ABAS_GESTOR] : ABAS;

  return (
    <nav className="scrollbar-none mt-6 -mx-4 hidden gap-2 overflow-x-auto px-4 md:flex">
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
