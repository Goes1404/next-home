import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { FundoVideoIntro } from "@/components/motion/FundoVideoIntro";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Preloader } from "@/components/motion/Preloader";
import { getCorretorAtivo } from "@/lib/corretorAtivo";

/**
 * Casca do site institucional — a face pública para quem chega pelo Google,
 * separada do grupo `(vitrine)`, que serve o catálogo que o corretor
 * compartilha.
 *
 * Mesmo fundo fixo em vídeo da vitrine: a identidade visual é a mesma, muda
 * só o conteúdo e a navegação. O fundo é `position: fixed`, o que casa com a
 * suposição do shader de GlassSurface de que o vidro refrata o viewport — por
 * isso nenhuma página abaixo pode envolver header/CTA num ancestral com
 * `transform`.
 *
 * O CTA flutuante do WhatsApp não mora aqui, e sim em cada página — mesmo
 * padrão do grupo `(vitrine)`. A página de um corretor é o motivo: ela já tem
 * o botão dele, nomeado, no alto; um segundo botão flutuante apontando para a
 * linha geral (ou para o corretor do cookie, que pode ser um colega) duplica a
 * ação e faz o visitante escolher entre dois WhatsApps na mesma tela sem saber
 * que são pessoas diferentes. Quem precisa do CTA, monta o seu.
 */
export default async function InstitucionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const corretorAtivo = await getCorretorAtivo();
  const usaFotoDeFundo = corretorAtivo?.fundoTipo === "foto" && corretorAtivo.fundoFotoUrl;
  // Vídeo PRÓPRIO do corretor continua tendo precedência sobre a vinheta:
  // é personalização explícita dele, e trocá-la pela peça da casa apagaria
  // uma escolha que ele fez no painel.
  const videoDoCorretor = corretorAtivo?.videoUrl || null;

  return (
    <GlassBackgroundProvider>
      {/* Vinheta da logo na primeira visita da sessão — também vive no
          grupo (vitrine); o sessionStorage garante que aparece uma vez só,
          por qualquer porta que o visitante entre. */}
      <Preloader />

      <HeaderInstitucional />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-fundo-marca via-fundo to-fundo">
        {/* O fundo é a VINHETA, em toda tela: a peça que o Preloader acabou
            de mostrar recua para trás do conteúdo e congela no último quadro.
            O hero-scroll com scrub saiu daqui — pesava 14,8 MB e baixava
            inteiro antes de qualquer interação; a vinheta são 0,7 MB. O
            componente e a receita de reencode continuam no repositório
            (HeroVideoBackground, HERO_VIDEO_URL) para quem for retomá-los.

            Foto de fundo do corretor continua tendo precedência: é
            personalização explícita dele. */}
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : videoDoCorretor ? (
          <HeroVideoBackground src={videoDoCorretor} />
        ) : (
          <FundoVideoIntro />
        )}
        {/* O degrau do MEIO é o que segura o título do hero, que é centrado.
            O véu é forte igual nas duas larguras porque o fundo agora é o
            mesmo em todas: a vinheta tem a logo grande e clara passando
            exatamente atrás do h1, e com os 40% de antes o título perdia
            legibilidade. */}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/70 via-fundo/62 to-fundo/95" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
