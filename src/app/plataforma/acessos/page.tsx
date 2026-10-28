import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { buscarAcessos, MINIMO_DA_BUSCA } from "@/lib/plataforma/grupos";
import { ListaDeAcessos } from "../grupos/[id]/AcessosDoGrupo";

export const metadata: Metadata = { title: "Acessos" };

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

type Busca = Promise<{ busca?: string | string[] }>;

/**
 * Busca de login por e-mail ou nome em TODOS os grupos, para redefinir a
 * senha sem saber em que imobiliária a pessoa está. O formulário é GET
 * (`?busca=`): funciona sem JS e o endereço pode ser recarregado.
 */
export default async function AcessosPage({ searchParams }: { searchParams: Busca }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const bruto = (await searchParams).busca;
  const busca = (Array.isArray(bruto) ? bruto[0] : bruto ?? "").trim().slice(0, 120);
  const curta = busca.length > 0 && busca.length < MINIMO_DA_BUSCA;
  const acessos = curta ? [] : await buscarAcessos(prova, busca);

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Acessos</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          Procure a pessoa pelo e-mail ou pelo nome, em todas as imobiliárias, e redefina a senha dela.
        </p>
      </div>

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="busca-acesso" className="sr-only">E-mail ou nome</label>
        <input
          id="busca-acesso"
          name="busca"
          type="search"
          defaultValue={busca}
          minLength={MINIMO_DA_BUSCA}
          placeholder="nome@empresa.com ou nome"
          autoComplete="off"
          className={CAMPO}
        />
        <button
          type="submit"
          className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 font-semibold"
        >
          <Search aria-hidden className="h-4 w-4" /> Buscar
        </button>
      </form>

      {busca && (
        <section className="cartao flex flex-col gap-3 p-5" aria-label="Resultado da busca">
          {curta ? (
            <p className="text-fluid-xs text-apoio">Digite pelo menos {MINIMO_DA_BUSCA} letras.</p>
          ) : (
            <ListaDeAcessos acessos={acessos} vazio={`Nenhum login com "${busca}".`} mostrarGrupo />
          )}
        </section>
      )}
    </section>
  );
}
