import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { VERSAO_DOS_TERMOS } from "./termos";

/**
 * O corretor já aceitou a versão vigente dos termos? (0198)
 *
 * Lê pela sessão (a RLS mostra só o próprio aceite). Erro de leitura NÃO
 * tranca o painel: a migration pode chegar depois do deploy, e um painel
 * inteiro fora do ar por uma tabela de aceite é pior que um aceite pedido
 * uma visita mais tarde. O erro vai para o log.
 */
type ClienteDeLeitura = Pick<SupabaseClient<Database>, "from">;

export async function aceitouTermosVigentes(cliente: ClienteDeLeitura, corretorId: string): Promise<boolean> {
  const { data, error } = await cliente
    .from("aceites_de_termos")
    .select("id")
    .eq("corretor_id", corretorId)
    .eq("versao", VERSAO_DOS_TERMOS)
    .maybeSingle();
  if (error) {
    console.error("[termos] não consegui ler o aceite; o painel segue aberto:", error.message);
    return true;
  }
  return data !== null && data !== undefined;
}
