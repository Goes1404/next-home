import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { mesmoTelefone } from "./telefone";

/**
 * O número central da plataforma (0249), lido de `central_da_plataforma`.
 *
 * Toda mensagem que chega a QUALQUER instância passa por aqui, então a
 * leitura fica em memória por 60 s. Sem central cadastrado, devolve `null`
 * e nada muda no fluxo dos corretores.
 */
export type CentralDaPlataforma = { instanceName: string; telefone: string; statusConexao: string };

const VALIDADE_MS = 60_000;
let guardado: { valor: CentralDaPlataforma | null; ate: number } | null = null;

export async function lerCentral(agora: number = Date.now()): Promise<CentralDaPlataforma | null> {
  if (guardado && guardado.ate > agora) return guardado.valor;
  const { data, error } = await createServiceClient()
    .from("central_da_plataforma")
    .select("instance_name, telefone, status_conexao")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Erro de leitura não vira "sem central" guardado por 60 s: tenta de novo
  // na próxima mensagem.
  if (error) return guardado?.valor ?? null;
  const valor = data ? { instanceName: data.instance_name, telefone: data.telefone, statusConexao: data.status_conexao } : null;
  guardado = { valor, ate: agora + VALIDADE_MS };
  return valor;
}

/** Para os testes e para a tela que acabou de conectar o central. */
export function esquecerCentral(): void {
  guardado = null;
}

/** A mensagem veio de (ou foi para) o número central? */
export async function ehNumeroDoCentral(telefone: string | null | undefined): Promise<boolean> {
  if (!telefone) return false;
  const central = await lerCentral();
  return central ? mesmoTelefone(central.telefone, telefone) : false;
}

/** Esta instância é a do central? */
export async function ehInstanciaDoCentral(instanceName: string | null | undefined): Promise<boolean> {
  if (!instanceName) return false;
  const central = await lerCentral();
  return central?.instanceName === instanceName;
}
