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
export function FundoVideoIntro({ somenteMobile = false }: { somenteMobile?: boolean } = {}) {
  const exibir = usePodeExibir(somenteMobile);
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

  if (!exibir) return null;

  const fontes = (
    <>
      <source src={INTRO_VIDEO_WEBM_URL} type="video/webm" />
      <source src={INTRO_VIDEO_URL} type="video/mp4" />
    </>
  );

  return (
    /* `data-fundo-video` mora no INVÓLUCRO, não em cada vídeo: é ele que a
       AberturaHome procura para conduzir o recuo da peça de marca, e ela usa
       `querySelector` — com o atributo nos filhos, só a primeira camada
       recuaria e as duas se descolariam na tela. `overflow-hidden` porque a
       camada de preenchimento é ampliada de propósito. */
    <div
      data-fundo-video
      aria-hidden
      className={`absolute inset-0 overflow-hidden transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Camada de PREENCHIMENTO: enche a tela em qualquer proporção. Desfocada
          e um tanto apagada para não competir com a logo nítida por cima —
          quem tem de ser lido é o quadro de cima. */}
      <video
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={pararNoFim}
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
      >
        {fontes}
      </video>

      {/* Camada da LOGO: contida, então a marca aparece inteira em toda tela. */}
      <video
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setPronto(true)}
        onEnded={pararNoFim}
        className="absolute inset-0 h-full w-full object-contain"
      >
        {fontes}
      </video>
    </div>
  );
}
