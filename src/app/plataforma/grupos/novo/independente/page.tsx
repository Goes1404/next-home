import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { formularioDoIndependenteDoPedido } from "@/lib/plataforma/pedidoDeContratacao";
import { lerPedido } from "@/lib/plataforma/pedidos";
import { FormularioIndependente } from "./FormularioIndependente";

export const metadata: Metadata = { title: "Novo corretor independente" };

/**
 * Criar um corretor independente: uma pessoa, que é o gestor do próprio grupo
 * e o contato de cobrança. A guarda aqui, e não só no layout; a action
 * confere de novo por conta própria.
 */
export default async function NovoIndependentePage({ searchParams }: { searchParams: Promise<{ pedido?: string | string[] }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  // `?pedido=<id>` (29/10/2026): o pedido de contratação da página de vendas
  // pré-preenche o formulário. O id vai na URL, nunca os dados pessoais.
  const idDoPedido = (await searchParams).pedido;
  const pedido = await lerPedido(prova, Array.isArray(idDoPedido) ? idDoPedido[0] : idDoPedido);

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
      {pedido && (
        <p className="text-fluid-sm border-acento bg-acento-lavado text-titulo rounded-xl border px-4 py-3">
          Preenchido com o pedido de {pedido.nome}. Confira e complete o que falta (documento, endereço do site,
          vencimento) antes de criar.
        </p>
      )}
      <FormularioIndependente inicial={pedido ? formularioDoIndependenteDoPedido(pedido) : undefined} />
    </section>
  );
}
