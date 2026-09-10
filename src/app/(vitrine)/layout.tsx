import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { FundoVideoIntro } from "@/components/motion/FundoVideoIntro";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Preloader } from "@/components/motion/Preloader";

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
  /*
   * O vídeo da casa SAIU daqui em 10/09/2026, e o número é o motivo:
   * `hero-scroll-fluido` pesa 15 MB (por codec), e ele era baixado por todo
   * visitante de desktop em QUALQUER página da vitrine — catálogo, ficha de
   * imóvel, mapa, portfólio. Era, de longe, o maior peso do site inteiro
   * (o bundle todo dá 2,6 MB).
   *
   * O que fica no lugar é a aurora em CSS: três manchas de luz nas cores da
   * marca, custo zero de rede e nenhuma decodificação. A home institucional
   * mantém a vinheta de 0,7 MB, que é o momento de marca de verdade.
   *
   * Vídeo PRÓPRIO do corretor continua tendo precedência: é personalização
   * explícita dele, feita no painel, e não é a casa impondo peso a ninguém.
   */
  const videoUrl = corretorAtivo?.videoUrl || null;

  return (
    <GlassBackgroundProvider>
      {/* Vinheta da logo na primeira visita da sessão — cobre a montagem
          da página enquanto fontes e o vídeo de fundo ainda carregam. */}
      <Preloader />

      {/* `h-lvh` e não `inset-0`: a barra de endereço do celular redimensiona
          a viewport visível ao rolar, e a caixa (com o vídeo em `cover`)
          reescalava a cada gesto. Ver o mesmo comentário no layout do
          institucional. */}
      <div className="fixed inset-x-0 top-0 -z-10 h-lvh fundo-aurora overflow-hidden bg-fundo">
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : (
          <>
            {videoUrl && (
              <HeroVideoBackground src={videoUrl} />
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
