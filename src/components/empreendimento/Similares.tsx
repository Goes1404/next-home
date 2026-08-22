import Link from "next/link";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { Reveal } from "@/components/motion/Reveal";
import type { Empreendimento } from "@/lib/types";

/**
 * Régua ao pé da página de detalhe. Sem ela, quem chega por busca e não se
 * interessa por este empreendimento não tem para onde ir a não ser sair.
 */
export function Similares({ empreendimentos }: { empreendimentos: Empreendimento[] }) {
  if (empreendimentos.length === 0) return null;

  return (
    <section className="border-t border-linha/10 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <Reveal className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-fluid-2xl text-titulo">Veja também</h2>
          <Link
            href="/empreendimentos"
            className="text-fluid-sm text-acento-suave underline-offset-4 hover:underline"
          >
            Ver todos
          </Link>
        </Reveal>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {empreendimentos.map((e, i) => (
            <Reveal key={e.slug} delay={i * 0.08} from="baixo">
              <CardEmpreendimento
                empreendimento={e}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
