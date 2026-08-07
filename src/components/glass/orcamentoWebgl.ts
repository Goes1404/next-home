/**
 * Navegadores mantêm poucos contextos WebGL vivos ao mesmo tempo (por volta de
 * 8 a 16); ao estourar, os mais antigos são perdidos e o painel some. Como uma
 * página pode ter muitos cards de vidro, limitamos quantos usam WebGL de fato —
 * os demais caem no fallback em CSS, que é visualmente próximo.
 */

const LIMITE = 5;
let emUso = 0;

export function reservarContexto(): boolean {
  if (emUso >= LIMITE) return false;
  emUso += 1;
  return true;
}

export function liberarContexto(): void {
  emUso = Math.max(0, emUso - 1);
}
