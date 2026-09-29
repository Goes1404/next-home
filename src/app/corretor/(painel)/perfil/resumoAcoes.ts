"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";

/**
 * Hora do resumo do dia e se ele sai no fim de semana (0121). Grava só a
 * própria linha: a policy de update de `corretores` é do próprio corretor e
 * o grant cobre só estas duas colunas.
 */
export async function salvarPreferenciasDoResumo(p: {
  hora: number;
  fimDeSemana: boolean;
}): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const hora = Number(p.hora);
  if (!Number.isInteger(hora) || hora < 6 || hora > 11) return { erro: "Escolha uma hora entre 6h e 11h." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretores")
    .update({ resumo_hora: hora, resumo_fim_de_semana: p.fimDeSemana === true })
    .eq("id", corretor.id)
    .select("id");
  if (error || !data || data.length === 0) return { erro: "Não foi possível salvar agora." };
  revalidatePath("/corretor/perfil");
  return { ok: `Resumo às ${hora}h${p.fimDeSemana ? ", também no fim de semana" : ", só em dia útil"}.` };
}
