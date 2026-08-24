"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { INTRO_VIDEO_URL, INTRO_VIDEO_WEBM_URL } from "@/lib/site";

/**
 * Vinheta da logo como tela de abertura, uma vez por sessão.
 *
 * O papel dela é cobrir o primeiro carregamento — os segundos em que fontes,
 * imagens do hero e o vídeo de fundo ainda estão chegando — com a marca em
 * movimento, em vez de um layout se montando aos pedaços. Três regras
 * mandam aqui:
 *
 * 1. **Nunca prender o usuário.** A vinheta sai quando a logo já se formou
 *    (`ESPERA_MINIMA_MS`) e a página terminou de carregar — e sai de
 *    qualquer jeito no teto (`ESPERA_MAXIMA_MS`), rede lenta ou não. Um
 *    toque em qualquer ponto pula na hora.
 * 2. **Uma vez por sessão.** Navegar entre páginas ou dar F5 não repete a
 *    abertura (`sessionStorage`). O controle é feito por um script inline
 *    ANTES da primeira pintura — sem ele, quem já viu a vinheta veria o
 *    overlay piscar até o React hidratar e removê-lo.
 * 3. **Acessível por padrão.** `prefers-reduced-motion` e `Save-Data` pulam
 *    a vinheta por completo, pelo mesmo script inline — e o <video> só é
 *    montado no cliente, depois da decisão, então quem não vê não baixa.
 */

/**
 * Tempo mínimo de exibição — o arco COMPLETO da vinheta (o arquivo 1.3x
 * dura ~7,8s e o `onEnded` encerra junto). A versão anterior cortava aos
 * 4,2s, na metade da animação, e a abertura parecia um soluço.
 */
const ESPERA_MINIMA_MS = 7200;
/** Teto absoluto: além disso, segurar a tela vira punição, não marca. */
const ESPERA_MAXIMA_MS = 9500;
/** Duração da cortina de saída — casada com o `duration-[950ms]` do overlay. */
const FADE_MS = 950;

const CHAVE_SESSAO = "nh-intro-vista";

/**
 * Roda antes da primeira pintura, dentro do próprio overlay: decide se esta
 * sessão deve ver a vinheta. Qualquer erro (sessionStorage bloqueado, etc.)
 * cai no comportamento seguro de mostrar — o React confirma depois.
 */
const SCRIPT_ANTI_FLASH = `try{
  var el=document.getElementById("nh-intro");
  var visto=sessionStorage.getItem("${CHAVE_SESSAO}");
  var rm=matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sd=navigator.connection&&navigator.connection.saveData;
  if(visto||rm||sd){el.setAttribute("data-oculto","1");}
  else{document.documentElement.setAttribute("data-intro-ativa","1");}
}catch(e){}`;

type Fase = "exibindo" | "saindo" | "encerrado";

function deveExibir(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return false;
  } catch {
    // sessionStorage indisponível (modo privado estrito): mostra uma vez.
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
    return false;
  }
  return true;
}

const inscreverNada = () => () => {};

/**
 * `true` no servidor (o overlay precisa estar no HTML desde o primeiro
 * byte, cobrindo a montagem da página) e a decisão real no cliente. Entre
 * os dois, quem não deve ver já foi escondido pelo script inline.
 */
function usePermitido(): boolean {
  return useSyncExternalStore(inscreverNada, deveExibir, () => true);
}

/** `false` durante o SSR, `true` depois da hidratação — gate do <video>. */
function useHidratado(): boolean {
  return useSyncExternalStore(
    inscreverNada,
    () => true,
    () => false,
  );
}

