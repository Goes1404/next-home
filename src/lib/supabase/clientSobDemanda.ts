"use client";

/**
 * O cliente Supabase do NAVEGADOR, carregado só quando alguém o usa.
 *
 * `@supabase/supabase-js` com Realtime e Auth pesa ~245 KB decodificados, e
 * entrava no primeiro carregamento de cinco rotas do painel (Pessoas,
 * Conversas, Criar arte, Criar vídeo e Importar) por um `import` estático em
 * quatro arquivos — para abrir um canal de tempo real DEPOIS de a tela
 * estar na mão, ou para subir um arquivo quando o corretor escolhe um.
 * Nenhum desses momentos é a primeira pintura.
 *
 * Quem precisa do cliente chama esta função no efeito ou no handler. O
 * `import()` é resolvido uma vez pelo navegador e fica em cache; a segunda
 * chamada custa um microtask.
 *
 * Fora de `lib/supabase/`, ninguém importa `./client` direto — a guarda
 * `pesoDoPainel.test.ts` reprova a volta, porque a regressão é calada: um
 * `import` estático a mais e a rota engorda 245 KB sem teste, tipo ou build
 * reclamar.
 */
export async function createClientSobDemanda() {
  const { createClient } = await import("./client");
  return createClient();
}
