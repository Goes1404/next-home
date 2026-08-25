import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { FundoVideoIntro } from "@/components/motion/FundoVideoIntro";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Preloader } from "@/components/motion/Preloader";
import { HERO_VIDEO_URL, HERO_VIDEO_WEBM_URL } from "@/lib/site";

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
      {/* Vinheta da logo na primeira visita da sessão — cobre a montagem
          da página enquanto fontes e o vídeo de fundo ainda carregam. */}
      <Preloader />

      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-fundo-marca via-fundo to-fundo">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          <>
            {videoUrl && (
              <HeroVideoBackground
                src={videoUrl}
                srcWebm={videoUrl === HERO_VIDEO_URL ? HERO_VIDEO_WEBM_URL : undefined}
              />
            )}
            {/* O hero-scroll não monta no celular (14,8 MB antes de qualquer
                interação), e sem par o fundo aqui era um gradiente liso. A
                vinheta — 0,7 MB, a mesma peça do institucional — cobre a tela
                inteira lá, e os dois nunca aparecem juntos: um só existe
                acima de 768px, o outro só abaixo. */}
            <FundoVideoIntro somenteMobile />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/30 via-fundo/10 to-fundo/90" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
