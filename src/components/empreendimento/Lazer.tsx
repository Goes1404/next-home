import { Reveal } from "@/components/motion/Reveal";

export function Lazer({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;

  return (
    <section id="lazer" className="scroll-mt-24 bg-ink-900/40 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-fluid-2xl text-mist-50">Lazer</h2>
          <p className="text-fluid-base mt-2 text-mist-300">
            {itens.length} itens de lazer no condomínio.
          </p>
        </Reveal>

        <Reveal stagger={0.03} className="mt-8 flex flex-wrap gap-2">
          {itens.map((item) => (
            <span
              key={item}
              className="text-fluid-sm rounded-full border border-white/10 bg-ink-900 px-4 py-2 text-mist-100"
            >
              {item}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
