"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import type { DecisaoCandidato } from "@/lib/imoveis/filaDeCandidatos";

/**
 * Decidir sobre um candidato.
 *
 * A action só escreve `decisao`, `motivo` e `decidido_em` — e isso não é
 * disciplina: o grant da 0080 recorta as colunas editáveis por
 * `authenticated`, então nome, link e `ref_externa` são recusados pelo
 * banco. A action é a porta; o grant é a fechadura.
 *
 * Não é restrita ao gestor. Decidir o que a imobiliária representa é
 * trabalho de quem vende, e a fila existe para ser esvaziada — pedir gestor
 * para cada linha é a forma mais rápida de ela não andar.
 */
export async function decidirCandidato(
  id: string,
  decisao: DecisaoCandidato,
  motivo?: string,
): Promise<{ erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("catalogo_candidatos")
    .update({
      decisao,
      /*
       * Voltar para `pendente` LIMPA o motivo. Motivo velho pendurado num
       * candidato que voltou à fila descreveria uma decisão que não existe
       * mais — e o motivo é justamente o que alguém vai ler daqui a três
       * meses para entender por que este imóvel não foi cadastrado.
       */
      motivo: decisao === "pendente" ? null : (motivo?.trim() || null),
      decidido_em: decisao === "pendente" ? null : new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[candidatos] falha ao decidir:", error.message);
    return { erro: "Não foi possível gravar a decisão. Tente de novo." };
  }

  revalidatePath("/corretor/imoveis/candidatos");
  revalidatePath("/corretor/imoveis");
  return {};
}
