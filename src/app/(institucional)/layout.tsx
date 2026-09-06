import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { FundoVideoIntro } from "@/components/motion/FundoVideoIntro";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Preloader } from "@/components/motion/Preloader";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { FUNDO_HOME_VIDEO_URL, FUNDO_HOME_VIDEO_WEBM_URL } from "@/lib/site";

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

      {/* `data-fundo-parallax` é o nó que o ParallaxFundoHome move — um
          acima de `[data-fundo-video]`, que a AberturaHome já conduz: dois
          donos do mesmo transform brigariam. `will-change` porque este nó
          passa a receber transform a cada quadro. */}
      <div
        data-fundo-parallax
        // `overflow-hidden` como no painel: o parallax escreve `scale()` aqui e a
        // abertura escala o vídeo a 1.22 — o que crescer fica dentro da caixa.
        className="fixed inset-0 -z-10 overflow-hidden will-change-transform bg-gradient-to-br from-fundo-marca via-fundo to-fundo"
      >
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
          /* No celular, a home tem vinheta própria (prédios abrindo para a
             logo no céu); no desktop segue a de abertura, a mesma que o
             preloader acabou de mostrar. */
          <FundoVideoIntro
            fonteMobile={{
              webm: FUNDO_HOME_VIDEO_WEBM_URL,
              mp4: FUNDO_HOME_VIDEO_URL,
              vertical: true,
              // Congela com a logo inteira e os prédios em volta; o fim da
              // peça é um close que corta "Next Home" atrás da busca.
              //
              // 1,5s + subir 26% da tela: medido quadro a quadro. Antes de
              // 1,5s a marca ainda não fechou; depois, só cresce. Os 26%
              // são o que tira o símbolo da frente do cartão de busca (que
              // começa a 51% da tela) sem levar o topo dele para trás do
              // header.
              pararEm: 1.5,
              deslocarY: -26,
            }}
          />
        )}
        {/* O véu tem PESOS DIFERENTES por largura, e a razão é o que está
            por cima dele. No desktop o h1 é centrado e a logo passa
            exatamente atrás dele — com pouco véu o título some. No celular
            o texto do hero saiu da tela (26/08), então não há o que
            proteger — e um véu que não protege nada só LAVA a imagem:
            medido, os 25% de véu derrubavam a saturação da peça de 0,269
            (arquivo) para 0,130 na tela, metade da cor. Por isso o
            celular vai a zero no topo. O degrau FINAL continua forte nas
            duas: é ele que evita o corte seco para a primeira banda
            opaca, e é ele que sustenta o esmaecimento da base do vídeo. */}
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/0 via-fundo/0 to-fundo/85 sm:from-fundo/70 sm:via-fundo/62 sm:to-fundo/95" />
      </div>

      {children}
    </GlassBackgroundProvider>
  );
}