export function Preloader() {
  const permitido = usePermitido();
  const hidratado = useHidratado();
  const [fase, setFase] = useState<Fase>("exibindo");

  const encerrar = useCallback(() => {
    setFase((atual) => {
      if (atual !== "exibindo") return atual;
      try {
        sessionStorage.setItem(CHAVE_SESSAO, "1");
      } catch {
        // Sem storage, a vinheta repetiria na próxima página — aceitável.
      }
      // Solta o conteúdo da página NO MESMO instante em que a cortina
      // começa a subir: o CSS de [data-intro-ativa] (globals.css) faz as
      // seções chegarem em cascata enquanto a vinheta sai de cena.
      delete document.documentElement.dataset.introAtiva;
      return "saindo";
    });
  }, []);

  useEffect(() => {
    if (!permitido) {
      // Sessão que não vê a vinheta nunca pode ficar com o conteúdo preso.
      delete document.documentElement.dataset.introAtiva;
      return;
    }
    document.documentElement.dataset.introAtiva = "1";

    // A página conta como pronta no evento `load` (imagens do hero
    // inclusas) — se ele já passou, `readyState` diz.
    let paginaPronta = document.readyState === "complete";
    let minimoCumprido = false;

    const tentarSair = () => {
      if (paginaPronta && minimoCumprido) encerrar();
    };

    const aoCarregar = () => {
      paginaPronta = true;
      tentarSair();
    };
    window.addEventListener("load", aoCarregar);

    const timerMinimo = window.setTimeout(() => {
      minimoCumprido = true;
      tentarSair();
    }, ESPERA_MINIMA_MS);

    // O teto ignora as duas condições: rede lenta não aprisiona ninguém.
    const timerTeto = window.setTimeout(encerrar, ESPERA_MAXIMA_MS);

    return () => {
      window.removeEventListener("load", aoCarregar);
      window.clearTimeout(timerMinimo);
      window.clearTimeout(timerTeto);
      delete document.documentElement.dataset.introAtiva;
    };
  }, [permitido, encerrar]);

  // Trava o scroll enquanto a abertura cobre a tela — sem isso o usuário
  // rola uma página que não vê e ela aparece já no meio.
  useEffect(() => {
    if (!permitido || fase === "encerrado") return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [permitido, fase]);

  useEffect(() => {
    if (fase !== "saindo") return;
    const timer = window.setTimeout(() => setFase("encerrado"), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fase]);

  // Esc encerra: com o scroll travado e a tela coberta, o teclado precisa de
  // uma saída além de achar o botão "Pular" por tabulação.
  useEffect(() => {
    if (!permitido || fase === "encerrado") return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") encerrar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [permitido, fase, encerrar]);

  if (!permitido || fase === "encerrado") return null;

  return (
    <div
      id="nh-intro"
      // O script inline adiciona `data-oculto` fora do conhecimento do React.
      suppressHydrationWarning
      onClick={encerrar}
      // Sem `aria-hidden` no contêiner: o botão "Pular" mora aqui dentro, e
      // elemento focável dentro de subárvore escondida vira foco fantasma —
      // o leitor de tela cala justamente quando o foco chega no botão.
      role="dialog"
      aria-label="Vinheta de abertura"
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#eef1f3] transition-[transform,opacity] duration-[950ms] ease-[cubic-bezier(0.83,0,0.17,1)] data-oculto:hidden ${
        fase === "saindo" ? "pointer-events-none -translate-y-full opacity-40" : "translate-y-0 opacity-100"
      }`}
    >
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH }} />
      {/* Sem JavaScript ninguém removeria o overlay — então ele não existe. */}
      <noscript>
        <style>{`#nh-intro{display:none}`}</style>
      </noscript>

      {/* Só nascem no cliente, depois da decisão desta sessão — quem tem
          Save-Data ou já viu a vinheta não baixa um byte do vídeo.

          São DUAS cópias do mesmo vídeo, e é isso que torna o fundo do
          vídeo invisível: a de trás cobre a tela inteira borrada
          (`object-cover` + blur pesado), estendendo o cenário degradê da
          vinheta para além do 16:9; a da frente é a nítida, contida. A
          borda da cópia nítida encosta em conteúdo idêntico borrado, então
          não existe retângulo visível — em nenhuma proporção de tela.
          Clipar o fundo do arquivo para uma cor chapada não funcionaria: o
          cenário é um degradê com elementos encostando nas bordas. */}
      {hidratado && (
        <>
          <video
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl brightness-[1.12] saturate-[0.35] opacity-70"
            autoPlay
            muted
            playsInline
            preload="auto"
          >
            <source src={INTRO_VIDEO_WEBM_URL} type="video/webm" />
            <source src={INTRO_VIDEO_URL} type="video/mp4" />
          </video>
          {/* O wrapper abraça exatamente o 16:9 do vídeo (nada de
              `object-contain` com letterbox dentro do elemento — a máscara
              precisa esfumar a borda do CONTEÚDO, não a da tela). As duas
              máscaras aninhadas (vertical fora, horizontal dentro) se
              compõem sem depender de `mask-composite`. */}
          <div
            className={`relative aspect-video w-[min(100%,177.78vh)] transition-transform duration-[950ms] ease-[cubic-bezier(0.83,0,0.17,1)] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)] ${
              fase === "saindo" ? "scale-110" : "scale-100"
            }`}
          >
            <div className="h-full w-full [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <video
                className="h-full w-full"
                autoPlay
                muted
                playsInline
                preload="auto"
                onEnded={encerrar}
              >
                <source src={INTRO_VIDEO_WEBM_URL} type="video/webm" />
                <source src={INTRO_VIDEO_URL} type="video/mp4" />
              </video>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={encerrar}
        aria-label="Pular vinheta de abertura"
        className="absolute bottom-6 right-6 rounded-full border border-neutral-300 bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-neutral-500 backdrop-blur transition-colors hover:text-neutral-800"
      >
        Pular
      </button>
    </div>
  );
}
