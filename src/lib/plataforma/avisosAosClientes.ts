import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * Os avisos da Astro para os clientes (0242, 29/10/2026), para a área da
 * plataforma: a lista de `/plataforma/avisos` (no ar, agendados e
 * encerrados). A tabela é global e só a chave de serviço a lê; a função pede
 * a PROVA da guarda da plataforma no parâmetro, como `chamados.ts`.
 */

export type LinhaDoAviso = Database["public"]["Tables"]["avisos_aos_clientes"]["Row"];

/** Teto da lista: os encerrados mais antigos não precisam aparecer. */
const LIMITE_DA_LISTA = 100;

export async function listarAvisosAosClientes(_prova: { userId: string }): Promise<LinhaDoAviso[]> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("avisos_aos_clientes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(LIMITE_DA_LISTA);
  if (error) throw new Error(`Falha ao ler os avisos aos clientes: ${error.message}`);
  return data ?? [];
}
