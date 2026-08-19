import { Reveal } from "@/components/motion/Reveal";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { linkWhatsappPara } from "@/lib/site";
import type { Empreendimento } from "@/lib/types";import { Smartphone, FileText, Download, Check, ArrowRight } from 'lucide-react';


interface Props {
  empreendimento: Empreendimento;
}

export function BookDigital({ empreendimento: e }: Props) {
  const linkWhatsappBook = linkWhatsappPara(
    e.corretor.whatsapp,
    `Olá, ${e.corretor.nome}! Gostaria de receber o Book Digital e a tabela oficial do ${e.nome}.`,
  );

  return (
    <section id="book" className="mx-auto max-w-4xl scroll-mt-24 px-4 pt-16 sm:pt-24">
      <Reveal>
        {/* Painel escuro fixo nos dois temas, de propósito: é uma vitrine de
            marca (gradiente, botões e texto branco fixos), não uma leitura
            de página — convertê-lo pediria redesenhar cada estado, não só
            trocar token de cor. */}
        <GlassSurface
          preset="painel"
          className="relative overflow-hidden rounded-3xl p-6 sm:p-10 border border-brand-500/30 bg-gradient-to-br from-ink-900/90 via-ink-950/95 to-ink-900/90 shadow-2xl"
        >
          {/* Luz de fundo decorativa */}
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Lado Esquerdo: Textos & Ícone */}
            <div className="space-y-4 text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-fluid-xs font-bold bg-brand-500/20 text-brand-300 border border-brand-500/40">
                <span> <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                <span>Material Exclusivo</span>
              </div>

              <h2 className="text-fluid-2xl font-bold text-white leading-tight">
                {e.bookTitulo || `Book Digital & Apresentação Oficial — ${e.nome}`}
              </h2>

              <p className="text-fluid-sm text-mist-300 leading-relaxed max-w-xl">
                Acesse o material completo com todas as perspectivas artísticas, detalhes de acabamentos de altíssimo padrão, plantas humanizadas de todas as tipologias e especificações do condomínio.
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-1 text-[11px] text-mist-400">
                <span className="flex items-center gap-1">
                  <span className="text-emerald-400"> <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Formato PDF Alta Resolução
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-emerald-400"> <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Acesso Instantâneo
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-emerald-400"> <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Gratuito
                </span>
              </div>
            </div>

            {/* Lado Direito: Botões de Ação */}
            <div className="flex flex-col gap-3 w-full sm:w-auto shrink-0">
              {e.bookUrl ? (
                <>
                  <a
                    href={e.bookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[52px] px-8 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-sm font-bold transition-all shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2.5 active:scale-98"
                  >
                    <span> <Download className="inline-block w-5 h-5 align-text-bottom mr-1" />  Baixar Book Completo (PDF)</span>
                    <span className="text-xs">↗</span>
                  </a>

                  <a
                    href={linkWhatsappBook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-mist-200 hover:text-white text-fluid-xs font-semibold transition-colors flex items-center justify-center gap-2 border border-white/10"
                  >
                    <span> <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  Receber no WhatsApp</span>
                  </a>
                </>
              ) : (
                <a
                  href={linkWhatsappBook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[52px] px-8 py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-sm font-bold transition-all shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2 active:scale-98"
                >
                  <span> <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  Solicitar Book no WhatsApp</span>
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
