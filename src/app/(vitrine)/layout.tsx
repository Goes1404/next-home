import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { HERO_VIDEO_URL } from "@/lib/site";

import { getCorretorAtivo } from "@/lib/corretorAtivo";

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
export default async function VitrineLayout({ children }: { children: React.ReactNode }) {
  const corretorAtivo = await getCorretorAtivo();
  const usaFotoDeFundo = corretorAtivo?.fundoTipo === "foto" && corretorAtivo.fundoFotoUrl;
  const videoUrl = corretorAtivo?.videoUrl || HERO_VIDEO_URL;

  return (
    <GlassBackgroundProvider>
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
