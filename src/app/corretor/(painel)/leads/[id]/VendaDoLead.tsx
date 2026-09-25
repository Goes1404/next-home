import Link from "next/link";
import type { VendaNaTela } from "@/lib/financeiro/dados";
import { formatarReais } from "@/lib/financeiro/venda";
import type { EtapaFunil } from "@/lib/types";

/**
 * A venda na ficha do lead (0114). Três estados:
 *  - já tem venda: mostra valor e leva a ela;
 *  - está em Fechado e sem venda: chama para registrar, em destaque — é o
 *    momento em que o corretor lembra os números;
 *  - qualquer outra etapa: um link discreto (venda pode chegar antes de o
 *    cartão andar).
 */
export function VendaDoLead({ leadId, etapa, vendas }: { leadId: string; etapa: EtapaFunil; vendas: VendaNaTela[] }) {
  const registrar = `/corretor/financeiro/nova?lead=${leadId}`;

  if (vendas.length > 0) {
    return (
      <section className="cartao space-y-2 p-4">
        <h2 className="text-fluid-sm text-titulo font-medium">Venda</h2>
        <ul className="space-y-1">
          {vendas.map((v) => (
            <li key={v.id}>
              <Link
                href={`/corretor/financeiro/${v.id}`}
                className="text-fluid-sm hover:bg-vidro flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg px-2"
              >
                <span className="text-corpo min-w-0 break-words">
                  {v.imovel}
                  {v.unidade ? ` · ${v.unidade}` : ""}
                  {v.status === "distratada" ? " · distratada" : ""}
                </span>
                <span className="text-titulo font-bold">{formatarReais(v.valorVenda)} →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (etapa === "fechado") {
    return (
      <section className="border-acento-linha bg-acento-lavado space-y-3 rounded-2xl border-2 p-4">
        <div>
          <h2 className="text-fluid-base text-titulo font-bold">Negócio fechado. Registre a venda</h2>
          <p className="text-fluid-sm text-corpo mt-1">
            Valor, unidade e comissão. Sem isso a venda não entra no seu VGV nem no extrato.
          </p>
        </div>
        <Link
          href={registrar}
          className="text-fluid-sm bg-acento text-sobre-cor inline-flex min-h-11 items-center rounded-xl px-5 font-bold"
        >
          Registrar a venda
        </Link>
      </section>
    );
  }

  return (
    <Link
      href={registrar}
      className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center underline decoration-transparent hover:decoration-current"
    >
      Registrar venda deste lead
    </Link>
  );
}
