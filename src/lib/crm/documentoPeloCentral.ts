import "server-only";

import { randomUUID } from "node:crypto";
import { registrarInteracao } from "@/lib/crm/interacoes";
import { BUCKET_DOCUMENTOS } from "@/lib/crm/envioAutorizado";
import type { FaseDocumento } from "@/lib/crm/documentacao";
import { garantirLinkDeDocumentos } from "@/lib/crm/linkDeDocumentos";
import { TETO_DOCUMENTO_BYTES } from "@/lib/crm/linksDoCliente";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { silencioDaConversa } from "@/lib/whatsapp/quandoAIaResponde";
import { gravarMensagem, lerConversaPersistida, registrarResultadoEnvio, situacaoDaConversa } from "@/lib/whatsapp/repositorio";

/**
 * A documentação do lead pedida pelo número central (onda 2, capacidade 5):
 * anexar a foto de documento que o corretor mandou, e mandar ao cliente o
 * link de documentos PELO NÚMERO DO CORRETOR (spec 3.0: o que vai ao
 * cliente nunca sai do central).
 *
 * Mora no domínio, e não em `src/lib/central/`, pela mesma razão de
 * `leadPeloCentral.ts`: o central não escreve em tabela do CRM. Roda pela
 * chave de serviço, então a regra que a ação do painel confere pela sessão
 * (`documentacaoAcoes.ts`: só o corretor DONO do lead mexe nos documentos;
 * o gestor lê) é conferida aqui, em toda escrita, com o grupo e o corretor
 * da identificação.
 */

type Supa = ReturnType<typeof createServiceClient>;

const ORIGEM = "central_whatsapp";

export type LeadDoDono = { id: string; nome: string; naoContatar: boolean };

/** O lead, se for do corretor no grupo e não estiver arquivado. É a regra de `leadDoCorretor` do painel. */
export async function leadDoDono(supabase: Supa, p: { grupoId: string; corretorId: string; leadId: string }): Promise<LeadDoDono | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, nao_contatar_em")
    .eq("id", p.leadId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .is("arquivado_em", null)
    .maybeSingle();
  return data ? { id: data.id, nome: data.nome?.trim() || "o cliente", naoContatar: Boolean(data.nao_contatar_em) } : null;
}

// ── Anexar ─────────────────────────────────────────────────────────────────

const EXTENSAO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type AnexoPeloCentral = { ok: true; documentoId: string; caminho: string } | { ok: false; erro: string };

/**
 * Guarda a foto na Documentação do lead, no item pedido. Entra como
 * "recebido" (esperando conferência), e não "conferido" como o anexo da
 * ficha: na ficha o corretor escolhe o item com o arquivo na mão; aqui quem
 * escolheu o item foi a leitura da conversa, e conferir na ficha é o passo
 * que pega um holerite guardado como RG.
 *
 * O arquivo sobe para a pasta do lead (`<lead>/central/…`), que o pedido do
 * titular e o encerramento do grupo já apagam junto. Sem a linha, o arquivo
 * é removido (ficaria órfão e invisível na ficha).
 */
export async function anexarDocumentoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string; fase: FaseDocumento; item: string; bytes: Buffer; mimeType: string },
): Promise<AnexoPeloCentral> {
  const ext = EXTENSAO[p.mimeType];
  if (!ext) return { ok: false, erro: "Só guardo foto em JPG, PNG ou WEBP." };
  if (p.bytes.length === 0 || p.bytes.length > TETO_DOCUMENTO_BYTES) return { ok: false, erro: "A foto passa do tamanho que a ficha aceita (10 MB)." };
  const lead = await leadDoDono(supabase, p);
  if (!lead) return { ok: false, erro: "Só o corretor do cliente guarda documentos dele, e o cliente precisa estar ativo." };

  const caminho = `${p.leadId}/central/${randomUUID()}.${ext}`;
  const { error: erroUpload } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(caminho, p.bytes, { contentType: p.mimeType });
  if (erroUpload) {
    console.error("[central] documento não subiu:", erroUpload.message);
    return { ok: false, erro: "Não consegui guardar a foto agora. Tente de novo." };
  }
  const { data, error } = await supabase
    .from("lead_documentos")
    .insert({
      lead_id: p.leadId,
      grupo_id: p.grupoId,
      corretor_id: p.corretorId,
      item: p.item,
      fase: p.fase,
      caminho,
      nome_arquivo: `${p.item.slice(0, 100)}.${ext}`,
      tamanho: p.bytes.length,
      mime: p.mimeType,
      origem: "corretor",
      situacao: "recebido",
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    console.error("[central] documento não registrado:", error?.message);
    return { ok: false, erro: "A foto chegou, mas não consegui registrá-la na ficha. Tente de novo." };
  }
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: p.corretorId,
    tipo: "sistema",
    conteudo: `Documento "${p.item}" guardado pelo número central (WhatsApp).`,
    detalhes: { origem: ORIGEM, documento_id: data.id },
  });
  return { ok: true, documentoId: data.id, caminho };
}

/**
 * O "desfaz" do anexo (spec 4.6): a linha e o arquivo saem. Só o que este
 * corretor guardou, no grupo dele, e só enquanto ninguém conferiu: um
 * documento que o corretor já conferiu na ficha virou trabalho dele.
 */
