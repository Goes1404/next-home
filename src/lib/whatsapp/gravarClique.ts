import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type LinhaDoClique = Database["public"]["Tables"]["cliques_whatsapp"]["Insert"];

/**
 * Grava o clique do porteiro (`/wa` e `/wa/<imóvel>`), pela chave de serviço
 * que a rota já abriu.
 *
 * `do_link_pessoal` nasceu na 0200. Até ela ser aplicada, o insert com a
 * coluna nova seria recusado inteiro, e o clique pago sumiria sem log: o
 * clique é o denominador da medição do anúncio. Recusa que cita a coluna
 * nova repete o insert sem ela; qualquer outra recusa vira log.
 */
export async function gravarClique(supabase: SupabaseClient<Database>, linha: LinhaDoClique): Promise<void> {
  const { error } = await supabase.from("cliques_whatsapp").insert(linha);
  if (!error) return;

  if ("do_link_pessoal" in linha && /do_link_pessoal/.test(error.message)) {
    const semAColunaNova = { ...linha };
    delete semAColunaNova.do_link_pessoal;
    const { error: deNovo } = await supabase.from("cliques_whatsapp").insert(semAColunaNova);
    if (deNovo) console.error("[porteiro] clique não gravado:", deNovo.message);
    return;
  }
  console.error("[porteiro] clique não gravado:", error.message);
}
