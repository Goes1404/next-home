import { FONTES_DA_ASTRO } from "@/lib/fontesDaAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import s from "./abertura.module.css";

/**
 * A abertura animada do app da Astro (29/10/2026).
 *
 * Aparece SÓ no app instalado (Play Store ou "adicionar à tela inicial":
 * `display-mode: standalone`), uma vez por sessão, e nunca para quem pediu
 * menos movimento. No navegador comum ninguém a vê.
 *
 * Sem JavaScript de React de propósito: o script inline roda ANTES da
 * primeira pintura e só escreve `data-abertura` no <html> ("sim" mostra,
 * ausente esconde). Decidir depois da hidratação faria o login piscar antes
 * da abertura. O elemento nunca é removido do DOM (a hidratação acusaria
 * diferença); o CSS o esconde e a animação o tira de cena sozinha.
 *
 * Um toque em qualquer lugar pula ("pulou" encurta a saída).
 */
export const CHAVE_DA_ABERTURA = "astro-abertura-vista";

export const SCRIPT_DA_ABERTURA = `try{
  var h=document.documentElement;
  var app=window.matchMedia&&(matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches);
  var calmo=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(app&&!calmo&&!sessionStorage.getItem("${CHAVE_DA_ABERTURA}")){
    sessionStorage.setItem("${CHAVE_DA_ABERTURA}","1");
    h.setAttribute("data-abertura","sim");
    var el=document.getElementById("abertura-do-app");
    if(el){el.addEventListener("click",function(){h.setAttribute("data-abertura","pulou");});}
    setTimeout(function(){h.removeAttribute("data-abertura");},2600);
  }
}catch(e){}`;

export function AberturaDoApp() {
  const [a, b] = MARCA_DA_PLATAFORMA.wordmark;
  return (
    <>
      <div id="abertura-do-app" aria-hidden className={`${FONTES_DA_ASTRO} ${s.abertura}`}>
        <svg viewBox="0 0 64 64" className={s.selo}>
          <defs>
            <linearGradient id="abertura-fundo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1b3a6b" />
              <stop offset="1" stopColor="#0a1830" />
            </linearGradient>
          </defs>
          <rect className={s.ladrilho} width="64" height="64" rx="14" fill="url(#abertura-fundo)" stroke="rgb(169 193 224 / 0.3)" strokeWidth="0.6" />
          <path className={s.letra} pathLength={1} d="M18 48 L32 15 L46 48" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse className={s.orbita} pathLength={1} cx="32" cy="37" rx="24" ry="7.5" transform="rotate(-18 32 37)" fill="none" stroke="#a9c1e0" strokeWidth="2.6" />
          <path className={s.estrela} d="M49 15 L50.6 19.4 L55 21 L50.6 22.6 L49 27 L47.4 22.6 L43 21 L47.4 19.4 Z" fill="#fff" />
        </svg>
        <p className={s.nome}>
          {a}
          <span>{b}</span>
        </p>
        <p className={s.pular}>Toque para pular</p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_ABERTURA }} />
    </>
  );
}
