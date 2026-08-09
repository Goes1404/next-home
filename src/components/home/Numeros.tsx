import { Contador } from "@/components/home/Contador";
import { Reveal } from "@/components/motion/Reveal";
import { site } from "@/lib/site";

type NumerosProps = {
  totalEmpreendimentos: number;
  totalBairros: number;
};

export function Numeros({ totalEmpreendimentos, totalBairros }: NumerosProps) {
  const stats = [
    { valor: totalEmpreendimentos, label: "empreendimentos no portfólio" },
    { valor: site.regioes.length, label: "regiões de atuação" },
    { valor: totalBairros, label: "bairros com oportunidades ativas" },
  ];

  return (
    <section className="border-y border-white/10 bg-ink-900/60 px-4 py-16 sm:py-20">
      <Reveal stagger={0.15} className="mx-auto grid w-full max-w-4xl gap-8 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-fluid-4xl text-brand-200">
              <Contador valor={s.valor} />
            </p>
            <p className="text-fluid-sm mt-2 text-mist-300">{s.label}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
