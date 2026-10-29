import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { lerAdministradores } from "@/lib/plataforma/administradores";
import { FormularioNovoAdministrador, RemoverAdministrador } from "./GestaoDeAdministradores";

export const metadata: Metadata = { title: "Administradores" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/**
 * Quem administra a plataforma (29/10/2026): a lista, pôr um login pelo
 * e-mail (ou criar um, com senha temporária) e tirar. As recusas — tirar a
 * si mesmo, deixar a plataforma sem ninguém — moram na action
 * (`administradoresAcoes.ts`); aqui o botão só some para a própria linha.
 */
export default async function AdministradoresPage() {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const administradores = await lerAdministradores(prova);
  const sozinho = administradores.length <= 1;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Administradores</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          Quem entra nesta área e cuida de todas as imobiliárias. Ninguém tira o próprio acesso, e a plataforma nunca
          fica sem administrador.
        </p>
      </div>

      <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="titulo-administradores">
        <h2 id="titulo-administradores" className="text-fluid-sm text-titulo flex items-center gap-2 font-bold">
          <ShieldCheck className="h-4 w-4" aria-hidden /> {administradores.length}{" "}
          {administradores.length === 1 ? "administrador" : "administradores"}
        </h2>
        <ul className="divide-linha flex flex-col divide-y">
          {administradores.map((a) => {
            const voce = a.userId === prova.userId;
            return (
              <li key={a.userId} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                <span className="min-w-0">
                  <span className="text-fluid-sm text-titulo block wrap-anywhere">
                    {a.email ?? "e-mail não lido"}
                    {voce && <span className="text-apoio"> · você</span>}
                  </span>
                  <span className="text-fluid-xs text-apoio block">
                    Desde {DATA.format(new Date(a.desde))}
                    {a.ultimoAcesso ? ` · último acesso em ${DATA.format(new Date(a.ultimoAcesso))}` : " · nunca entrou"}
                  </span>
                </span>
                {!voce && !sozinho && <RemoverAdministrador userId={a.userId} email={a.email} />}
              </li>
            );
          })}
        </ul>
      </section>

      <FormularioNovoAdministrador />
    </section>
  );
}
