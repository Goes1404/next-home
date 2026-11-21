"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehDaEquipeDaProspeccao, ERRO_FORA_DA_EQUIPE } from "@/lib/prospeccao/equipe";
import { createServiceClient } from "@/lib/supabase/service";
import { ehEtapa, ehModelo, type Etapa } from "@/lib/prospeccao/tipos";
import { mensagemCurta, normalizarWhatsapp, slugDaLoja, vendedorDaProspeccao } from "@/lib/prospeccao/abordagem";
import {
  ETAPAS_A_CONFERIR,
  INSTANCIA_DA_PROSPECCAO,
  MOTIVO_SEM_WHATSAPP,
  resumoDaConferencia,
  separarConferencia,
} from "@/lib/prospeccao/whatsappDaProspeccao";
import { conferirNumerosNoWhatsapp, consultarEstadoConexao, obterQrCodeInstancia, provedorConfigurado } from "@/lib/whatsapp/provider";

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
 * O que o botão mandou: a abordagem, o follow-up (0256) ou a amostra para
 * quem respondeu à abordagem curta (04/11/2026), que move a loja para
 * "Respondeu" (o app não vê o WhatsApp; o clique é o sinal da resposta).
 */
export type TipoDeEnvio = "abordagem" | "followup" | "amostra";

/**
 * O botão "Enviar no WhatsApp" abriu a conversa com a mensagem pronta: a loja
 * passa a "Abordado". Loja marcada como não contatar é recusada aqui também,
 * não só na tela.
 */
export async function marcarEnviado(id: string, tipo: TipoDeEnvio = "abordagem"): Promise<Resultado> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!ID.test(id)) return { ok: false, erro: "Loja inválida." };

  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("prospeccao_leads").select("etapa, nao_contatar, enviado_em, followup_em, respondeu_em").eq("id", id).maybeSingle();
  if (!lead) return { ok: false, erro: "Loja não encontrada." };
  if (lead.nao_contatar) return { ok: false, erro: "Esta loja pediu para não receber mais mensagens." };

  const agora = new Date().toISOString();
  const mudanca: { etapa?: Etapa; enviado_em?: string; followup_em?: string; respondeu_em?: string } = {};
  if (tipo === "amostra") {
    if (lead.etapa === "enviado") mudanca.etapa = "respondeu";
    if (!lead.respondeu_em) mudanca.respondeu_em = agora;
  } else if (lead.etapa === "novo" || lead.etapa === "aprovado") mudanca.etapa = "enviado";
  if (!lead.enviado_em) mudanca.enviado_em = agora;
  // 0256: o follow-up fica registrado, para a régua não pedir outro.
  if (tipo === "followup" && lead.enviado_em && !lead.followup_em) mudanca.followup_em = agora;
  if (Object.keys(mudanca).length) {
    const { error } = await supabase.from("prospeccao_leads").update(mudanca).eq("id", id);
    if (error) return { ok: false, erro: "Não consegui marcar o envio." };
  }
  // SEM `revalidar` (20/11/2026): esta ação roda enquanto o celular está no
  // WhatsApp, e o `revalidatePath` faz a resposta carregar a página inteira
  // de novo. Cortada no meio, essa recarga quebrava a casca do painel e caía
  // na tela preta "This page couldn't load" (Reload/Back), que o `error.tsx`
  // de `/plataforma` não segura. O botão mostra "Abordado" sozinho, e a lista
  // vem atualizada na próxima navegação (as páginas são dinâmicas).
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
      mensagem: mensagemCurta({ nome, gancho, vendedor: vendedorDaProspeccao() }),
      origem: "manual",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não consegui cadastrar a loja." };
  revalidar();
  return { ok: true, id: data.id };
}

/* ── O WhatsApp da prospecção: conectar o chip e conferir quem tem WhatsApp (21/11/2026) ── */

export type EstadoDoWhatsapp =
  | { ok: true; configurado: boolean; conectado: boolean; telefone: string | null }
  | { ok: false; erro: string };

