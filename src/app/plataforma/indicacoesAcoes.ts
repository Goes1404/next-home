"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O crédito do indique e ganhe aplicado (0247, 29/10/2026).
 *
 * O crédito NÃO mexe na cobrança sozinho: a Astro dá o desconto (no Asaas ou
 * no valor da próxima mensalidade) e marca aqui. Só marca uma vez: o
 * `aplicado_em is null` no filtro faz o segundo clique não regravar quem e
 * quando. A guarda vem antes da chave (regra de `acoes.ts`), e o crédito tem
 * de ser do grupo da tela. O rastro vai também para `admin_eventos` do grupo
 * beneficiado (`credito_de_indicacao_aplicado`, CHECK da 0247).
 */

export type ResultadoDoCredito = { ok: true } | { ok: false; erro: string };

export async function marcarCreditoAplicado(grupoId: string, creditoId: string): Promise<ResultadoDoCredito> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId) || !ehUuid(creditoId)) return { ok: false, erro: "Crédito não encontrado." };

  const servico = createServiceClient();
  const agora = new Date().toISOString();
  const { data, error } = await servico
    .from("creditos_de_indicacao")
    .update({ aplicado_em: agora, aplicado_por: guarda.userId })
    .eq("id", creditoId)
    .eq("grupo_beneficiado_id", grupoId)
    .is("aplicado_em", null)
    .select("id, descricao");
  if (error) {
    console.error(`[plataforma] crédito ${creditoId} não marcado: ${error.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Crédito não encontrado ou já aplicado." };

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "credito_de_indicacao_aplicado",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", credito_id: creditoId, descricao: data[0].descricao },
  });
  if (erroDoEvento) console.error(`[plataforma] evento do crédito ${creditoId} não gravado: ${erroDoEvento.message}`);

  revalidatePath(`/plataforma/grupos/${grupoId}`);
  revalidatePath("/plataforma/indicacoes");
  return { ok: true };
}
