/**
 * `next/font/google` só existe dentro do build do Next. Nos testes, cada fonte
 * vira uma função que devolve o mesmo formato (`className`, `variable`,
 * `style`), com o nome da fonte na classe para quem quiser conferir.
 * Ligado em `vitest.config.ts` (29/10/2026, fontes da Astro em `fontesDaAstro.ts`).
 */
type Opcoes = { variable?: string };
const fonte = (nome: string) => (opcoes: Opcoes = {}) => ({
  className: `fonte-${nome}`,
  variable: opcoes.variable ? `var-${opcoes.variable.replace(/^--/, "")}` : "",
  style: { fontFamily: nome },
});

const modulo = new Proxy({} as Record<string, ReturnType<typeof fonte>>, {
  get: (_alvo, nome) => (typeof nome === "string" ? fonte(nome) : undefined),
});

export const Bricolage_Grotesque = modulo.Bricolage_Grotesque;
export const Figtree = modulo.Figtree;
export const Inter = modulo.Inter;
export const Fraunces = modulo.Fraunces;
export const IBM_Plex_Mono = modulo.IBM_Plex_Mono;
export default modulo;
