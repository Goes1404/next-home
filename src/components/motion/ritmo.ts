/**
 * O ritmo das animações do site, lido da variável CSS `--ritmo-do-movimento`.
 *
 * 1 = o ritmo de sempre (a Next Home não declara a variável). Um site de
 * outro grupo pode pedir um movimento mais rápido (0,5 = metade do tempo):
 * a variável sai no `<style>` do layout do grupo (`src/app/s/[site]/layout.tsx`),
 * então quem anima com GSAP multiplica duração, atraso e cascata por ela.
 * Valor ausente, inválido ou fora de (0, 1] cai em 1.
 */
export function ritmoDoMovimento(): number {
  if (typeof window === "undefined") return 1;
  const bruto = getComputedStyle(document.documentElement).getPropertyValue("--ritmo-do-movimento").trim();
  const valor = Number.parseFloat(bruto);
  return Number.isFinite(valor) && valor > 0 && valor <= 1 ? valor : 1;
}
