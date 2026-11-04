"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehDaEquipeDaProspeccao, ERRO_FORA_DA_EQUIPE } from "@/lib/prospeccao/equipe";
import { createServiceClient } from "@/lib/supabase/service";
import { ehEtapa, ehModelo, type Etapa } from "@/lib/prospeccao/tipos";
import { linkDaAmostra, mensagemPadrao, normalizarWhatsapp, slugDaLoja, vendedorDaProspeccao } from "@/lib/prospeccao/abordagem";

/**
 * As ações da aba Prospecção (0253, 02/11/2026). Só o administrador da
 * plataforma que está na equipe da prospecção (0254); a chave de serviço só depois da guarda, em cada ação. As
 * tabelas são globais (`prospeccao_*`): nenhuma ação toca tabela de grupo.
 */
export type Resultado = { ok: true } | { ok: false; erro: string };
export type ResultadoComId = { ok: true; id: string } | { ok: false; erro: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidar(id?: string) {
  revalidatePath("/plataforma/prospeccao");
  if (id) revalidatePath(`/plataforma/prospeccao/${id}`);
}

/** Muda a etapa do funil. Perdido pede o motivo; voltar para "novo" limpa o envio. */
export async function mudarEtapa(id: string, etapa: string, motivo?: string): Promise<Resultado> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!ID.test(id) || !ehEtapa(etapa)) return { ok: false, erro: "Etapa inválida." };

  const agora = new Date().toISOString();
  const mudanca: { etapa: Etapa; motivo_perda?: string | null; enviado_em?: string | null; respondeu_em?: string } = { etapa };
  if (etapa === "perdido") mudanca.motivo_perda = motivo?.trim().slice(0, 300) || null;
  if (etapa === "respondeu") mudanca.respondeu_em = agora;

  const supabase = createServiceClient();
  const { data: atual } = await supabase.from("prospeccao_leads").select("enviado_em, respondeu_em").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Loja não encontrada." };
  if (["enviado", "respondeu", "reuniao", "proposta", "ganho"].includes(etapa) && !atual.enviado_em) mudanca.enviado_em = agora;
  if (etapa === "respondeu" && atual.respondeu_em) delete mudanca.respondeu_em;

  const { error } = await supabase.from("prospeccao_leads").update(mudanca).eq("id", id);
  if (error) return { ok: false, erro: "Não consegui salvar a etapa." };
  revalidar(id);
  return { ok: true };
}

/**
 * O botão "Enviar no WhatsApp" abriu a conversa com a mensagem pronta: a loja
 * passa a "Abordado". Loja marcada como não contatar é recusada aqui também,
 * não só na tela.
 */
export async function marcarEnviado(id: string, tipo: "abordagem" | "followup" = "abordagem"): Promise<Resultado> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!ID.test(id)) return { ok: false, erro: "Loja inválida." };

  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("prospeccao_leads").select("etapa, nao_contatar, enviado_em, followup_em").eq("id", id).maybeSingle();
  if (!lead) return { ok: false, erro: "Loja não encontrada." };
  if (lead.nao_contatar) return { ok: false, erro: "Esta loja pediu para não receber mais mensagens." };

  const agora = new Date().toISOString();
  const mudanca: { etapa?: Etapa; enviado_em?: string; followup_em?: string } = {};
  if (lead.etapa === "novo" || lead.etapa === "aprovado") mudanca.etapa = "enviado";
  if (!lead.enviado_em) mudanca.enviado_em = agora;
  // 0256: o follow-up fica registrado, para a régua não pedir outro.
  if (tipo === "followup" && lead.enviado_em && !lead.followup_em) mudanca.followup_em = agora;
  if (Object.keys(mudanca).length) {
    const { error } = await supabase.from("prospeccao_leads").update(mudanca).eq("id", id);
    if (error) return { ok: false, erro: "Não consegui marcar o envio." };
  }
  revalidar(id);
  return { ok: true };
}

export type DadosDaFicha = {
  whatsapp: string;
  instagram: string;
  gancho: string;
  mensagem: string;
  observacoes: string;
  naoContatar: boolean;
};

export async function salvarFicha(id: string, dados: DadosDaFicha): Promise<Resultado> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!ID.test(id)) return { ok: false, erro: "Loja inválida." };

  const whatsapp = dados.whatsapp.trim() ? normalizarWhatsapp(dados.whatsapp) : null;
  if (dados.whatsapp.trim() && !whatsapp) return { ok: false, erro: "WhatsApp inválido. Use DDD + número, ex.: 11 91234-5678." };

  const supabase = createServiceClient();
  const { data: atual } = await supabase.from("prospeccao_leads").select("nao_contatar").eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Loja não encontrada." };

  const { error } = await supabase
    .from("prospeccao_leads")
    .update({
      whatsapp,
      instagram: dados.instagram.trim().slice(0, 80) || null,
      gancho: dados.gancho.trim().slice(0, 400) || null,
      mensagem: dados.mensagem.trim().slice(0, 2000) || null,
      observacoes: dados.observacoes.trim().slice(0, 2000) || null,
      nao_contatar: dados.naoContatar,
      nao_contatar_em: dados.naoContatar ? (atual.nao_contatar ? undefined : new Date().toISOString()) : null,
    })
    .eq("id", id);
  if (error) return { ok: false, erro: "Não consegui salvar a ficha." };
  revalidar(id);
  return { ok: true };
}

export type NovaLoja = {
  nome: string;
  segmento: string;
  modelo: string;
  cidade: string;
  bairro: string;
  endereco: string;
  whatsapp: string;
  instagram: string;
  gancho: string;
  corPrimaria: string;
};

/** Cadastra uma loja à mão, com slug livre e a mensagem padrão já montada. */
export async function cadastrarLoja(loja: NovaLoja): Promise<ResultadoComId> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };

  const nome = loja.nome.trim().slice(0, 160);
  if (!nome) return { ok: false, erro: "Informe o nome da loja." };
  const modelo = ehModelo(loja.modelo) ? loja.modelo : "varejo";
  const whatsapp = loja.whatsapp.trim() ? normalizarWhatsapp(loja.whatsapp) : null;
  if (loja.whatsapp.trim() && !whatsapp) return { ok: false, erro: "WhatsApp inválido. Use DDD + número, ex.: 11 91234-5678." };
  const cor = /^#[0-9a-fA-F]{6}$/.test(loja.corPrimaria) ? loja.corPrimaria : null;

  const supabase = createServiceClient();
  const base = slugDaLoja([nome, loja.cidade].filter(Boolean).join(" "));
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const { count } = await supabase.from("prospeccao_leads").select("id", { count: "exact", head: true }).eq("slug", slug);
    if (!count) break;
    slug = `${base}-${n}`;
  }

  const gancho = loja.gancho.trim().slice(0, 400) || null;
  const { data, error } = await supabase
    .from("prospeccao_leads")
    .insert({
      nome,
      segmento: loja.segmento.trim().slice(0, 60) || null,
      modelo,
      cidade: loja.cidade.trim().slice(0, 80) || null,
      bairro: loja.bairro.trim().slice(0, 80) || null,
      endereco: loja.endereco.trim().slice(0, 200) || null,
      whatsapp,
      instagram: loja.instagram.trim().slice(0, 80) || null,
      gancho,
      slug,
      amostra: cor ? { cores: { primaria: cor } } : {},
      mensagem: mensagemPadrao({ nome, gancho, link: linkDaAmostra(slug), vendedor: vendedorDaProspeccao() }),
      origem: "manual",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não consegui cadastrar a loja." };
  revalidar();
  return { ok: true, id: data.id };
}
