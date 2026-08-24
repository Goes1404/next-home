import Image from "next/image";
import { ViewTransition } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { precoAPartirDe } from "@/lib/format";
import { linkWhatsappPara } from "@/lib/site";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

/**
 * Hero editorial: a foto ocupa tudo, o nome do imóvel é o elemento gráfico
 * dominante (display 5xl, revelado linha a linha) e a informação de compra
 * vira uma barra fina no rodapé — o produto primeiro, a burocracia depois.
 */
export function Hero({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const link = linkWhatsappPara(
    e.corretor.whatsapp,
    `Olá, ${e.corretor.nome}! Vim pelo site e quero saber mais sobre o ${e.nome}.`,
  );

  return (
    <section className="relative flex min-h-svh flex-col justify-end">
      <div className="fixed inset-0 -z-10">
        <ViewTransition name={`capa-${e.slug}`}>
          <Image
            src={e.capa.url}
            alt={e.capa.alt}
            fill
            priority
            sizes="100vw"
            placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
            blurDataURL={e.capa.blurDataUrl ?? undefined}
            className="object-cover"
          />
        </ViewTransition>
        {/* Cor literal de propósito: este véu escurece a FOTO de capa para o
            texto branco por cima ficar legível. O fundo dele é a imagem, não a
            página — num tema claro ele continua escuro, senão o texto some. */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/15 to-ink-950" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pt-28 sm:px-8">
        <Reveal from="nenhuma" duration={0.6}>
          <VoltarLink href="/empreendimentos">Empreendimentos</VoltarLink>
        </Reveal>

        {/* Cores literais (mist/sand) em todo o hero: o contraste aqui é
            sempre contra a foto escurecida, nos dois temas. */}
        <p className="text-fluid-sm mt-6 mb-4 flex items-center gap-2 font-medium tracking-[0.22em] text-sand-300 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-sand-400" />
          {STATUS_LABEL[e.status]} · {e.bairro}, {e.cidade}
        </p>

        <TituloEditorial
          as="h1"
          // Palavra a palavra: o nome do imóvel tem duas ou três palavras e é
          // o elemento gráfico dominante da página — cada uma subindo da
          // máscara pesa mais que o bloco inteiro entrando de uma vez.
          por="palavras"
          className="text-fluid-5xl max-w-[12ch] leading-[0.98] tracking-tight text-mist-50"
        >
          {e.nome}
        </TituloEditorial>

        <TituloEditorial
          as="p"
          delay={0.35}
          className="text-fluid-lg mt-6 max-w-xl text-mist-200"
        >
          {e.tagline}
        </TituloEditorial>
      </div>

      {/* Barra de compra: divisória fina, informação mínima, um CTA. */}
      <Reveal from="baixo" delay={0.5} className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <div className="mt-10 mb-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-mist-50/20 pt-6">
          <div className="flex items-baseline gap-3">
            <span className="text-fluid-xs tracking-[0.18em] text-mist-400 uppercase">
              Valor
            </span>
            <span className="text-fluid-xl font-medium text-mist-50">
              {precoAPartirDe(e.precoAPartir)}
            </span>
          </div>

          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-[background-color,transform] duration-300 hover:scale-[1.03] hover:bg-brand-400"
          >
            Falar com corretor
          </a>
        </div>
      </Reveal>
    </section>
  );
}
