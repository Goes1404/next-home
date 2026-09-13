/**
 * Tiles do mapa acompanhando o tema do site.
 *
 * A mesma lógica do CSS, lida do lado do JS: `data-tema` no `<html>` quando
 * o visitante escolheu tema (carimbado pelo servidor, ver layout raiz), e a
 * preferência do sistema quando não escolheu. O observer cobre a troca de
 * tema sem recarregar a página — o mapa reage na hora, como o resto da UI.
 */

export type TemaMapa = "claro" | "escuro";

/**
 * Tiles do OpenStreetMap, sem chave, nos dois temas (12/09/2026).
 *
 * A CARTO passou a exigir API key nos basemaps gratuitos: em produção os
 * tiles vinham carimbados com "API KEY REQUIRED" em diagonal, sobre o mapa
 * inteiro. O tile padrão do OSM não pede chave, é claro (que é o que o
 * site pede desde que o tema padrão virou claro) e tem a mesma projeção —
 * nada mais muda nos componentes.
 *
 * Sem `{s}` nem `{r}`: o OSM não tem subdomínios nem versão @2x. E a
 * política de uso do OSM exige atribuição visível — está ligada em todo
 * mapa e não deve ser desligada.
 */
const TILE_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILES_MAPA: Record<TemaMapa, string> = {
  escuro: TILE_OSM,
  claro: TILE_OSM,
};

/** Exigência de licença dos dados e dos tiles (OSM). */
export const ATRIBUICAO_MAPA =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * O mapa é CLARO nos dois temas, desde 12/09/2026 (pedido do usuário: com
 * o tema padrão claro, o mapa escuro virava um buraco preto na página).
 *
 * Entre 10/09 e 12/09 ele foi escuro nos dois temas, pela lição do globo
 * ("o que dá destaque a um artefato geográfico é o contraste com a
 * página"). O que segura o destaque agora é a MOLDURA (borda + sombra do
 * contêiner) e os pinos em teal sobre o tile claro, não o fundo do tile.
 *
 * A função continua existindo — e o observador de troca de tema também —
 * porque o lugar de decidir isso é aqui, e não espalhado por três
 * componentes.
 */
export function temaDoMapa(): TemaMapa {
  return "claro";
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
