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

/**
 * O mapa é ESCURO nos dois temas, desde 10/09/2026.
 *
 * Os tiles `light_all` da CARTO são cinza-claro sobre cinza-claro: num tema
 * de página clara o mapa deixava de ser um objeto e virava uma mancha, com
 * os pins de acento boiando sem base. É a mesma lição já registrada para o
 * GLOBO da home ("globo claro sobre página clara SOME... a esfera é escura
 * nos dois temas"): o que dá destaque a um artefato geográfico é o
 * contraste com a página, não a combinação com ela.
 *
 * A função continua existindo — e o observador de troca de tema também —
 * porque o dia em que um mapa claro fizer sentido em alguma superfície, o
 * lugar de decidir isso é aqui, e não espalhado por três componentes.
 */
export function temaDoMapa(): TemaMapa {
  return "escuro";
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
