"use server";

import { redirect } from "next/navigation";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { normalizarMotivo } from "@/lib/plataforma/acessoDeSuporte";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

export type ResultadoDoAcesso = { ok: false; erro: string } | undefined;

/**
 * Abre a visão de suporte de UM grupo (0243, 29/10/2026). O registro vem
 * ANTES da tela: grava a linha em `acessos_de_suporte` (quem, qual conta,
 * quando, por quê) e só então redireciona para a página com `?acesso=<id>`,
 * que confere a linha antes de mostrar qualquer número. Sem registro, sem
 * tela — falhou o insert, o administrador fica no formulário com o erro.
 *
 * O mesmo acesso vai para `admin_eventos` (`visao_de_suporte_aberta`, CHECK
 * recriado na 0243): esse é o rastro do grupo, como as outras ações da
 * plataforma; se o banco recusar (antes da 0243), só vai ao log.
 */
export async function abrirVisaoDeSuporte(
  grupoId: string,
  _estadoAnterior: ResultadoDoAcesso,
  formData: FormData,
): Promise<ResultadoDoAcesso> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  const motivo = normalizarMotivo(formData.get("motivo"));
  if (motivo === null) return { ok: false, erro: "O motivo passa de 200 caracteres. Resuma, por favor." };

  const servico = createServiceClient();
  const { data: grupo, error: erroDoGrupo } = await servico.from("grupos").select("id").eq("id", grupoId).maybeSingle();
  if (erroDoGrupo) {
    console.error(`[plataforma] grupo ${grupoId} não lido para a visão de suporte: ${erroDoGrupo.message}`);
    return { ok: false, erro: "Não foi possível abrir a visão de suporte agora. Tente de novo." };
  }
  if (!grupo) return { ok: false, erro: "Grupo não encontrado." };

  const { data: acesso, error } = await servico
    .from("acessos_de_suporte")
    .insert({ admin_user_id: guarda.userId, grupo_alvo_id: grupoId, motivo })
    .select("id")
    .single();
  if (error || !acesso) {
    console.error(`[plataforma] acesso de suporte ao grupo ${grupoId} não registrado: ${error?.message ?? "sem linha"}`);
    return { ok: false, erro: "Não foi possível registrar o acesso; a visão de suporte não abre sem ele. Tente de novo." };
  }

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "visao_de_suporte_aberta",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", acesso_id: acesso.id, motivo },
  });
  if (erroDoEvento) {
    console.error(`[plataforma] evento visao_de_suporte_aberta não gravado: ${erroDoEvento.message}`, { grupoId, acessoId: acesso.id });
  }

  redirect(`/plataforma/grupos/${grupoId}/suporte?acesso=${acesso.id}`);
}
