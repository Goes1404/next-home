import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Retenção do registro do central (spec 4.7; plano da onda 0, Task 11).
 *
 * O texto do comando fica 30 dias, para conferir erro e treinar o eval; a
 * linha (ferramenta, custo, latência, resultado) fica. As tentativas de
 * número desconhecido (só o hash do telefone) somem inteiras em 30 dias.
 *
 * Roda de carona na limpeza diária (`/api/cron/limpar-artes-ia`).
 */
export const DIAS_DO_REGISTRO_DO_CENTRAL = 30;

export async function limparRegistroDoCentral(agora: Date = new Date()): Promise<{ textos: number; tentativas: number }> {
  const supabase = createServiceClient();
  const corte = new Date(agora.getTime() - DIAS_DO_REGISTRO_DO_CENTRAL * 86_400_000).toISOString();
  const [textos, tentativas] = await Promise.all([
    supabase.from("central_comandos").update({ texto: null }).lt("created_at", corte).not("texto", "is", null).select("id"),
    supabase.from("central_tentativas").delete().lt("created_at", corte).select("id"),
  ]);
  if (textos.error) throw new Error(textos.error.message);
  if (tentativas.error) throw new Error(tentativas.error.message);
  return { textos: textos.data?.length ?? 0, tentativas: tentativas.data?.length ?? 0 };
}
