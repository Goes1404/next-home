import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Cliente sem sessão/cookies, para leituras públicas (RLS já restringe a
 * `publicado = true`, então não há usuário a autenticar aqui).
 *
 * Usado em `queries.ts` porque essas consultas rodam tanto em build-time
 * (`generateStaticParams`, páginas SSG) quanto em request-time — e
 * `next/headers`'s `cookies()`, que o cliente de `server.ts` exige, só
 * existe dentro de uma requisição. Reservar o cliente com cookies para
 * contextos que realmente precisam de sessão (o painel /admin da Fase 9).
 */
export function createClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey());
}
