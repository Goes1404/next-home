"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehStatusDoChamado } from "@/lib/plataforma/chamadoDeSuporte";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O andamento de um chamado de suporte ou contato do site (0240,
 * 29/10/2026): status e a anotação interna da equipe da Astro (quem
 * respondeu, o que combinou). A anotação nunca volta para quem abriu.
 *
 * A guarda da plataforma vem antes de tudo; a chave só depois (mesma regra
 * de `pedidosAcoes.ts`).
 */

export type ResultadoDoChamadoNaPlataforma = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

export async function atualizarChamado(
  _estadoAnterior: ResultadoDoChamadoNaPlataforma | undefined,
  formData: FormData,
): Promise<ResultadoDoChamadoNaPlataforma> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const resposta = String(formData.get("resposta_interna") ?? "").trim();

  if (!ehUuid(id)) return { ok: false, erro: "Chamado não encontrado." };
  if (!ehStatusDoChamado(status)) return { ok: false, erro: "Escolha um status válido." };
  if (resposta.length > 2000) return { ok: false, erro: "A anotação passa de 2.000 caracteres." };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("chamados_de_suporte")
    .update({ status, resposta_interna: resposta || null, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error(`[plataforma] chamado ${id} não atualizado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Chamado não encontrado." };

  console.info(`[plataforma] chamado ${id} → ${status} por ${guarda.userId}`);
  revalidatePath("/plataforma/suporte");
  revalidatePath("/plataforma");
  return { ok: true };
}
