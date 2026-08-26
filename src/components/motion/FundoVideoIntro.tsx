"use client";

import { useState, useSyncExternalStore } from "react";
import { INTRO_VIDEO_URL, INTRO_VIDEO_WEBM_URL } from "@/lib/site";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";
const CONSULTA_MOBILE = "(max-width: 767.98px)";

/**
 * Não exibe com movimento reduzido ou em economia de dados. Não há corte por
 * largura: a vinheta é o fundo em TODA tela — salvo quando o chamador pede
 * `somenteMobile`, que existe para o grupo (vitrine), onde o desktop já tem o
 * hero-scroll e os dois nunca podem montar juntos.
 */
function podeExibir(somenteMobile: boolean): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  if (somenteMobile && !window.matchMedia(CONSULTA_MOBILE).matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

function inscrever(aoMudar: () => void): () => void {
  const movimento = window.matchMedia(CONSULTA_MOVIMENTO);
  const mobile = window.matchMedia(CONSULTA_MOBILE);
  movimento.addEventListener("change", aoMudar);
  mobile.addEventListener("change", aoMudar);
  return () => {
    movimento.removeEventListener("change", aoMudar);
    mobile.removeEventListener("change", aoMudar);
  };
}

function usePodeExibir(somenteMobile: boolean): boolean {
  return useSyncExternalStore(
    inscrever,
    () => podeExibir(somenteMobile),
    () => false,
  );
}

/**
 * Se a tela é de celular AGORA. Mesma inscrição de `usePodeExibir` — o
 * fundo pode ser um vídeo diferente aqui (ver `fonteMobile`), e no SSR a
 * resposta é `false` como no resto do componente: o servidor não emite
 * vídeo nenhum.
 */
function useEhMobile(): boolean {
  return useSyncExternalStore(
    inscrever,
    () => window.matchMedia(CONSULTA_MOBILE).matches,
    () => false,
  );
}

/**
 * Fundo da home: o vídeo da vinheta de abertura (public/video/intro.*), a
 * mesma peça que o Preloader acabou de mostrar — ela desce para trás do
 * conteúdo e congela no último quadro. A continuidade é o ponto: a marca não
 * "sai" da tela quando a vinheta acaba, ela recua e vira ambiente.
 *
 * Por que o intro e não o hero-scroll: o intro pesa 0,7 MB (webm) contra
 * os 14,8 MB do vídeo de scrub — cabe no 4G sem comprometer a página. O
 * desktop continua com o hero-scroll intacto (HeroVideoBackground); este
 * componente é o par mobile dele, e os dois nunca montam juntos.
 *
 * O HTML do servidor nunca contém o vídeo (useSyncExternalStore devolve
 * false no SSR): quem está com movimento reduzido ou com Save-Data não baixa
 * um byte. O fade-in evita o corte seco quando o primeiro quadro chega.
 *
 * ## Por que DUAS camadas do mesmo vídeo
 *
 * O arquivo é 16:9 e a tela quase nunca é. Com `object-contain` (o que havia
 * antes) sobravam faixas vazias — gritantes no celular em pé, onde a vinheta
 * virava uma tarja no meio de um retângulo alto. Com `object-cover` sozinho a
 * tela enche, mas o corte come justamente a LOGO: num 9:19,5 resta cerca de um
 * quarto da largura do quadro, e "Next Home" chega ao visitante partido ao
 * meio.
 *
 * A saída é a clássica: a camada de baixo é o MESMO vídeo em `cover`, ampliado
 * e desfocado — ela existe só para não haver borda vazia, e desfocada o corte
 * não tem o que estragar; a de cima é `contain`, com a logo inteira. O arquivo
 * é o mesmo URL, então a rede busca uma vez só; o custo real é a segunda
 * decodificação, que termina junto com a vinheta (as duas congelam no último
 * quadro).
 */
export function FundoVideoIntro({
  somenteMobile = false,
  fonteMobile,
}: {
  somenteMobile?: boolean;
  /**
   * Vídeo alternativo para telas de celular. Sem isto, mobile e desktop
   * usam a mesma vinheta de abertura — que era o comportamento até
   * 26/08/2026, quando a home ganhou uma peça própria no celular.
   */
  fonteMobile?: {
    webm: string;
    mp4: string;
    /**
     * A peça já está na proporção da tela (9:16). Sem isto o componente
     * monta as DUAS camadas — a desfocada existe só para preencher a
     * borda que sobra de um vídeo 16:9 numa tela alta, e num vídeo
     * vertical não sobra borda nenhuma: `cover` enche a tela e a segunda
     * decodificação seria peso e bateria a troco de nada.
     */
    vertical?: boolean;
    /**
     * Segundo em que a peça CONGELA, em vez de ir até o fim.
     *
     * O último quadro desta vinheta é um close: a logo cresce até
     * estourar a tela e "Next Home" chega cortado atrás da busca. Parar
     * antes é o que devolve o enquadramento — logo inteira, prédios em
     * volta —, e é decisão de composição, não de duração.
     */
    pararEm?: number;
    /**
     * Quanto SUBIR o quadro, em % da altura da tela.
     *
     * Existe porque a peça foi composta com a marca na metade de BAIXO —
     * medido quadro a quadro: o símbolo ocupa de 42% a 79% da altura do
     * vídeo, e a busca da home começa a 51% da tela. Os dois disputam o
     * mesmo lugar, e nenhum `object-position` resolve: com `cover` numa
     * tela mais alta que o vídeo a escala é dada pela ALTURA, então não
     * sobra folga vertical para deslocar dentro da caixa.
     *
     * Subir o quadro tira a marca da frente da busca; a faixa que sobra
     * embaixo fica justamente atrás do cartão de busca e do degrau final
     * do véu, então não aparece.
     */
    deslocarY?: number;
  };
} = {}) {
  const exibir = usePodeExibir(somenteMobile);
  const ehMobile = useEhMobile();
  const [pronto, setPronto] = useState(false);

  /**
   * Trava no último quadro em vez de repetir. `loop` sozinho reiniciaria a
   * vinheta a cada ciclo — a logo fecharia e sumiria sem parar; e só tirar
   * `loop` deixaria o vídeo "acabado" (alguns navegadores repintam o poster
   * ou o primeiro quadro no `ended`). Voltar um tico antes do fim e pausar
   * fixa a imagem final na tela.
   *
   * O elemento vem do próprio evento (`currentTarget`) em vez de um ref: são
   * duas camadas do mesmo vídeo e cada uma pausa a si mesma.
   */
  const pararNoFim = (evento: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = evento.currentTarget;
    if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.05);
    v.pause();
  };

  /**
   * Congela no segundo pedido, em vez de esperar o fim.
   *
   * `timeupdate` dispara a cada ~250ms, então o vídeo pode passar alguns
   * quadros do alvo — por isso o `currentTime` é reposicionado, e não só
   * pausado: o quadro que fica na tela é o escolhido, não o que calhou.
   * A guarda de `paused` existe porque reposicionar dispara um seek, que
   * dispara outro `timeupdate`.
   */
  const congelarNoPonto = (evento: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!pararEm) return;
    const v = evento.currentTarget;
    if (v.paused || v.currentTime < pararEm) return;
    v.currentTime = pararEm;
    v.pause();
  };

  if (!exibir) return null;

  const usarAlternativo = Boolean(fonteMobile) && ehMobile;
  const vertical = usarAlternativo && Boolean(fonteMobile!.vertical);
  const pararEm = usarAlternativo ? fonteMobile!.pararEm : undefined;
  const deslocarY = usarAlternativo ? fonteMobile!.deslocarY : undefined;
  const webm = usarAlternativo ? fonteMobile!.webm : INTRO_VIDEO_WEBM_URL;
  const mp4 = usarAlternativo ? fonteMobile!.mp4 : INTRO_VIDEO_URL;

  const fontes = (
    <>
      <source src={webm} type="video/webm" />
      <source src={mp4} type="video/mp4" />
    </>
  );

  return (
    /* `data-fundo-video` mora no INVÓLUCRO, não em cada vídeo: é ele que a
       AberturaHome procura para conduzir o recuo da peça de marca, e ela usa
       `querySelector` — com o atributo nos filhos, só a primeira camada
       recuaria e as duas se descolariam na tela. `overflow-hidden` porque a
       camada de preenchimento é ampliada de propósito. */
    <div
      /* A key troca com a fonte: mudar os <source> de um <video> já montado
         NÃO recarrega nada (o navegador só lê a lista uma vez), então quem
         cruzasse o breakpoint ficaria com o vídeo da largura anterior. */
      key={webm}
      data-fundo-video
      aria-hidden
      className={`absolute inset-0 overflow-hidden transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* A camada de PREENCHIMENTO só existe para o vídeo 16:9: ela cobre a
          tela desfocada para não sobrar borda vazia em volta do quadro
          contido. Vídeo vertical dispensa — e dispensar economiza uma
          decodificação inteira no aparelho mais fraco. */}
      {!vertical && (
        <video
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={congelarNoPonto}
          onEnded={pararNoFim}
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
        >
          {fontes}
        </video>
      )}

      {/* A camada da MARCA. `contain` no 16:9 (a logo inteira, com o
          desfoque preenchendo em volta); `cover` no vertical, que já tem a
          proporção da tela — ali `contain` deixaria tarja em cima e
          embaixo justamente onde não precisa. */}
      <video
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setPronto(true)}
        onTimeUpdate={congelarNoPonto}
        onEnded={pararNoFim}
        className={`absolute inset-0 h-full w-full ${vertical ? "object-cover" : "object-contain"}`}
        style={deslocarY ? { transform: `translateY(${deslocarY}%)` } : undefined}
      >
        {fontes}
      </video>
    </div>
  );
}
