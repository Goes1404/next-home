import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";

const ITENS = [
  {
    titulo: "Um portfólio, não uma prateleira",
    texto:
      "Cada empreendimento ganha sua própria página — plantas, lazer, localização e condições, sem se perder no meio de centenas de outros imóveis.",
  },
  {
    titulo: "Corretor responsável, direto",
    texto:
      "Cada página de empreendimento leva a um WhatsApp com o corretor que acompanha aquele lançamento — sem fila de atendimento genérico.",
  },
  {
    titulo: "Presença local de verdade",
    texto:
      "Atuação concentrada em Alphaville, Barueri, Santana de Parnaíba, Osasco e Itapevi — a região que a Next Home conhece rua por rua.",
  },
];

export function Diferenciais() {
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-4xl">
        <Reveal className="mx-auto max-w-lg text-center">
          <h2 className="text-fluid-2xl text-mist-50">Por que a Next Home</h2>
        </Reveal>

        <Reveal
          stagger={0.12}
          className="mt-10 grid gap-6 sm:grid-cols-3"
        >
          {ITENS.map((item) => (
            <GlassSurface key={item.titulo} preset="painel" className="px-6 py-7">
              <h3 className="font-display text-lg text-mist-50">{item.titulo}</h3>
              <p className="text-fluid-sm mt-2 text-mist-400">{item.texto}</p>
            </GlassSurface>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
