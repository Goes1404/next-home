/**
 * A régua do parallax, separada do DOM de propósito.
 *
 * O controlador (`controladorCamadas.ts`) só lê retângulos e escreve
 * transform; toda a decisão de QUANTO mover mora aqui, onde dá para testar
 * sem navegador. Mesmo desenho de `transicaoGlobo.ts`.
 */

export type EixoCamada = "x" | "y";

export type Ambiente = {
  desktop: boolean;
  /** `prefers-reduced-motion: reduce` ou a classe `.motion-off` no <html>. */
  reduzido: boolean;
};

/**
 * No celular a intensidade cai a 40%: lá o gesto de rolagem é do dedo, e
 * movimento forte sob o polegar parece software travando, não profundidade.
 */
export const FATOR_MOBILE = 0.4;

/**
 * Onde o elemento está na passagem pela tela, de -1 a 1.
 *
 * -1 = encostando na borda de baixo (acabou de entrar);
 *  0 = centro do elemento no centro da janela;
 *  1 = saindo pela borda de cima.
 *
 * O zero no centro é o que faz a camada nascer no lugar certo: se o
 * progresso começasse em 0 na entrada, toda foto apareceria já deslocada.
 */
export function progressoNaViewport(
  inicio: number,
  tamanho: number,
  janela: number,
): number {
  const faixa = (janela + tamanho) / 2;
  if (faixa <= 0) return 0;

  const centroDoElemento = inicio + tamanho / 2;
  const bruto = (janela / 2 - centroDoElemento) / faixa;

  return Math.max(-1, Math.min(1, bruto));
}

/**
 * Quanto o elemento anda, em pixels. `referencia` é o próprio tamanho dele
 * no eixo — assim a mesma velocidade rende o mesmo efeito visual numa foto
 * de 300px e numa de 900px.
 */
export function deslocamentoDe(
  progresso: number,
  velocidade: number,
  referencia: number,
): number {
  return progresso * velocidade * referencia;
}

/** Multiplicador global de intensidade, decidido em UM lugar só. */
export function fatorDoAmbiente({ desktop, reduzido }: Ambiente): number {
  if (reduzido) return 0;
  return desktop ? 1 : FATOR_MOBILE;
}
