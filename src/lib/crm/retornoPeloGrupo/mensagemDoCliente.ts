import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsappParaGrupo } from "@/lib/whatsapp/provider";
import { TEXTO_NAO_GUARDADO } from "@/lib/whatsapp/privacidadeDaConversa";

/*
 * A conversa do cliente fica no número que ele chamou (o central, no caso do
 * anúncio), e a IA está calada nela. Sem este aviso, o "ok, quando vão me
 * ligar?" do cliente ficaria parado sem ninguém ver: o corretor dono do lead
 * não abre o CRM e não tem essa conversa no WhatsApp dele (spec 6.8).
 */

/** Quanto esperar antes de avisar: junta a rajada de mensagens num aviso só. */
const ESPERA_DA_RAJADA_MS = 8_000;
const MAX_LINHAS = 5;
const MAX_CARACTERES = 180;

function umaLinha(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > MAX_CARACTERES ? `${limpo.slice(0, MAX_CARACTERES)}…` : limpo;
}

/**
 * `💬 Ana mandou mensagem: "ok, quando vão me ligar?"`; várias viram uma linha
 * por mensagem (até 5, depois "…e mais N"); áudio sem transcrição só avisa
 * que chegou um áudio.
 */
export function textoDoAvisoDeMensagem(nome: string | null, textos: string[], teveAudio: boolean): string {
  const quem = nome?.trim() || "O cliente";
  const linhas = textos.map(umaLinha).filter(Boolean);
  if (linhas.length === 0) return teveAudio ? `💬 ${quem} mandou um áudio` : `💬 ${quem} mandou mensagem`;
  if (linhas.length === 1) return `💬 ${quem} mandou ${teveAudio ? "um áudio" : "mensagem"}: "${linhas[0]}"`;
  const visiveis = linhas.slice(0, MAX_LINHAS).map((l) => `"${l}"`);
  const resto = linhas.length - visiveis.length;
  return [
    `💬 ${quem} mandou ${teveAudio ? "mensagens e áudio" : "mensagens"}:`,
    ...visiveis,
    ...(resto > 0 ? [`…e mais ${resto}`] : []),
  ].join("\n");
}

type MensagemDoCliente = { id: string; tipo: string; conteudo: string };

/**
 * Das mensagens do cliente desde o último aviso (em ordem), decide se ESTA
 * chamada é a que avisa: só a da mensagem mais nova segue, e ela leva a
 * rajada inteira. `null` = outra chamada cuida (ou não há o que avisar).
 */
export function mensagensParaAvisar(
  mensagens: MensagemDoCliente[],
  mensagemId: string,
): { textos: string[]; teveAudio: boolean } | null {
  const ultima = mensagens.at(-1);
  if (!ultima || ultima.id !== mensagemId) return null;
  // Marcador do sistema ("[Áudio recebido — não foi possível transcrever…]",
  // "[cliente enviou uma imagem…]", o da conversa não liberada) não é fala do
  // cliente: não vai entre aspas para o corretor.
  const legivel = (m: MensagemDoCliente) => {
    const texto = m.conteudo.trim();
    return Boolean(texto) && texto !== TEXTO_NAO_GUARDADO && !/^\[[\s\S]*\]$/.test(texto);
  };
  return {
    textos: mensagens.filter(legivel).map((m) => m.conteudo),
    teveAudio: mensagens.some((m) => m.tipo === "audio"),
  };
}

/**
 * Avisa no grupo do dono atual do lead que o cliente escreveu. Chamado em
 * `after()` pelo webhook, só para lead de outro corretor. Nunca lança.
 */
