import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseUrl } from "./env";

/**
 * Cliente com a chave de serviço — ignora RLS.
 *
 * Existe para um caso só: webhooks. Uma mensagem que chega do provedor de
 * WhatsApp não tem sessão de usuário, e as policies da 0018 são todas
 * `to authenticated` — com o cliente publicável, todo insert voltaria
 * "0 linhas afetadas" sem erro, que é o pior tipo de falha silenciosa.
 *
 * `server-only` no topo é o que garante que esta chave nunca entre num
 * bundle de cliente: um import acidental a partir de um Client Component
 * quebra o build, não a produção.
 *
 * Diferente de `env.ts`, aqui NÃO existe fallback embutido: a chave de
 * serviço dá acesso irrestrito ao banco e não pode morar no código.
 */
export function createServiceClient() {
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!chave) {
    throw new Error(
      "SUPABASE_SECRET_KEY não configurada — o webhook do WhatsApp não consegue gravar sem ela.",
    );
  }

  return createSupabaseClient<Database>(supabaseUrl(), chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
