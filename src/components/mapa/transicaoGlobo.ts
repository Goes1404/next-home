/**
 * A curva do mergulho: do globo girando até o mapa da região.
 *
 * Antes, tocar no globo TROCAVA um componente pelo outro no mesmo quadro —
 * o mundo sumia e um mapa de Alphaville aparecia do nada. Funciona, mas
 * joga fora a única coisa que o globo tinha a dizer: onde, no mundo, fica
 * essa região. A transição existe para contar isso em um gesto — a câmera
 * cai sobre o continente até a rua.
 *
 * Isto aqui é só a MATEMÁTICA do movimento, separada do WebGL e do Leaflet
 * de propósito: é a parte que decide o que o olho vê, e a única que dá para
 * testar sem um contexto gráfico.
 *
 * Três coisas acontecem ao mesmo tempo, e a ordem entre elas é o efeito:
 *
 * 1. o globo ACELERA para cima do observador (escala com ease-in — câmera
 *    caindo ganha velocidade, não perde);
 * 2. ele se ilumina e perde a sombra de esfera — de planeta a chão;
 * 3. o mapa entra ANTES de o globo terminar de sair. Sem essa sobreposição
 *    existe um quadro de fundo vazio entre os dois, e é exatamente o que
 *    faz uma transição parecer um corte.
 */

/** Quanto dura o mergulho, em milissegundos. */
export const DURACAO_MERGULHO_MS = 1500;

/**
 * O primeiro trecho é só para ACOMODAR a câmera: se o visitante girou o
 * globo, ela volta ao foco antes de cair. Mergulhar a partir de um ângulo
 * qualquer levaria a câmera para o meio do Atlântico.
 */
export const FATIA_ACOMODAR = 0.22;

/** Em que ponto o mapa começa a aparecer por baixo. */
const ENTRADA_DO_MAPA = 0.55;

/** Onde o globo começa a se apagar — depois do mapa já ter começado. */
const SAIDA_DO_GLOBO = 0.62;

const limitar = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** Fatia normalizada de `t` entre dois marcos. */
function trecho(t: number, inicio: number, fim: number): number {
  return limitar((t - inicio) / (fim - inicio));
}

/** Acelerando: é assim que cai quem está caindo. */
const aceleraSuave = (t: number) => t * t * t;

/** Desacelerando: para o que chega e assenta. */
const freiaSuave = (t: number) => 1 - Math.pow(1 - t, 3);

export type EstadoDaTransicao = {
  /**
   * Quanto do arrasto do visitante ainda vale (1 = tudo, 0 = câmera de volta
   * ao foco). Só cai durante a acomodação.
   */
  pesoDoArrasto: number;
  /** `scale` do cobe: a esfera crescendo dentro do canvas. */
  escalaGlobo: number;
  /**
   * Escala CSS por cima. O canvas tem tamanho fixo em pixels, então o
   * `scale` do WebGL sozinho esbarra na borda dele; a escala de CSS
   * continua o movimento para fora da moldura. O leve borrão do upscale
   * ajuda — parece velocidade, não defeito.
   */
  escalaCss: number;
  opacidadeGlobo: number;
  /** Halo, órbitas e poeira: some cedo, senão viram sujeira na frente do mapa. */
  opacidadeAtmosfera: number;
  /** Desfoque do globo, em px. */
  desfoque: number;
  /** Brilho do mapa do cobe: a superfície se acende conforme aproxima. */
  brilhoDoMapa: number;
  /** Difusa: cai para a esfera perder o sombreado e virar plano. */
  difusa: number;
  opacidadeMapa: number;
};

/**
 * O estado visual num instante `t` (0 a 1) do mergulho.
 *
 * Puro e sem relógio: quem chama passa o progresso. Isso é o que permite
 * testar a coreografia inteira sem WebGL.
 */
export function estadoDaTransicao(t: number): EstadoDaTransicao {
  const p = limitar(t);

  const acomodou = trecho(p, 0, FATIA_ACOMODAR);
  const mergulho = aceleraSuave(trecho(p, FATIA_ACOMODAR, 1));
  const saida = trecho(p, SAIDA_DO_GLOBO, 1);
  const entrada = freiaSuave(trecho(p, ENTRADA_DO_MAPA, 0.95));

  return {
    pesoDoArrasto: 1 - freiaSuave(acomodou),
    escalaGlobo: 1 + mergulho * 3.6,
    escalaCss: 1 + mergulho * 0.75,
    opacidadeGlobo: 1 - freiaSuave(saida),
    // A atmosfera sai no dobro da velocidade do globo: ela é cenário de
    // fundo estrelado, e cenário estrelado sobre um mapa de rua é lixo.
    opacidadeAtmosfera: 1 - limitar(p / SAIDA_DO_GLOBO),
    desfoque: mergulho * 4,
    brilhoDoMapa: 14 + mergulho * 8,
    difusa: 1.6 - mergulho * 0.9,
    opacidadeMapa: entrada,
  };
}
