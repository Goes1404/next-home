import { Reveal } from "@/components/motion/Reveal";
import { entregaPrevista } from "@/lib/format";
import type { Empreendimento } from "@/lib/types";

const FICHA: Array<{ label: string; valor: (e: Empreendimento) => string | null }> = [
  { label: "Construtora", valor: (e) => e.construtora },
  { label: "Unidades", valor: (e) => (e.totalUnidades ? String(e.totalUnidades) : null) },
  { label: "Torres", valor: (e) => (e.totalTorres ? String(e.totalTorres) : null) },
  { label: "Andares", valor: (e) => (e.totalAndares ? String(e.totalAndares) : null) },
  { label: "Entrega prevista", valor: (e) => entregaPrevista(e.entregaPrevista) },
];

export function Sobre({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const ficha = FICHA.map((f) => ({ label: f.label, valor: f.valor(e) })).filter(
    (f) => f.valor !== null,
  );

  return (
    <section id="sobre" className="mx-auto max-w-3xl scroll-mt-24 px-4 pt-16 sm:pt-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Sobre o empreendimento</h2>
        <p className="text-fluid-base mt-4 text-mist-200">{e.descricao}</p>
      </Reveal>

      {ficha.length > 0 && (
        <Reveal
          from="nenhuma"
          stagger={0.04}
          className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-3"
        >
          {ficha.map((f) => (
            <div key={f.label}>
              <p className="text-fluid-xs text-mist-400 uppercase">{f.label}</p>
              <p className="text-fluid-base mt-1 font-medium text-mist-50">{f.valor}</p>
            </div>
          ))}
        </Reveal>
      )}
    </section>
  );
}
