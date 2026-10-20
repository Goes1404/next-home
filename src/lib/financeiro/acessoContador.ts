import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * O link do contador (0168) lido pela página pública. O token É a
 * credencial; a leitura vai pela chave de serviço porque o `anon` não toca
 * na tabela. Link revogado, vencido ou de formato errado devolve null, e a
 * página responde "não encontrado" sem dizer qual dos três.
 */

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `grupoId`: o grupo do link (0192). A leitura é pela chave de serviço, que
 * ignora a RLS, e cada grupo fecha os próprios meses: quem lê os meses
 * filtra por ele, senão o contador de um grupo baixaria os de outro.
 */
export type AcessoValido = { token: string; nome: string; grupoId: string };

export function tokenComFormatoValido(token: string): boolean {
  return TOKEN.test(token);
}

export async function lerAcessoContador(token: string): Promise<AcessoValido | null> {
  if (!tokenComFormatoValido(token)) return null;
  const { data, error } = await createServiceClient()
    .from("acessos_contador")
    .select("token, nome, expira_em, revogado_em, grupo_id")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revogado_em || data.expira_em <= new Date().toISOString()) return null;
  return { token: data.token, nome: data.nome, grupoId: data.grupo_id };
}

export async function registrarAcessoDoContador(token: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("acessos_contador")
    .update({ ultimo_acesso_em: new Date().toISOString() })
    .eq("token", token);
  if (error) console.error("[contador] falha ao registrar acesso:", error.message);
}
