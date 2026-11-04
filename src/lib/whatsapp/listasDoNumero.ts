import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type StatusDaLista = Database["public"]["Tables"]["whatsapp_campanhas"]["Row"]["status"];

/**
 * As listas que saem pelo número PESSOAL do corretor (Evolution).
 *
 * Desde a 0256 uma lista pode sair pelo número OFICIAL da imobiliária
 * (`canal = 'oficial'`), com disparador próprio (`oficial/disparoOficial.ts`).
 * Tudo o que fala do número do corretor tem de ignorá-la:
 *   - o disparador da Evolution: por ele, a lista oficial sairia do número
 *     pessoal, exatamente o que ela existe para evitar;
 *   - o aviso de queda, a saúde do número e o status da fila: "o seu número
 *     caiu e há 2.000 mensagens esperando" seria falso — elas não esperam por
 *     ele;
 *   - o "limpar fila" do corretor, que apagaria a lista da imobiliária.
 *
 * Por isso a regra mora AQUI, uma vez, e não em cada consulta.
 *
 * Antes da 0256 aplicada a coluna `canal` não existe (42703): toda lista é do
 * corretor, e a leitura volta a ser a de sempre. Erro de outro tipo devolve
 * null; quem chama decide (todos tratam como "nenhuma lista", como antes).
 */
export async function listasDoNumeroDoCorretor(
  supabase: SupabaseClient<Database>,
  corretorId: string,
  filtro: { grupoId?: string; status?: StatusDaLista; semRascunho?: boolean } = {},
): Promise<{ id: string; status: StatusDaLista }[] | null> {
  const ler = (semOficial: boolean) => {
    let consulta = supabase.from("whatsapp_campanhas").select("id, status").eq("corretor_id", corretorId);
    if (filtro.grupoId) consulta = consulta.eq("grupo_id", filtro.grupoId);
    if (filtro.status) consulta = consulta.eq("status", filtro.status);
    if (filtro.semRascunho) consulta = consulta.neq("status", "rascunho");
    // `neq` e não `eq("evolution")`: a coluna é not null com default
    // 'evolution', então dá no mesmo no banco, e o que se quer garantir é uma
    // coisa só: lista oficial nunca entra no que é do número do corretor.
    return semOficial ? consulta.neq("canal", "oficial") : consulta;
  };

  const comCanal = await ler(true);
  if (!comCanal.error) return comCanal.data ?? [];
  if (comCanal.error.code !== "42703") {
    console.warn("[campanha] listas do número do corretor não lidas:", comCanal.error.message);
    return null;
  }
  const antesDa0256 = await ler(false);
  if (antesDa0256.error) {
    console.warn("[campanha] listas do número do corretor não lidas:", antesDa0256.error.message);
    return null;
  }
  return antesDa0256.data ?? [];
}
