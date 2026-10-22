import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { SeloDoTipo } from "../../SeloDoTipo";

export const metadata: Metadata = { title: "Nova conta" };

/**
 * A escolha entre os dois fluxos de criação (`/novo/imobiliaria` e
 * `/novo/independente`): rotas separadas, e não `?tipo=`, para cada formulário
 * ter só os campos do seu tipo. A guarda aqui, e não só no layout.
 */
export default async function NovoGrupoPage() {
  await exigirAdminDaPlataformaNaPagina();

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Nova conta</h1>
        <p className="text-fluid-sm text-apoio mt-2">Que tipo de conta você vai criar?</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        <li>
          <Link href="/plataforma/grupos/novo/imobiliaria" className="cartao flex h-full flex-col gap-3 p-5">
            <SeloDoTipo tipo="imobiliaria" />
            <span className="text-titulo text-fluid-lg font-medium">Nova imobiliária</span>
            <span className="text-fluid-sm text-apoio">
              Empresa com CNPJ, equipe de corretores e um gestor. Plano por usuário (R$ 127 cada).
            </span>
          </Link>
        </li>
        <li>
          <Link href="/plataforma/grupos/novo/independente" className="cartao flex h-full flex-col gap-3 p-5">
            <SeloDoTipo tipo="independente" />
            <span className="text-titulo text-fluid-lg font-medium">Novo corretor independente</span>
            <span className="text-fluid-sm text-apoio">
              Uma pessoa, com CPF e CRECI-F. É o gestor do próprio grupo. Plano Essencial (R$ 97) ou Profissional (R$ 147).
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
