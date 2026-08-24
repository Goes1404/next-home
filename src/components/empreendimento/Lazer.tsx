import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";

/**
 * Lazer como índice editorial: colunas de itens com divisórias finas, cada
 * um numa linha própria — lista de amenidades de book impresso, não nuvem
 * de tags.
 */
export function Lazer({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;

  return (
    <section id="lazer" className="scroll-mt-24 bg-superficie/40 px-4 py-16 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <TituloEditorial className="text-fluid-3xl text-titulo">Lazer</TituloEditorial>
        <Reveal from="nenhuma" delay={0.2}>
          <p className="text-fluid-base mt-3 text-apoio">
            {itens.length} itens de lazer no condomínio.
          </p>
        </Reveal>

        <Reveal
          stagger={0.04}
          from="nenhuma"
          className="mt-10 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3"
        >
          {itens.map((item) => (
            <span
              key={item}
              className="text-fluid-base flex items-center gap-3 border-b border-linha/10 py-3.5 text-corpo"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-acento-forte" />
              {item}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
