import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { FormularioImobiliaria } from "./FormularioImobiliaria";

export const metadata: Metadata = { title: "Nova imobiliária" };

/**
 * Criar uma imobiliária com o primeiro gestor. A guarda aqui, e não só no
 * layout; a action confere de novo por conta própria.
 */
export default async function NovaImobiliariaPage() {
  await exigirAdminDaPlataformaNaPagina();

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma/grupos/novo" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Escolher o tipo
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Nova imobiliária</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          A imobiliária nasce com as taxas de crédito da Next Home e o primeiro gestor. Ele recebe o convite, cria a
          própria senha e convida o resto da equipe.
        </p>
      </div>
      <FormularioImobiliaria />
    </section>
  );
}