/** O chip da prospecção está conectado? (só leitura) */
export async function estadoDoWhatsappDaProspeccao(): Promise<EstadoDoWhatsapp> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!provedorConfigurado()) return { ok: true, configurado: false, conectado: false, telefone: null };
  const estado = await consultarEstadoConexao(INSTANCIA_DA_PROSPECCAO);
  // Instância que ainda não existe responde 404: é só "não conectado".
  if (!estado.ok) return { ok: true, configurado: true, conectado: false, telefone: null };
  return { ok: true, configurado: true, conectado: estado.conectado, telefone: estado.telefone };
}

export type Pareamento =
  | { ok: true; jaConectado: boolean; qrcode: string | null; codigo: string | null }
  | { ok: false; erro: string };

/**
 * Pede o QR Code (ou, com o número, o código de 8 letras para digitar no
 * próprio celular) para conectar o chip da prospecção. Cria a instância na
 * primeira vez.
 */
export async function conectarWhatsappDaProspeccao(telefone?: string): Promise<Pareamento> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  if (!provedorConfigurado()) return { ok: false, erro: "O WhatsApp do sistema não está configurado neste ambiente." };
  const r = await obterQrCodeInstancia(INSTANCIA_DA_PROSPECCAO, telefone?.trim() || null);
  if (!r.ok) return { ok: false, erro: "Não consegui falar com o WhatsApp agora. Tente de novo em um minuto." };
  if (!r.jaConectado && !r.qrcodeBase64 && !r.codigoPareamento) {
    return { ok: false, erro: "O WhatsApp não mandou o código. Tente de novo." };
  }
  return { ok: true, jaConectado: r.jaConectado, qrcode: r.qrcodeBase64, codigo: r.codigoPareamento };
}

export type ResultadoDaConferencia = { ok: true; resumo: string; tirados: number } | { ok: false; erro: string };

/**
 * Confere, pelo chip da prospecção, quem dos leads ainda não abordados tem
 * WhatsApp. Quem NÃO tem vai para Perdido com o motivo, e some da fila de
 * envio. Só consulta: nenhuma mensagem sai.
 */
export async function conferirWhatsappDosLeads(): Promise<ResultadoDaConferencia> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };
  if (!(await ehDaEquipeDaProspeccao(admin))) return { ok: false, erro: ERRO_FORA_DA_EQUIPE };
  const estado = await consultarEstadoConexao(INSTANCIA_DA_PROSPECCAO);
  if (!estado.ok || !estado.conectado) return { ok: false, erro: "Conecte o chip da prospecção primeiro." };

  const supabase = createServiceClient();
  const { data: leads, error } = await supabase
    .from("prospeccao_leads")
    .select("id, whatsapp")
    .in("etapa", [...ETAPAS_A_CONFERIR])
    .eq("nao_contatar", false)
    .not("whatsapp", "is", null)
    .limit(1000);
  if (error) return { ok: false, erro: "Não consegui ler a lista." };
  if (!leads || leads.length === 0) return { ok: true, resumo: "Não há número novo para conferir.", tirados: 0 };

  const respostas = await conferirNumerosNoWhatsapp({
    instanceName: INSTANCIA_DA_PROSPECCAO,
    telefones: leads.map((l) => l.whatsapp as string),
  });
  const c = separarConferencia(leads, respostas);
  if (c.semWhatsapp.length > 0) {
    const { error: e2 } = await supabase
      .from("prospeccao_leads")
      .update({ etapa: "perdido", motivo_perda: MOTIVO_SEM_WHATSAPP })
      .in("id", c.semWhatsapp)
      .in("etapa", [...ETAPAS_A_CONFERIR]);
    if (e2) return { ok: false, erro: "Conferi, mas não consegui tirar da lista quem não tem WhatsApp." };
  }
  revalidar();
  return { ok: true, resumo: resumoDaConferencia(c), tirados: c.semWhatsapp.length };
}
