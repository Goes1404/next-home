import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { FormularioIndependente } from "./FormularioIndependente";

export const metadata: Metadata = { title: "Novo corretor independente" };

/**
 * Criar um corretor independente: uma pessoa, que é o gestor do próprio grupo
 * e o contato de cobrança. A guarda aqui, e não só no layout; a action
 * confere de novo por conta própria.
 */
export default async function NovoIndependentePage() {
  await exigirAdminDaPlataformaNaPagina();

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma/grupos/novo" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Escolher o tipo
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Novo corretor independente</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          Uma pessoa só. Ela recebe o convite, cria a própria senha e já entra como gestora do grupo dela.
        </p>
      </div>
      <FormularioIndependente />
    </section>
  );
}
