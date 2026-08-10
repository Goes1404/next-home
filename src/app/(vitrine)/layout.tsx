import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { HERO_VIDEO_URL } from "@/lib/site";

/**
 * Layout compartilhado pela home e pela listagem de empreendimentos.
 *
 * O vídeo de fundo mora aqui, fora da árvore que cada `page.tsx` troca a
 * cada navegação — layouts persistem entre rotas irmãs, então o elemento
 * `<video>` nunca desmonta ao ir de "/" para "/empreendimentos": ele
 * continua tocando exatamente de onde estava, sem reiniciar. Só o
 * conteúdo de cada página (envolto em `<ViewTransition>` lá dentro) desliza
 * na troca.
 *
 * A página de detalhe (`empreendimentos/[slug]`) também vive dentro deste
 * grupo — para herdar o mesmo `error.tsx`/`loading.tsx` da listagem — mas
 * registra sua própria imagem de capa via um `GlassBackgroundProvider`
 * aninhado, que sobrepõe este aqui só para a própria subárvore; o vídeo
 * continua rodando por baixo, apenas encoberto pelo hero opaco da página.
 */
export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlassBackgroundProvider>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-brand-900 via-ink-950 to-ink-950">
        {HERO_VIDEO_URL && <HeroVideoBackground src={HERO_VIDEO_URL} />}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/35 to-ink-950" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
