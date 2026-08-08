import Image from "next/image";
import Link from "next/link";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { precoAPartirDe } from "@/lib/format";
import { getEmpreendimentosDestaque } from "@/lib/queries";

/**
 * Home imersiva provisória (Fase 5) — já lê da mesma camada de dados que a
 * Fase 7 vai expandir com scroll-telling em GSAP. O fundo é `position:
 * fixed`, o que casa com a suposição do shader de GlassSurface de que o
 * vidro refrata o viewport, não o documento.
 */
export default async function Home() {
  const destaques = await getEmpreendimentosDestaque();
  const imagemHero =
    destaques[0]?.capa.url ??
    "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/logo-original.png";

  return (
    <GlassBackgroundProvider inicial={imagemHero}>
      <SiteHeader />
      <WhatsappCta />

      <div className="fixed inset-0 -z-10">
        <Image
          src={imagemHero}
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
            {destaques.map((e, i) => (
              <Reveal key={e.slug} delay={i * 0.12} from="baixo">
                <Link href={`/empreendimentos/${e.slug}`}>
                  <GlassSurface preset="card" className="group overflow-hidden">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]">
                      <Image
                        src={e.capa.url}
                        alt={e.capa.alt}
                        fill
                        sizes="(min-width: 640px) 380px, 100vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <div className="px-5 py-4">
                      <h2 className="font-display text-lg text-mist-50">{e.nome}</h2>
                      <p className="text-fluid-sm mt-0.5 text-mist-400">
                        {e.bairro}, {e.cidade}
                      </p>
                      <p className="text-fluid-sm mt-2 font-medium text-brand-200">
                        {precoAPartirDe(e.precoAPartir)}
                      </p>
                    </div>
                  </GlassSurface>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      </main>
    </GlassBackgroundProvider>
  );
}
