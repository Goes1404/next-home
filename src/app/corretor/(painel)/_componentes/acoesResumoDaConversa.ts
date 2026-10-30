"use server";

import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { contarUsoDaIaDeHoje, lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { atualizarResumoDaConversa, type EstadoDoResumo } from "@/lib/crm/resumoDaConversaServidor";

/**
 * O cartão "Resumo da conversa" pede o resumo por aqui (30/10/2026): sozinho,
 * quando abre com mensagem nova desde o último resumo, e pelo botão
 * "Atualizar". A regra de quando chamar a IA mora em `decidirResumo`; aqui só
 * a sessão, o uso do dia e a cota do grupo, que vêm da chave de serviço
 * filtrada pelo grupo da sessão.
 */
export async function pedirResumoDaConversa(
  leadId: string,
  forcar: boolean,
): Promise<EstadoDoResumo | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sua sessão expirou. Entre de novo." };
  if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(leadId)) return { erro: "Lead inválido." };

  const [resumosHoje, cota, suspenso] = await Promise.all([
    contarUsoDaIaDeHoje(corretor.grupoId, "resumo_conversa"),
    lerCotaDaIa(corretor.grupoId),
    grupoSuspenso(corretor.grupoId),
  ]);
  const supabase = await createClient();
  const estado = await atualizarResumoDaConversa(supabase, {
    leadId,
    corretorId: corretor.id,
    grupoId: corretor.grupoId,
    ramo: corretor.ramo,
    ramoDescricao: corretor.ramoDescricao,
    forcar: Boolean(forcar),
    resumosHoje,
    semCota: cota.nivel === "esgotada" || suspenso,
  });
  return estado ?? { erro: "Não foi possível ler este lead." };
}
