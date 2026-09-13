/**
 * Nome do cookie de atribuição do link pessoal do corretor (`?corretor=<slug>`).
 *
 * Módulo de UMA constante, sem dependência, porque tem dois leitores em
 * runtimes diferentes: o `proxy.ts` (que grava o cookie e roda em toda
 * requisição de página) e `corretorAtivo.ts` (que o lê no servidor e, desde
 * a F2 do roadmap de performance, puxa o cache de dados e o `server-only`).
 * Importar a constante de lá arrastaria tudo isso para o bundle do proxy.
 */
export const COOKIE_CORRETOR_ATIVO = "corretor_ativo";
