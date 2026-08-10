import { Contador } from "@/components/home/Contador";
import { GlassSurface } from "@/components/glass/GlassSurface";
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
    <section className="px-4 py-16 sm:py-20">
      <Reveal className="mx-auto w-full max-w-4xl">
        <GlassSurface
          preset="painel"
          className="grid gap-8 px-6 py-10 sm:grid-cols-3 sm:px-10 sm:py-14"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-fluid-4xl text-brand-200">
                <Contador valor={s.valor} />
              </p>
              <p className="text-fluid-sm mt-2 text-mist-300">{s.label}</p>
            </div>
          ))}
        </GlassSurface>
      </Reveal>
    </section>
  );
}
