"use server";

import { revalidatePath } from "next/cache";
import { validarTexto } from "@/lib/central/comunicadoRegras";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { destinatariosDoGrupo } from "@/lib/plataforma/comunicados";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Comunicado da Astro no privado dos corretores, pelo número central
 * (0260): criar (a fila nasce com quem a prévia mostrou), pausar e retomar.
 * Quem manda é o tique dos follow-ups, uma mensagem a cada 5 min no horário
 * comercial, até 10 por dia (`comunicadoRegras.ts`).
 */

export type ResultadoDoComunicado = { ok: true; mensagem: string } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

export async function criarComunicado(
  _estadoAnterior: ResultadoDoComunicado | undefined,
  formData: FormData,
): Promise<ResultadoDoComunicado> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const grupoId = String(formData.get("grupo") ?? "");
  if (!ehUuid(grupoId)) return { ok: false, erro: "Escolha a imobiliária." };
  if (formData.get("confirmo") !== "sim") return { ok: false, erro: "Confirme que revisou a mensagem e a lista." };
  const validado = validarTexto(formData.get("texto"));
  if (!validado.ok) return validado;

  const pessoas = await destinatariosDoGrupo(guarda, grupoId);
  if (pessoas.length === 0) return { ok: false, erro: "Nenhum corretor ativo com WhatsApp nesta imobiliária." };

  const servico = createServiceClient();
  const { data: comunicado, error } = await servico
    .from("comunicados")
    .insert({ grupo_id: grupoId, texto: validado.texto, criado_por: guarda.userId })
    .select("id")
    .single();
  if (error || !comunicado) {
    console.error(`[plataforma] comunicado não criado: ${error?.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const { error: erroDaFila } = await servico.from("comunicado_envios").insert(
    pessoas.map((p, ordem) => ({ comunicado_id: comunicado.id, corretor_id: p.id, nome: p.nome, telefone: p.whatsapp, ordem })),
  );
  if (erroDaFila) {
    // Sem fila, o comunicado não pode ficar "enviando" vazio: apaga.
    await servico.from("comunicados").delete().eq("id", comunicado.id);
    console.error(`[plataforma] fila do comunicado não criada: ${erroDaFila.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  console.info(`[plataforma] comunicado ${comunicado.id} criado por ${guarda.userId}: ${pessoas.length} corretores`);
  revalidatePath("/plataforma/comunicados");
  return { ok: true, mensagem: `Comunicado na fila: ${pessoas.length} corretores. Sai um a cada 5 min, no horário comercial, até 10 por dia.` };
}

export async function mudarSituacaoDoComunicado(id: string, situacao: "pausado" | "enviando"): Promise<ResultadoDoComunicado> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(id)) return { ok: false, erro: "Comunicado não encontrado." };

  const { data, error } = await createServiceClient()
    .from("comunicados")
    .update({ situacao })
    .eq("id", id)
    .in("situacao", situacao === "pausado" ? ["enviando"] : ["pausado"])
    .select("id");
  if (error) return { ok: false, erro: ERRO_GENERICO };
  if (!data || data.length === 0) return { ok: false, erro: "Este comunicado já mudou de situação." };
  console.info(`[plataforma] comunicado ${id} ${situacao} por ${guarda.userId}`);
  revalidatePath("/plataforma/comunicados");
  return { ok: true, mensagem: situacao === "pausado" ? "Comunicado pausado." : "Comunicado retomado." };
}
