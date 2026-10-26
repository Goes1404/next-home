import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { BUCKET_DO_AUDIO, SEGUNDOS_DO_LINK_DO_AUDIO, caminhosDeAudioValidos } from "./audioGuardado";

/**
 * O que a ficha e as exclusões fazem com o áudio do relato no Storage.
 *
 * Tudo com a chave de serviço (o bucket é privado e `retornos_de_ligacao` não
 * tem policy para o navegador), então quem chama é quem decide se a sessão
 * pode ver ou apagar aquele lead — aqui só se confere o grupo.
 *
 * Nada aqui lança: o áudio é acessório da ficha e da exclusão. Falhou, vira
 * log e um valor vazio ou `false`, nunca uma ficha que não abre nem um lead
 * que não sai.
 */

type Servico = ReturnType<typeof createServiceClient>;

/** O link do player, por caminho. Só entram caminhos da pasta do grupo do lead. */
export async function assinarAudiosDaFicha(
  servico: Servico,
  grupoId: string,
  caminhos: readonly unknown[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const validos = caminhosDeAudioValidos(caminhos, grupoId);
  if (validos.length === 0) return urls;
  try {
    const { data, error } = await servico.storage.from(BUCKET_DO_AUDIO).createSignedUrls(validos, SEGUNDOS_DO_LINK_DO_AUDIO);
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    }
  } catch (e) {
    console.error("[retorno] links do áudio não gerados:", e instanceof Error ? e.message : e);
  }
  return urls;
}

/**
 * Os caminhos dos áudios guardados dos leads que vão ser excluídos. Tem de ser
 * lido ANTES da exclusão: sem o lead, o `cascade` leva as linhas junto e os
 * arquivos ficariam no bucket sem ninguém que aponte para eles.
 */
export async function caminhosDeAudioDosLeads(
  servico: Servico,
  leads: ReadonlyArray<{ id: string; grupo_id: string }>,
): Promise<string[]> {
  return [...new Set([...(await caminhosDeAudioPorLead(servico, leads)).values()].flat())];
}

/** O mesmo, separado por lead: a exclusão em lote só apaga o áudio de quem o banco de fato excluiu. */
export async function caminhosDeAudioPorLead(
  servico: Servico,
  leads: ReadonlyArray<{ id: string; grupo_id: string }>,
): Promise<Map<string, string[]>> {
  const saida = new Map<string, string[]>();
  if (leads.length === 0) return saida;
  try {
    const porGrupo = new Map<string, string[]>();
    for (const lead of leads) porGrupo.set(lead.grupo_id, [...(porGrupo.get(lead.grupo_id) ?? []), lead.id]);
    for (const [grupoId, ids] of porGrupo) {
      const { data, error } = await servico
        .from("retornos_de_ligacao")
        .select("lead_id, audio_path")
        .eq("grupo_id", grupoId)
        .in("lead_id", ids)
        .not("audio_path", "is", null);
      if (error) throw new Error(error.message);
      for (const linha of data ?? []) {
        if (!linha.lead_id) continue;
        const [valido] = caminhosDeAudioValidos([linha.audio_path], grupoId);
        if (valido) saida.set(linha.lead_id, [...(saida.get(linha.lead_id) ?? []), valido]);
      }
    }
  } catch (e) {
    console.error("[retorno] áudios do lead não localizados:", e instanceof Error ? e.message : e);
  }
  return saida;
}

/** Escapa o que o LIKE trata como curinga. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (m) => "\\" + m);

/**
 * Os caminhos dos áudios da PESSOA do pedido do titular: o lead e as outras
 * fichas do grupo com o mesmo telefone ou e-mail, as mesmas que
 * `apagar_dados_do_titular` (0202) apaga. Lido antes de chamar o banco.
 */
export async function caminhosDeAudioDaPessoa(servico: Servico, grupoId: string, leadId: string): Promise<string[]> {
  try {
    const { data: lead, error } = await servico
      .from("leads")
      .select("id, telefone_e164, email")
      .eq("id", leadId)
      .eq("grupo_id", grupoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) return [];

    const fichas = new Map<string, { id: string; grupo_id: string }>([[lead.id, { id: lead.id, grupo_id: grupoId }]]);
    const telefone = lead.telefone_e164?.trim();
    const email = lead.email?.trim().toLowerCase();
    // O banco compara `lower(btrim(email))` por igualdade. A consulta aqui só
    // estreita (o LIKE nunca vale como critério: `%` e `_` no e-mail casariam
    // com outras pessoas); quem decide quem é da pessoa é a igualdade exata abaixo.
    const [porTelefone, porEmail] = await Promise.all([
      telefone
        ? servico.from("leads").select("id, telefone_e164, email").eq("grupo_id", grupoId).eq("telefone_e164", telefone)
        : null,
      email
        ? servico.from("leads").select("id, telefone_e164, email").eq("grupo_id", grupoId).ilike("email", `%${escaparLike(email)}%`)
        : null,
    ]);
    for (const resposta of [porTelefone, porEmail]) {
      if (!resposta) continue;
      if (resposta.error) throw new Error(resposta.error.message);
      for (const l of resposta.data ?? []) {
        const mesmoTelefone = !!telefone && l.telefone_e164 === telefone;
        const mesmoEmail = !!email && l.email?.trim().toLowerCase() === email;
        if (mesmoTelefone || mesmoEmail) fichas.set(l.id, { id: l.id, grupo_id: grupoId });
      }
    }
    return await caminhosDeAudioDosLeads(servico, [...fichas.values()]);
  } catch (e) {
    console.error("[retorno] áudios da pessoa não localizados:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Tira os arquivos do bucket. `false` se algum não saiu (já registrado no log). */
export async function apagarAudiosGuardados(servico: Servico, caminhos: readonly string[]): Promise<boolean> {
  if (caminhos.length === 0) return true;
  try {
    for (let i = 0; i < caminhos.length; i += 100) {
      const { error } = await servico.storage.from(BUCKET_DO_AUDIO).remove(caminhos.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    return true;
  } catch (e) {
    console.error("[retorno] áudios não apagados:", e instanceof Error ? e.message : e);
    return false;
  }
}
