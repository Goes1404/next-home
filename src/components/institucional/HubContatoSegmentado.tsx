import Link from "next/link";
import { site, enderecoLinha } from "@/lib/site";
import { Home, MessageCircle, TrendingUp, Handshake, MapPin } from "lucide-react";

interface Props {
  linkWhatsapp: string;
}

export function HubContatoSegmentado({ linkWhatsapp }: Props) {
  return (
    <section className="relative py-16 sm:py-24 border-t border-linha/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Lado Esquerdo: Cabeçalho & Canais */}
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-veu/5 border border-linha/10 text-acento-forte text-fluid-xs font-semibold backdrop-blur">
              <span> <MessageCircle className="inline-block w-5 h-5 align-text-bottom mr-1" />  Canais de Atendimento</span>
            </div>
            <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
              Fale com nossos corretores e faça o melhor negócio
            </h2>
            <p className="text-fluid-sm text-legenda font-normal">
              Atendimento rápido para quem quer comprar, vender, alugar ou investir com as melhores taxas e condições da região.
            </p>

            <div className="pt-4 flex flex-wrap gap-3">
              <a
                href={linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-fluid-sm transition-colors shadow-lg shadow-emerald-900/30"
              >
                <span>Chamar no WhatsApp</span>
                <span>→</span>
              </a>

              <Link
                href="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/15 text-corpo font-semibold text-fluid-sm transition-colors border border-white/15"
              >
                Enviar Mensagem
              </Link>
            </div>
          </div>

          {/* Lado Direito: Grid de Cards Segmentados */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Comprar */}
            <div className="p-5 rounded-2xl border border-linha/10 bg-superficie/60 backdrop-blur space-y-2">
              <span className="text-2xl block"> <Home className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
              <h4 className="text-fluid-sm font-bold text-titulo">Quero Comprar ou Investir</h4>
              <p className="text-[12px] text-legenda">
                Receba opções na planta e prontas para morar com fluxo de pagamento facilitado.
              </p>
              <a
                href={linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluid-xs font-semibold text-acento-forte hover:underline inline-block pt-1"
              >
                Ver ofertas no WhatsApp →
              </a>
            </div>

            {/* Card 2: Anunciar Imóvel */}
            <div className="p-5 rounded-2xl border border-linha/10 bg-superficie/60 backdrop-blur space-y-2">
              <span className="text-2xl block"> <TrendingUp className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
              <h4 className="text-fluid-sm font-bold text-titulo">Anunciar meu Imóvel</h4>
              <p className="text-[12px] text-legenda">
                Avaliação justa e divulgação ativa para compradores prontos para fechar negócio.
              </p>
              <Link
                href="/anunciar-imovel"
                className="text-fluid-xs font-semibold text-acento-forte hover:underline inline-block pt-1"
              >
                Cadastrar imóvel grátis →
              </Link>
            </div>

            {/* Card 3: Parcerias e Corretores */}
            <div className="p-5 rounded-2xl border border-linha/10 bg-superficie/60 backdrop-blur space-y-2">
              <span className="text-2xl block"> <Handshake className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
              <h4 className="text-fluid-sm font-bold text-titulo">Seja um Corretor Parceiro</h4>
              <p className="text-[12px] text-legenda">
                Trabalhe com os melhores lançamentos, suporte completo e comissões atrativas.
              </p>
              <Link
                href="/contato?assunto=parceria"
                className="text-fluid-xs font-semibold text-acento-forte hover:underline inline-block pt-1"
              >
                Fazer parceria →
              </Link>
            </div>

            {/* Card 4: Sede & Endereço */}
            <div className="p-5 rounded-2xl border border-linha/10 bg-superficie/60 backdrop-blur space-y-2">
              <span className="text-2xl block"> <MapPin className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
              <h4 className="text-fluid-sm font-bold text-titulo">Sede & Atendimento</h4>
              <p className="text-[12px] text-legenda">
                {enderecoLinha}
              </p>
              <span className="text-[11px] text-tenue font-medium block pt-1">
                CRECI {site.creci}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