export async function removerDocumentoAnexadoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; documentoId: string },
): Promise<{ ok: boolean; erro?: string }> {
  const { data: doc } = await supabase
    .from("lead_documentos")
    .select("id, caminho, situacao")
    .eq("id", p.documentoId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  if (!doc) return { ok: false, erro: "Esse documento não está mais na ficha." };
  if (doc.situacao !== "recebido") return { ok: false, erro: "Esse documento já foi conferido na ficha; tire por lá, se for o caso." };
  const { error } = await supabase.from("lead_documentos").delete().eq("id", doc.id).eq("grupo_id", p.grupoId);
  if (error) return { ok: false, erro: "Não consegui tirar o documento agora." };
  await supabase.storage.from(BUCKET_DOCUMENTOS).remove([doc.caminho]);
  return { ok: true };
}

// ── Link de documentos ao cliente ──────────────────────────────────────────

type Canal = {
  conversa: NonNullable<Awaited<ReturnType<typeof lerConversaPersistida>>>;
  instancia: { id: string; instance_name: string };
};

/**
 * O canal para falar com o cliente pelo número do corretor: a conversa que
 * eles já têm e o número conectado, fora da pausa de proteção. É o toque do
 * corretor (como `pedirConfirmacaoDaVisita` com `por: "corretor"`): não gasta
 * cota e vale com a IA desligada na conversa, mas não fala com quem pediu
 * para sair nem com lead que passou a outro número. Sem conversa, não é o
 * central que abre o primeiro contato: isso segue as regras anti-bloqueio do
 * primeiro contato, e o corretor manda pelo painel.
 */
async function canalComOCliente(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string },
  agora: Date,
): Promise<Canal | { erro: string }> {
  const { data: conversaDoLead } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .eq("lead_id", p.leadId)
    .eq("corretor_id", p.corretorId)
    .limit(1)
    .maybeSingle();
  const conversa = conversaDoLead ? await lerConversaPersistida(conversaDoLead.id) : null;
  if (!conversa) {
    return { erro: "Esse cliente ainda não conversou com você pelo WhatsApp. Mande o link pela ficha dele, no painel (Documentação)." };
  }
  const silencio = silencioDaConversa(situacaoDaConversa(conversa));
  if (silencio && silencio.motivo !== "ia_desligada_na_conversa") return { erro: "Seu número não fala mais com esse cliente." };

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name, status_conexao, conectado_em, bloqueado_ate")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  if (!instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em) {
    return { erro: "Seu WhatsApp está desconectado do sistema. Conecte de novo no painel para eu mandar por ele." };
  }
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > agora) {
    return { erro: "Seu número está em pausa de proteção agora. Tente mais tarde." };
  }
  return { conversa, instancia: { id: instancia.id, instance_name: instancia.instance_name } };
}

/** Antes da proposta: dá para mandar? (só leitura; o envio confere tudo de novo). */
export async function podeMandarAoCliente(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string },
  agora: Date = new Date(),
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const lead = await leadDoDono(supabase, p);
  if (!lead) return { ok: false, erro: "Só o corretor do cliente manda o link de documentos a ele." };
  if (lead.naoContatar) return { ok: false, erro: "Esse cliente pediu para não receber mensagens." };
  const canal = await canalComOCliente(supabase, p, agora);
  return "erro" in canal ? { ok: false, erro: canal.erro } : { ok: true };
}

export type EnvioDoLink = { ok: true; texto: string } | { ok: false; erro: string };

/**
 * Manda ao cliente, pelo número do corretor, a mensagem do link de
 * documentos da fase: o mesmo texto e o mesmo link do botão da ficha
 * (`garantirLinkDeDocumentos`). A mensagem é gravada na conversa como fala
 * do corretor (é ele pedindo, pelo central), só depois de sair.
 */
export async function mandarLinkDeDocumentosPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string; fase: FaseDocumento },
  agora: Date = new Date(),
): Promise<EnvioDoLink> {
  const lead = await leadDoDono(supabase, p);
  if (!lead) return { ok: false, erro: "Só o corretor do cliente manda o link de documentos a ele." };
  if (lead.naoContatar) return { ok: false, erro: "Esse cliente pediu para não receber mensagens." };
  const canal = await canalComOCliente(supabase, p, agora);
  if ("erro" in canal) return { ok: false, erro: canal.erro };

  const link = await garantirLinkDeDocumentos(supabase, {
    leadId: p.leadId,
    nomeDoLead: lead.nome,
    corretorId: p.corretorId,
    grupoId: p.grupoId,
    fase: p.fase,
    perfil: null,
  });
  if ("erro" in link) return { ok: false, erro: link.erro };

  const envio = await enviarMensagemWhatsapp({
    instanceName: canal.instancia.instance_name,
    telefone: canal.conversa.telefoneCliente,
    texto: link.mensagem,
  });
  await registrarResultadoEnvio(canal.instancia.id, envio.enviado);
  if (!envio.enviado) {
    console.warn("[central] link de documentos não saiu:", envio.motivo);
    return { ok: false, erro: "Não consegui mandar pelo seu WhatsApp agora. Tente de novo em instantes." };
  }
  await gravarMensagem({
    conversaId: canal.conversa.id,
    remetente: "corretor",
    conteudo: link.mensagem,
    conversaLiberada: true,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: p.corretorId,
    tipo: "sistema",
    conteudo: "Link de documentos enviado ao cliente pelo número central (WhatsApp do corretor).",
    detalhes: { origem: ORIGEM, fase: p.fase },
  });
  return { ok: true, texto: link.mensagem };
}
