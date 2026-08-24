import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { SkylineParticulas } from "@/components/motion/SkylineParticulas";
import { Preloader } from "@/components/motion/Preloader";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { HERO_VIDEO_URL, HERO_VIDEO_WEBM_URL } from "@/lib/site";

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
  const videoUrl = corretorAtivo?.videoUrl || HERO_VIDEO_URL;

  return (
    <GlassBackgroundProvider>
      {/* Vinheta da logo na primeira visita da sessão — também vive no
          grupo (vitrine); o sessionStorage garante que aparece uma vez só,
          por qualquer porta que o visitante entre. */}
      <Preloader />

      <HeaderInstitucional />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-fundo-marca via-fundo to-fundo">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          videoUrl && (
            <HeroVideoBackground
              src={videoUrl}
              srcWebm={videoUrl === HERO_VIDEO_URL ? HERO_VIDEO_WEBM_URL : undefined}
            />
          )
        )}
        {/* Par do vídeo para o CELULAR (o vídeo só monta no desktop): skyline
            de partículas que se transforma com o scroll. Decide sozinho se
            monta — mesmo padrão de gate do HeroVideoBackground. */}
        <SkylineParticulas />
        {/* O degrau do MEIO é o que segura o título do hero, que é centrado —
            e o vídeo por baixo muda de quadro com o scroll, então o contraste
            não pode depender da sorte do frame. Os 10% antigos falhavam
            exatamente ali. */}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/45 via-fundo/40 to-fundo/95" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
