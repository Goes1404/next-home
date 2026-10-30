import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { VERSAO_DO_TERMO_DE_ADESAO } from "./termoDeAdesao";

/**
 * O aceite do termo de adesão (0247, 29/10/2026): a leitura do layout e o
 * que a action grava junto (hash do IP e navegador).
 */

type ClienteDeLeitura = Pick<SupabaseClient<Database>, "from">;

/**
 * A CONTA já aceitou a versão vigente? Lê pela SESSÃO do gestor (a policy
 * da 0247 mostra os aceites do grupo dele ao gestor). Erro de leitura NÃO
 * tranca o painel, como o aceite dos termos de uso (0198): a migration pode
 * chegar depois do deploy, e um painel fora do ar por uma tabela de aceite é
 * pior que um aceite pedido uma visita mais tarde. O erro vai para o log.
 */
export async function contaAceitouTermoDeAdesao(cliente: ClienteDeLeitura, grupoId: string): Promise<boolean> {
  const { data, error } = await cliente
    .from("aceites_do_termo_de_adesao")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("versao", VERSAO_DO_TERMO_DE_ADESAO)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[termo de adesão] não consegui ler o aceite; o painel segue aberto:", error.message);
    return true;
  }
  return data !== null && data !== undefined;
}

/**
 * O IP de quem aceitou, resumido: HMAC-SHA256 com um segredo do servidor
 * (`SEGREDO_DO_ACEITE`, ou a chave de serviço, como a medição do link).
 * Prova que o aceite veio de um IP que se conheça depois (recalcula-se o
 * HMAC com o mesmo segredo) sem guardar o IP. Sem segredo ou sem IP: `null`
 * (um hash sem segredo de um IPv4 se desfaz por força bruta, e não vale
 * guardar).
 */
export function hashDoIp(ip: string | null | undefined, segredo: string | null | undefined): string | null {
  const limpo = (ip ?? "").trim();
  if (!limpo || !segredo) return null;
  return createHmac("sha256", segredo).update(`termo-de-adesao:${limpo}`).digest("hex");
}

export function segredoDoAceite(env: Record<string, string | undefined> = process.env): string | null {
  return env.SEGREDO_DO_ACEITE || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE || null;
}

/** O navegador, cortado no limite do CHECK (500). */
export function navegadorDoAceite(userAgent: string | null | undefined): string | null {
  const limpo = (userAgent ?? "").trim();
  return limpo ? limpo.slice(0, 500) : null;
}
