import Image from "next/image";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";

const IMAGEM_HERO = "/amostra/hero.jpg";

const DESTAQUES = [
  {
    nome: "Eternity Alphaville",
    bairro: "Centro Comercial Jubran, Barueri",
    preco: "A partir de R$ 1.289.900",
    imagem: "/amostra/1e524dc19bc9b585cda9f2922e12bf22.jpg",
  },
  {
    nome: "Viva RSF Vila do Conde",
    bairro: "Parque Viana, Barueri",
    preco: "A partir de R$ 460.000",
    imagem: "/amostra/f29b31c7eb1959c6ef4971f85a0ef0f4.jpg",
  },
];

/**
 * Home provisória da Fase 1 — existe para provar o liquid glass em condições
 * reais (nav fixa, CTA flutuante, cards) antes das Fases 5-7 substituírem o
 * conteúdo por dados do Supabase. O fundo é `position: fixed`, o que casa com
 * a suposição do shader de que o vidro refrata o viewport, não o documento.
 */
export default function Home() {
  return (
    <GlassBackgroundProvider inicial={IMAGEM_HERO}>
      <SiteHeader />
      <WhatsappCta />

      <div className="fixed inset-0 -z-10">
        <Image
          src={IMAGEM_HERO}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/35 to-ink-950" />
      </div>

      <main className="flex flex-1 flex-col">
        <section className="flex min-h-svh flex-col items-center justify-center px-4 pt-24 pb-32">
          <Reveal className="w-full max-w-xl">
            <GlassSurface preset="painel" className="px-7 py-9 text-center sm:px-10 sm:py-12">
              <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
                Alphaville · Barueri · Santana de Parnaíba
              </p>
              <h1 className="text-fluid-3xl text-mist-50">
                Cada empreendimento merece o seu próprio palco.
              </h1>
              <p className="text-fluid-base mt-4 text-mist-200">
                Um portfólio dedicado a cada lançamento — plantas, lazer, localização e
                atendimento direto com quem conhece a região.
              </p>
            </GlassSurface>
          </Reveal>
        </section>

        <section className="px-4 pb-28">
          <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2">
            {DESTAQUES.map((item, i) => (
              <Reveal key={item.nome} delay={i * 0.12} from="baixo">
                <GlassSurface preset="card" className="group overflow-hidden">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]">
                    <Image
                      src={item.imagem}
                      alt={item.nome}
                      fill
                      sizes="(min-width: 640px) 380px, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="px-5 py-4">
                    <h2 className="font-display text-lg text-mist-50">{item.nome}</h2>
                    <p className="text-fluid-sm mt-0.5 text-mist-400">{item.bairro}</p>
                    <p className="text-fluid-sm mt-2 font-medium text-brand-200">
                      {item.preco}
                    </p>
                  </div>
                </GlassSurface>
              </Reveal>
            ))}
          </div>
        </section>
      </main>
    </GlassBackgroundProvider>
  );
}
