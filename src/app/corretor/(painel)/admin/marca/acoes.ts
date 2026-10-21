"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { gravarLogoDoGrupo, tirarLogoDoGrupo, type ResultadoDaLogo } from "@/lib/marcaDoCrm/gravarLogo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A logo da imobiliária no CRM (0208), pelo gestor do próprio grupo.
 *
 * Quem pode é `exigirGestorNaAcao()`; o grupo é o da SESSÃO e nunca vem do
 * navegador. `grupos.logo_url` não tem UPDATE para o logado, então a gravação
 * vai pela chave de serviço, depois da guarda e só no grupo do gestor.
 */

function atualizarTelas() {
  // O cabeçalho e as abas de todo o painel leem a marca do grupo.
  revalidatePath("/corretor", "layout");
}

export async function trocarLogoDaCasa(dados: FormData): Promise<ResultadoDaLogo> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };

  const arquivo = dados.get("logo");
  const r = await gravarLogoDoGrupo(guarda.corretor.grupoId, arquivo instanceof File ? arquivo : null);
  if (!r.ok) return r;

  await registrar(guarda.corretor.grupoId, guarda.corretor.id, "trocada", r.url);
  atualizarTelas();
  return r;
}

export async function tirarLogoDaCasa(): Promise<ResultadoDaLogo> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };

  const r = await tirarLogoDoGrupo(guarda.corretor.grupoId);
  if (!r.ok) return r;

  await registrar(guarda.corretor.grupoId, guarda.corretor.id, "removida", null);
  atualizarTelas();
  return r;
}

async function registrar(grupoId: string, gestorId: string, mudanca: "trocada" | "removida", url: string | null) {
  const { error } = await createServiceClient().from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "logo_do_grupo_alterada",
    ator_id: gestorId,
    alvo_corretor_id: null,
    detalhes: { origem: "gestor", mudanca, url },
  });
  if (error) console.error(`[marca] evento da logo (${grupoId}) não gravado: ${error.message}`);
}
