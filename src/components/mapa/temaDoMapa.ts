/**
 * Tiles do mapa acompanhando o tema do site.
 *
 * A mesma lógica do CSS, lida do lado do JS: `data-tema` no `<html>` quando
 * o visitante escolheu tema (carimbado pelo servidor, ver layout raiz), e a
 * preferência do sistema quando não escolheu. O observer cobre a troca de
 * tema sem recarregar a página — o mapa reage na hora, como o resto da UI.
 */

export type TemaMapa = "claro" | "escuro";

export const TILES_MAPA: Record<TemaMapa, string> = {
  escuro: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  claro: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
};

/** Exigência de licença dos dados (OSM) e dos tiles (CARTO). */
export const ATRIBUICAO_MAPA = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function temaDoMapa(): TemaMapa {
  const explicito = document.documentElement.dataset.tema;
  if (explicito === "claro" || explicito === "escuro") return explicito;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** Observa troca de tema (atributo ou preferência do SO). Devolve o desligamento. */
export function aoMudarTema(aoTrocar: (tema: TemaMapa) => void): () => void {
  let atual = temaDoMapa();

  const conferir = () => {
    const novo = temaDoMapa();
    if (novo !== atual) {
      atual = novo;
      aoTrocar(novo);
    }
  };

  const observer = new MutationObserver(conferir);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });

  const consulta = window.matchMedia("(prefers-color-scheme: dark)");
  consulta.addEventListener("change", conferir);

  return () => {
    observer.disconnect();
    consulta.removeEventListener("change", conferir);
  };
}
