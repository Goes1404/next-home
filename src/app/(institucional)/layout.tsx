import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { HERO_VIDEO_URL } from "@/lib/site";

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
      <HeaderInstitucional />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-fundo-marca via-fundo to-fundo">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          videoUrl && <HeroVideoBackground src={videoUrl} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/55 via-fundo/35 to-fundo" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