export async function avisarMensagemDoClienteNoGrupo(p: {
  grupoId: string;
  leadId: string;
  conversaId: string;
  mensagemId: string;
  /** Só para teste: o cliente do banco e a espera da rajada. */
  supabase?: ReturnType<typeof createServiceClient>;
  esperaMs?: number;
}): Promise<void> {
  try {
    await new Promise((resolver) => setTimeout(resolver, p.esperaMs ?? ESPERA_DA_RAJADA_MS));
    const supabase = p.supabase ?? createServiceClient();

    // Só lead que foi avisado no grupo: é o que diz que esta imobiliária
    // trabalha com o grupo e que o corretor espera notícias por ali.
    const { data: envio, error: erroEnvio } = await supabase
      .from("lead_envios_grupo")
      .select("id, enviado_em, ultima_mensagem_avisada_em")
      .eq("lead_id", p.leadId)
      .eq("grupo_id", p.grupoId)
      .eq("status", "enviado")
      .maybeSingle();
    if (erroEnvio) return void console.error("[grupos de leads] aviso de mensagem: falha ao ler o envio:", erroEnvio.message);
    if (!envio) return;

    const [{ data: lead }, { data: grupo }] = await Promise.all([
      supabase.from("leads").select("nome, corretor_id").eq("id", p.leadId).eq("grupo_id", p.grupoId).maybeSingle(),
      supabase
        .from("grupos")
        .select("envio_grupo_leads_ativo, envio_grupo_leads_instancia")
        .eq("id", p.grupoId)
        .maybeSingle(),
    ]);
    if (!lead?.corretor_id || !grupo?.envio_grupo_leads_ativo || !grupo.envio_grupo_leads_instancia) return;

    const { data: dono } = await supabase
      .from("corretores")
      .select("ativo, whatsapp_grupo_leads_jid")
      .eq("id", lead.corretor_id)
      .eq("grupo_id", p.grupoId)
      .maybeSingle();
    if (!dono?.ativo || !dono.whatsapp_grupo_leads_jid) return;

    const desde = envio.ultima_mensagem_avisada_em ?? envio.enviado_em;
    let consulta = supabase
      .from("whatsapp_mensagens")
      .select("id, tipo, conteudo, created_at")
      .eq("conversa_id", p.conversaId)
      .eq("grupo_id", p.grupoId)
      .eq("remetente", "cliente")
      .order("created_at", { ascending: true })
      .limit(50);
    if (desde) consulta = consulta.gt("created_at", desde);
    const { data: mensagens, error: erroMensagens } = await consulta;
    if (erroMensagens) return void console.error("[grupos de leads] aviso de mensagem: falha ao ler as mensagens:", erroMensagens.message);
    const rajada = mensagensParaAvisar(mensagens ?? [], p.mensagemId);
    const maisNova = mensagens?.at(-1);
    if (!rajada || !maisNova) return;

    // Reserva: dois webhooks da mesma rajada não avisam duas vezes.
    const { data: reservado, error: erroReserva } = await supabase
      .from("lead_envios_grupo")
      .update({ ultima_mensagem_avisada_em: maisNova.created_at, updated_at: new Date().toISOString() })
      .eq("id", envio.id)
      .eq("grupo_id", p.grupoId)
      .or(`ultima_mensagem_avisada_em.is.null,ultima_mensagem_avisada_em.lt.${maisNova.created_at}`)
      .select("id")
      .maybeSingle();
    if (erroReserva) return void console.error("[grupos de leads] aviso de mensagem: falha ao reservar:", erroReserva.message);
    if (!reservado) return;

    const envioDoAviso = await enviarMensagemWhatsappParaGrupo({
      instanceName: grupo.envio_grupo_leads_instancia,
      grupoJid: dono.whatsapp_grupo_leads_jid,
      texto: textoDoAvisoDeMensagem(lead.nome, rajada.textos, rajada.teveAudio),
    });
    if (!envioDoAviso.enviado) {
      console.warn("[grupos de leads] aviso de mensagem do cliente não saiu:", envioDoAviso.motivo, envioDoAviso.detalhe);
    }
  } catch (erro) {
    console.error("[grupos de leads] falha ao avisar mensagem do cliente:", erro);
  }
}
