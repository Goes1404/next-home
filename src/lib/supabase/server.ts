import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Cliente Supabase para Server Components / Route Handlers.
 *
 * `setAll` pode falhar em Server Components puros (não podem escrever
 * cookies) — é seguro ignorar ali, porque a sessão só precisa ser
 * atualizada em Server Actions e Route Handlers, que já rodam com resposta
 * mutável.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaSetar) {
        try {
          cookiesParaSetar.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Chamado de um Server Component sem permissão de escrita — ok.
        }
      },
    },
  });
}
