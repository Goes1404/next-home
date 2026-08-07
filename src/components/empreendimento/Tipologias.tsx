import { Reveal } from "@/components/motion/Reveal";
import { areaM2, precoBRL } from "@/lib/format";
import type { Tipologia } from "@/lib/types";

const CAMPOS: Array<{ chave: keyof Tipologia; label: (t: Tipologia) => string }> = [
  { chave: "dormitorios", label: (t) => `${t.dormitorios} dorm.` },
  { chave: "suites", label: (t) => (t.suites > 0 ? `${t.suites} suíte${t.suites > 1 ? "s" : ""}` : "—") },
  { chave: "banheiros", label: (t) => `${t.banheiros} banh.` },
  { chave: "vagas", label: (t) => `${t.vagas} vaga${t.vagas > 1 ? "s" : ""}` },
];

export function Tipologias({ tipologias }: { tipologias: Tipologia[] }) {
  if (tipologias.length === 0) return null;

  return (
    <section id="tipologias" className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Tipologias</h2>
        <p className="text-fluid-base mt-2 text-mist-300">
          Metragens e valores por unidade — sujeitos a disponibilidade.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {tipologias.map((t, i) => (
          <Reveal key={t.nome} delay={i * 0.08} from="baixo">
            <article className="rounded-2xl border border-white/10 bg-ink-900 px-6 py-6">
              <h3 className="font-display text-lg text-mist-50">{t.nome}</h3>
              <p className="text-fluid-sm mt-1 text-mist-400">{areaM2(t.areaPrivativa)} privativos</p>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/10 pt-4 text-center">
                {CAMPOS.map((campo) => (
                  <p key={campo.chave} className="text-fluid-sm font-medium text-mist-100">
                    {campo.label(t)}
                  </p>
                ))}
              </div>

              <p className="text-fluid-lg mt-4 font-medium text-brand-200">{precoBRL(t.preco)}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
