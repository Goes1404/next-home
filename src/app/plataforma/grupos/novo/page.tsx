import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { FormularioNovoGrupo } from "./FormularioNovoGrupo";

export const metadata: Metadata = { title: "Novo grupo" };

/**
 * Criar um grupo com o primeiro acesso (desenho §11). A guarda aqui, e não
 * só no layout, porque layout não re-executa entre rotas irmãs; a action
 * confere de novo por conta própria.
 */
export default async function NovoGrupoPage() {
  await exigirAdminDaPlataformaNaPagina();

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Grupos
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Novo grupo</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          O grupo nasce com as taxas de crédito da Next Home e o primeiro acesso como gestor. Ele recebe um
          convite no e-mail e cria a própria senha; daí em diante, convida o resto da equipe.
        </p>
      </div>
      <FormularioNovoGrupo />
    </section>
  );
}
