import Link from "next/link";
import { exigirGestorNaPagina } from "@/lib/guardas";

/**
 * Casca da área de administração.
 *
 * A guarda está aqui E em cada `page.tsx` de propósito: layouts não
 * re-executam ao navegar entre rotas irmãs, então o layout sozinho protege a
 * primeira entrada e não as seguintes. Custo de repetir: uma linha por
 * página. Custo de esquecer: uma rota administrativa aberta.
 */

const ABAS = [
  { href: "/corretor/admin", label: "Visão geral" },
  { href: "/corretor/admin/contas", label: "Contas" },
  { href: "/corretor/admin/leads", label: "Leads da equipe" },
  { href: "/corretor/admin/whatsapp", label: "WhatsApp & IA" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirGestorNaPagina();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl font-bold text-titulo">Administração</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Acessos da equipe, distribuição de leads e o estado da operação num lugar só.
        </p>
      </div>

      <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {ABAS.map((aba) => (
          <Link
            key={aba.href}
            href={aba.href}
            className="text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors"
          >
            {aba.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
