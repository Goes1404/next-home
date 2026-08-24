import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * As três visões da mesma carteira — lista, quadro e agenda — apresentadas
 * como abas de uma tela só.
 *
 * Existe porque a navegação encolheu para sete destinos: Funil e Visitas
 * saíram do menu e passaram a morar "dentro" de Leads. As rotas continuam as
 * mesmas (nenhum link salvo quebra); o que muda é como o corretor chega.
 */
const ABAS = [
  { chave: "lista", href: "/corretor/leads", label: "Lista" },
  { chave: "funil", href: "/corretor/funil", label: "Funil" },
  { chave: "visitas", href: "/corretor/visitas", label: "Visitas" },
] as const;

export type AbaLeads = (typeof ABAS)[number]["chave"];

export function AbasLeads({ ativa }: { ativa: AbaLeads }) {
  return (
    <nav aria-label="Visões dos leads" className="mt-5">
      <div className="border-linha bg-superficie inline-flex rounded-full border p-1">
        {ABAS.map((aba) => (
          <Link
            key={aba.chave}
            href={aba.href}
            aria-current={aba.chave === ativa ? "page" : undefined}
            className={cn(
              "flex min-h-9 items-center rounded-full px-4 text-sm transition-colors",
              aba.chave === ativa
                ? "bg-acento text-white font-medium"
                : "text-apoio hover:text-titulo",
            )}
          >
            {aba.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
