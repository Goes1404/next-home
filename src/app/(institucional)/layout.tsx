import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { HeaderInstitucional } from "@/components/layout/HeaderInstitucional";
import { VoltarAoTopo } from "@/components/layout/VoltarAoTopo";
import { FundoVideoIntro } from "@/components/motion/FundoVideoIntro";
import { HeroImageBackground } from "@/components/motion/HeroImageBackground";
import { HeroVideoBackground } from "@/components/motion/HeroVideoBackground";
import { Preloader } from "@/components/motion/Preloader";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import {
  FUNDO_HOME_POSTER_URL,
  FUNDO_HOME_VIDEO_URL,
  FUNDO_HOME_VIDEO_WEBM_URL,
} from "@/lib/site";

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
  // Sem foto nem vídeo próprio do corretor, o celular ganha a peça da casa.
  const fundoDoCelular = !usaFotoDeFundo && !videoDoCorretor;

  /*
   * NAO ha `preload()` do poster aqui, e isso foi MEDIDO, nao suposto: o
   * `preload` do react-dom nao emite `<link>` nenhum nesta versao — conferido
   * no HTML servido, com e sem `media`. O que de fato entrega o poster cedo e
   * o proprio `<img fetchPriority="high">` abaixo, que ja sai no HTML do
   * servidor. Chamar o `preload` seria codigo prometendo um hint que nao
   * existe.
   */


  return (
    <GlassBackgroundProvider>
      {/* Vinheta da logo na primeira visita da sessão — também vive no
          grupo (vitrine); o sessionStorage garante que aparece uma vez só,
          por qualquer porta que o visitante entre. */}
      <Preloader />
      <div className="barra-progresso" aria-hidden />

      <HeaderInstitucional />

      {/* `data-fundo-parallax` é o nó que o ParallaxFundoHome move — um
          acima de `[data-fundo-video]`, que a AberturaHome já conduz: dois
          donos do mesmo transform brigariam. `will-change` porque este nó
          passa a receber transform a cada quadro. */}
      <div
        data-fundo-parallax
        // `overflow-hidden` como no painel: o parallax escreve `scale()` aqui e a
        // abertura escala o vídeo a 1.22 — o que crescer fica dentro da caixa.
        //
        // `h-lvh` e não `inset-0`: no celular a barra de endereço do navegador
        // some e volta ao rolar, e `inset-0` acompanha a viewport VISÍVEL —
        // a caixa mudava de altura a cada gesto e o vídeo em `cover`
        // reescalava junto ("o fundo fica maior, menor", 10/09/2026). A
        // altura da viewport MAIOR é estável: a caixa nasce do tamanho da
        // tela sem barra e não mexe mais.
        className="fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden fundo-aurora will-change-transform bg-fundo"
      >
        {/* O fundo é a VINHETA, em toda tela: a peça que o Preloader acabou
            de mostrar recua para trás do conteúdo e congela no último quadro.
            O hero-scroll com scrub saiu daqui — pesava 14,8 MB e baixava
            inteiro antes de qualquer interação; a vinheta são 0,7 MB. O
            componente e a receita de reencode continuam no repositório
            (HeroVideoBackground, HERO_VIDEO_URL) para quem for retomá-los.

            Foto de fundo do corretor continua tendo precedência: é
            personalização explícita dele. */}
        {/* A imagem de poster da vinheta (F2 de performance, 13/09) saiu
            junto com o vídeo de fundo, no mesmo dia: era o MESMO quadro do
            logotipo que o usuário pediu para tirar. O LCP passa a ser o
            conteúdo do herói, que já nasce visível (F1). */}
        {usaFotoDeFundo ? (
          <HeroImageBackground src={corretorAtivo.fundoFotoUrl!} />
        ) : videoDoCorretor ? (
          <HeroVideoBackground src={videoDoCorretor} />
        ) : null}
        {/* O fundo em VÍDEO (a vinheta congelada no último quadro) SAIU de
            todas as páginas em 13/09/2026, a pedido: o quadro parado do
            logotipo atrás do conteúdo lia como imagem de fundo aleatória, e
            no celular aparecia inteiro entre as seções. O que fica é a
            aurora em CSS (`fundo-aurora`): as cores da marca, custo zero de
            rede. A vinheta continua no Preloader — como abertura, não como
            papel de parede. Foto ou vídeo PRÓPRIO do corretor seguem tendo
            precedência. */}
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
        <div className="absolute inset-0 bg-gradient-to-b from-fundo/0 via-fundo/0 to-fundo/85 sm:via-fundo/10 sm:to-fundo/90" />
      </div>

      {/*
        O vídeo de fundo do CELULAR (15/09/2026) mora FORA da caixa fixa, e
        isso é a correção de 25/09.

        Até ali ele ficava dentro do fundo `fixed` e saía do caminho por uma
        animação ligada à rolagem (`animation-timeline: scroll()`): o fundo
        fixo aparece atrás da página INTEIRA, e sem esse esmaecimento o
        quadro parado surgia entre o CTA final e o rodapé — a queixa que
        tirou a peça do site em 13/09. Num Brave no Android (bateria em 16%),
        o quadro parado E o vídeo sumiram da primeira tela, com a aurora da
        mesma caixa aparecendo normalmente: o que falhava era só o envoltório
        com a animação de rolagem. No Chromium daqui ela funcionava.

        Aqui a camada é `absolute` no topo do documento: ela rola junto com a
        página e sai do caminho SOZINHA, como qualquer conteúdo, sem pedir
        nada ao navegador além de posicionar uma caixa. Fica depois do fundo
        fixo no DOM, com o mesmo `-z-10`, e por isso pinta por cima dele.
        `h-svh`, e NÃO `h-lvh` como a caixa fixa: a logo tem de ser medida
        pela MESMA régua do herói (`min-h-svh`), senão, num navegador com
        barra em cima e embaixo (Brave no Android), a diferença entre as duas
        alturas sobe o cartão de busca para cima da logo — foi o segundo
        relato de 25/09. Aqui `svh` não "fica maior, menor" ao rolar: essa
        armadilha é de caixa FIXA, que acompanha a viewport; esta camada
        rola com a página e a unidade é estática.
      */}
      {fundoDoCelular && (
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-svh overflow-hidden md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FUNDO_HOME_POSTER_URL}
            alt=""
            aria-hidden
            fetchPriority="high"
            decoding="async"
            className="fundo-poster absolute inset-0 h-full w-full md:hidden"
          />
          <FundoVideoIntro
            somenteMobile
            ignorarMovimentoReduzido
            fonteMobile={{
              webm: FUNDO_HOME_VIDEO_WEBM_URL,
              mp4: FUNDO_HOME_VIDEO_URL,
              vertical: true,
              // 1,5 s e subir 26% da tela: medido quadro a quadro. Antes
              // de 1,5 s a marca ainda nao fechou; depois, o close corta
              // "Next Home" atras da busca. Os 26% tiram o simbolo da
              // frente do cartao de busca (que comeca a 51% da tela).
              pararEm: 1.5,
              deslocarY: -26,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-fundo/0 via-fundo/0 to-fundo/85" />
        </div>
      )}

      {children}
      <VoltarAoTopo />
    </GlassBackgroundProvider>
  );
}
