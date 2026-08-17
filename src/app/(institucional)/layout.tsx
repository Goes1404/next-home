import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
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
 * O corretor ativo é resolvido aqui uma vez e desce para o CTA flutuante:
 * mesmo no institucional, quem chegou pelo link de um corretor continua
 * falando com ele.
 */
export default async function InstitucionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const corretorAtivo = await getCorretorAtivo();

  return (
    <GlassBackgroundProvider>
      <HeaderInstitucional />
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-brand-900 via-ink-950 to-ink-950">
        {HERO_VIDEO_URL && <HeroVideoBackground src={HERO_VIDEO_URL} />}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/35 to-ink-950" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
