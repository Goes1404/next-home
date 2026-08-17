import type { Metadata } from "next";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretores } from "@/lib/queries";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Nossos corretores",
  description: `Fale com um corretor da ${site.nomeCompleto} — CRECI ${site.creci}. Atuação em ${site.regioes.join(", ")}.`,
  alternates: { canonical: "/corretores" },
};

export default async function CorretoresPage() {
  const corretores = await getCorretores();

  return (
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      <Reveal className="mx-auto w-full max-w-2xl text-center">
        <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
          Nossa equipe
        </p>
        <h1 className="text-fluid-3xl text-mist-50">
          Quem acompanha cada lançamento de perto.
        </h1>
        <p className="text-fluid-base mt-5 text-mist-300">
          Todo corretor da Next Home tem CRECI e conhece a região rua por rua. Escolha com
          quem falar — ou chame qualquer um deles direto no WhatsApp.
        </p>
      </Reveal>

      {corretores.length === 0 ? (
        <Reveal className="mx-auto mt-16 w-full max-w-2xl text-center">
          <p className="text-fluid-base text-mist-300">
            Nossa equipe está sendo atualizada. Fale com a gente pelo WhatsApp que
            direcionamos você ao corretor certo.
          </p>
        </Reveal>
      ) : (
        <Reveal
          stagger={0.08}
          className="mx-auto mt-14 grid w-full max-w-4xl gap-4 sm:grid-cols-2"
        >
          {corretores.map((c) => (
            <CardCorretor key={c.slug} corretor={c} />
          ))}
        </Reveal>
      )}
    </main>
  );
}
