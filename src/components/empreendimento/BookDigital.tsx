import { Camada } from "@/components/motion/Camada";
import { Reveal } from "@/components/motion/Reveal";
import { GlassSurface } from "@/components/glass/GlassSurface";
import type { Empreendimento } from "@/lib/types";
import { Smartphone, FileText, Download, Check, ArrowRight } from 'lucide-react';
import { linkDoPorteiro } from "@/lib/whatsapp/linkDoPorteiro";


interface Props {
  empreendimento: Empreendimento;
}

export function BookDigital({ empreendimento: e }: Props) {
  const linkWhatsappBook = linkDoPorteiro({ imovelSlug: e.slug, intencao: "material" });

  return (
    <section id="book" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-8 sm:pt-24">
      <Reveal>
        {/* Painel na SUPERFÍCIE do tema (12/09/2026). Era um bloco preto
            fixo "de vitrine de marca" — desenhado quando o site era escuro.
            Com o tema claro como padrão, era a única coisa preta no meio da
            página do imóvel, entre a Sobre e as Tipologias. */}
        <GlassSurface
          preset="painel"
          className="cartao relative overflow-hidden rounded-3xl p-6 sm:p-10"
        >
          {/* Luz de fundo decorativa, agora em camada. Velocidade alta é
              segura num borrão sem borda: ninguém percebe deslocamento —
              percebe só que o painel tem profundidade. */}
          <Camada
            velocidade={0.4}
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-acento/15 blur-3xl botao-vivo"
          >
            <span />
          </Camada>

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Lado Esquerdo: Textos & Ícone */}
            <div className="space-y-4 text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-fluid-xs font-bold bg-acento-lavado text-acento-suave border border-acento-linha">
                <span> <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                <span>Material Exclusivo</span>
              </div>

              <h2 className="text-fluid-xl font-bold text-titulo leading-tight">
                {e.bookUrl
                  ? e.bookTitulo || `Book digital — ${e.nome}`
                  : `Apresentação do ${e.nome}`}
              </h2>

              {/* O texto descreve o que EXISTE (02/10/2026). Antes, todo imóvel
                  prometia "Formato PDF · Acesso Instantâneo" e "acabamentos de
                  altíssimo padrão" — nenhum tinha book cadastrado, o botão
                  levava ao WhatsApp, e acabamento é o que o cliente confere
                  no primeiro minuto da visita. */}
              <p className="text-fluid-sm text-apoio leading-relaxed max-w-xl">
                {e.bookUrl
                  ? "O material da construtora com as perspectivas, as plantas e as especificações do condomínio."
                  : "Peça pelo WhatsApp e receba as fotos, as plantas e as condições deste empreendimento."}
              </p>

              <ul className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 pt-1 text-fluid-xs text-tenue">
                {(e.bookUrl
                  ? ["Arquivo em PDF", "Download na hora", "Gratuito"]
                  : ["Direto no WhatsApp", "Sem formulário", "Gratuito"]
                ).map((item) => (
                  <li key={item} className="flex items-center gap-1">
                    <Check aria-hidden className="h-4 w-4 text-acento-suave" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Lado Direito: Botões de Ação */}
            <div className="flex flex-col gap-3 w-full sm:w-auto shrink-0">
              {e.bookUrl ? (
                <>
                  <a
                    href={e.bookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[52px] px-8 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-sm font-bold transition-all shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2.5 active:scale-98 botao-vivo"
                  >
                    <span> <Download className="inline-block w-5 h-5 align-text-bottom mr-1" />  Baixar Book Completo (PDF)</span>
                    <span className="text-xs">↗</span>
                  </a>

                  <a
                    href={linkWhatsappBook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-6 py-3 rounded-2xl border border-linha-forte bg-elevado text-corpo hover:text-titulo text-fluid-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <span> <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  Receber no WhatsApp</span>
                  </a>
                </>
              ) : (
                <a
                  href={linkWhatsappBook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[52px] px-8 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-sm font-bold transition-all shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2 active:scale-98 botao-vivo"
                >
                  <span> <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  Receber no WhatsApp</span>
                  <span> <ArrowRight className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                </a>
              )}
            </div>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
