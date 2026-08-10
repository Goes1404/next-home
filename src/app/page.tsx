import Image from "next/image";
import Link from "next/link";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Diferenciais } from "@/components/home/Diferenciais";
import { Numeros } from "@/components/home/Numeros";
import { Regioes } from "@/components/home/Regioes";
import { ScrollCue } from "@/components/home/ScrollCue";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Reveal } from "@/components/motion/Reveal";
import { precoAPartirDe } from "@/lib/format";
import { getEmpreendimentos } from "@/lib/queries";
import { HERO_VIDEO_URL } from "@/lib/site";

/**
 * Home imersiva (Fase 7): hero cinematográfico com fundo fixo + seções de
 * scroll-telling reveladas via GSAP (`Reveal`/`Contador`). O fundo é
 * `position: fixed`, o que casa com a suposição do shader de GlassSurface de
 * que o vidro refrata o viewport, não o documento — por isso nenhuma seção
 * abaixo pode envolver o header/CTA/fundo num ancestral com `transform`.
 */
export default async function Home() {
  const todos = await getEmpreendimentos();
  const destaques = todos.filter((e) => e.destaque);
  const totalBairros = new Set(todos.map((e) => e.bairro)).size;

  return (
    // `inicial` fica de fora de propósito: as capas cadastradas hoje vêm de
    // material de divulgação (peça de brochura inteira, print com aviso de
    // "Ativar o Windows" etc.) e não servem como fundo em tela cheia — sem
    // uma imagem registrada, o shader do vidro cai no gradiente procedural
    // dele mesmo (`fundoProcedural()` em shaders/glass.ts), que já existe
    // exatamente para isso.
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-brand-900 via-ink-950 to-ink-950">
        {HERO_VIDEO_URL && <HeroVideoBackground src={HERO_VIDEO_URL} />}
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

          <ScrollCue alvo="destaques" label="Role para ver mais" />
        </section>

        <Numeros totalEmpreendimentos={todos.length} totalBairros={totalBairros} />

        <Diferenciais />

        <section id="destaques" className="scroll-mt-20 px-4 pt-4 pb-28">
          <Reveal className="mx-auto max-w-lg text-center">
            <h2 className="text-fluid-2xl text-mist-50">Destaques</h2>
            <p className="text-fluid-base mt-3 text-mist-300">
              Uma curadoria dos lançamentos que mais pedem atenção agora.
            </p>
          </Reveal>

          <div className="mx-auto mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
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
                      <h3 className="font-display text-lg text-mist-50">{e.nome}</h3>
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

          <Reveal className="mt-10 text-center">
            <Link
              href="/empreendimentos"
              className="text-fluid-sm font-medium text-brand-200 underline-offset-4 hover:underline"
            >
              Ver todos os {todos.length} empreendimentos →
            </Link>
          </Reveal>
        </section>

        <Regioes />

        <CtaFinal />
      </main>
    </GlassBackgroundProvider>
  );
}
