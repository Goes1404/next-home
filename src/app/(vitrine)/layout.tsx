import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { FundoDaCasaDesktop } from "@/components/motion/FundoDaCasaDesktop";
import { FundoDoLink, PersonalizacaoDoLink } from "@/components/motion/FundoDoLink";
import { Preloader } from "@/components/motion/Preloader";
import { VoltarAoTopo } from "@/components/layout/VoltarAoTopo";
import { PixelMeta } from "@/components/analytics/PixelMeta";
import { grupoDoSite } from "@/lib/grupos/grupo";
import { integracaoLiberada } from "@/lib/grupos/integracoes";
import { BarraDeFavoritosSobDemanda } from "@/components/layout/SobDemanda";

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
/**
 * Validade da casca estática (F2b, 12/10/2026) — ver o mesmo comentário no
 * layout do institucional. `/portfolio` e `/empreendimentos` continuam
 * dinâmicas (a primeira ordena pelos destaques do corretor do link, a
 * segunda lê filtros em `searchParams`); a ficha do imóvel, o mapa e o
 * comparador é que passam a ser servidos do cache.
 */
export const revalidate = 3600;

export default function VitrineLayout({ children }: { children: React.ReactNode }) {
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
   * Desde 12/10/2026 quem decide isso é o navegador (FundoDoLink): o HTML
   * sai estático com o fundo da casa, e quem veio por link pessoal vê o
   * fundo do corretor entrar logo depois da primeira pintura.
   */
  return (
    <GlassBackgroundProvider>
    <PersonalizacaoDoLink>
      {/* Vinheta da logo na primeira visita da sessão — cobre a montagem
          da página enquanto fontes e o vídeo de fundo ainda carregam. */}
      <Preloader />
      <div className="barra-progresso" aria-hidden />

      {/* `h-lvh` e não `inset-0`: a barra de endereço do celular redimensiona
          a viewport visível ao rolar, e a caixa (com o vídeo em `cover`)
          reescalava a cada gesto. Ver o mesmo comentário no layout do
          institucional. */}
      <div className="fixed inset-x-0 top-0 -z-10 h-lvh fundo-aurora overflow-hidden bg-fundo">
        {/* Sem vinheta de fundo desde 13/09/2026 (ver o layout do
            institucional): a aurora em CSS cobre os dois tamanhos. */}
        <FundoDoLink padrao={<FundoDaCasaDesktop />} />
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/30 via-fundo/10 to-fundo/90" />
      </div>

      {children}
      {/* O Pixel é o da Next Home: só no site do grupo dela até a fase 7 (L19). */}
      {integracaoLiberada(grupoDoSite(), "pixel") && <PixelMeta />}
      <VoltarAoTopo />
      <BarraDeFavoritosSobDemanda />
    </PersonalizacaoDoLink>
    </GlassBackgroundProvider>
  );
}
