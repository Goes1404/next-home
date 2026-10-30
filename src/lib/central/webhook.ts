import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { baixarMidiaDoProvedor, enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { pensar } from "./cerebro";
import { responderNoCentral, type Dependencias, type EstadoDoCentral, type MensagemRecebida } from "./conversa";
import { identificarRemetente, type OpcaoDeImobiliaria } from "./identificar";
import { esquecerCentral, lerCentral } from "./numeroDoCentral";
import type { Proposta } from "./proposta";
import type { Json } from "@/lib/supabase/types";

/** jsonb aceita o que for serializável; o tipo gerado não conhece as nossas formas. */
const comoJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

/**
 * O webhook do número central da plataforma (0248; plano da onda 0, Task 7).
 *
 * `route.ts` desvia para cá logo depois de ler `instanceName`, antes de toda
 * a lógica de corretor: `resolverInstancia` não acharia o central (não é de
 * corretor) e a mensagem levaria 404.
 *
 * Trata `connection.update` (o estado do central) e mensagem privada nova.
 * Grupo e transmissão são ignorados nesta onda. O que o próprio central
 * manda volta como `fromMe` e também é ignorado.
 */

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mesma regra de `requisicaoAutenticada` do webhook: o segredo global. */
function autenticado(req: NextRequest): boolean {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  const enviado =
    req.headers.get("x-webhook-secret") || req.headers.get("apikey") || new URL(req.url).searchParams.get("token") || "";
  return Boolean(enviado) && segredoConfere(enviado, segredo);
}

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** O número de quem escreveu, quando o WhatsApp manda só o `@lid`. */
function numeroAlternativo(data: Payload): string | null {
  const key = data?.key ?? {};
  for (const c of [key.senderPn, key.participantPn, key.remoteJidAlt, data?.senderPn]) {
    if (typeof c === "string" && /@s\.whatsapp\.net$/.test(c)) return c.replace(/\D/g, "") || null;
  }
  return null;
}

/** A mensagem do webhook no formato da conversa, ou `null` quando não é para tratar. */
export function lerMensagemDoCentral(payload: Payload): MensagemRecebida | null {
  const data = payload.data ?? {};
  const key = data.key ?? {};
  const jid: string = key.remoteJid || payload.remoteJid || "";
  if (!jid || /@(g\.us|broadcast)$/i.test(jid) || jid === "status@broadcast") return null;
  if (key.fromMe || payload.fromMe) return null;
  const mensagemId: string | null = key.id || payload.messageId || null;
  if (!mensagemId) return null;

  const ehLid = /@lid$/i.test(jid);
  const telefone = ehLid ? numeroAlternativo(data) : jid.replace(/\D/g, "") || null;
  const lid = ehLid ? jid : null;

  const m = data.message ?? {};
  const texto: string = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
  const tipo = m.audioMessage ? "audio" : m.imageMessage || m.documentMessage ? "imagem" : "texto";
  if (tipo === "texto" && !texto.trim()) return null;
  return { mensagemId, telefone, lid, tipo, texto };
}

function dependenciasReais(instanceName: string, payload: Payload): Dependencias {
  const supabase = createServiceClient();
  return {
    agora: () => new Date(),
    identificar: (e) => identificarRemetente(supabase, e),
    jaTratada: async (mensagemId) => {
      const [comando, tentativa] = await Promise.all([
        supabase.from("central_comandos").select("id").eq("mensagem_id", mensagemId).limit(1).maybeSingle(),
        supabase.from("central_tentativas").select("id").eq("mensagem_id", mensagemId).limit(1).maybeSingle(),
      ]);
      return Boolean(comando.data || tentativa.data);
    },
    registrarTentativa: async (t) => {
      await supabase
        .from("central_tentativas")
        .insert({ telefone_hash: t.telefoneHash, motivo: t.motivo, mensagem_id: t.mensagemId });
    },
    lerEscolhaPendente: async (telefone) => {
      const { data } = await supabase
        .from("central_escolha_de_grupo")
        .select("opcoes")
        .eq("telefone", telefone)
        .is("corretor_id", null)
        .maybeSingle();
      return Array.isArray(data?.opcoes) ? (data.opcoes as OpcaoDeImobiliaria[]) : null;
    },
    guardarEscolha: async (e) => {
      const agora = new Date().toISOString();
      await supabase.from("central_escolha_de_grupo").upsert(
        {
          telefone: e.telefone,
          corretor_id: e.corretorId,
          opcoes: comoJson(e.opcoes),
          perguntado_em: e.opcoes ? agora : null,
          escolhido_em: e.corretorId ? agora : null,
        },
        { onConflict: "telefone" },
      );
    },
    cotaEsgotada: async (grupoId) => {
      const [cota, suspenso] = await Promise.all([lerCotaDaIa(grupoId), grupoSuspenso(grupoId)]);
      return cota.nivel === "esgotada" || suspenso;
    },
    lerEstado: async (corretorId): Promise<EstadoDoCentral> => {
      const { data } = await supabase
        .from("central_estado")
        .select("historico, proposta, boas_vindas_em")
        .eq("corretor_id", corretorId)
        .maybeSingle();
      return {
        historico: Array.isArray(data?.historico) ? (data.historico as EstadoDoCentral["historico"]) : [],
        proposta: (data?.proposta as Proposta | null) ?? null,
        boasVindasEm: data?.boas_vindas_em ?? null,
      };
    },
    salvarEstado: async (corretorId, estado) => {
      await supabase.from("central_estado").upsert(
        {
          corretor_id: corretorId,
          historico: comoJson(estado.historico),
          proposta: comoJson(estado.proposta),
          proposta_expira_em: estado.proposta?.expiraEm ?? null,
          boas_vindas_em: estado.boasVindasEm,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "corretor_id" },
      );
    },
    transcrever: async (quemPaga) => {
      const midia = await baixarMidiaDoProvedor({
        instanceName,
        messageId: payload.data?.key?.id,
        mensagemCompleta: payload.data,
      });
      if (!midia.ok) return null;
      const r = await transcreverAudioWhatsapp({
        base64: midia.base64,
        mimeType: midia.mimeType,
        segundos: Number(payload.data?.message?.audioMessage?.seconds) || undefined,
        quemPaga,
      });
      return r.sucesso && r.textoTranscrito.trim() ? r.textoTranscrito.trim() : null;
    },
    pensar,
    registrarComando: async (r) => {
      await supabase.from("central_comandos").insert({
        corretor_id: r.corretorId,
        mensagem_id: r.mensagemId,
        tipo: r.tipo,
        texto: r.texto,
        ferramentas: comoJson(r.ferramentas),
        proposta: comoJson(r.proposta),
        confirmado: r.confirmado,
        resultado: r.resultado,
        desfazer: r.desfazer ? comoJson(r.desfazer) : null,
        erro: r.erro,
        custo_centavos: r.custoCentavos,
        latencia_ms: r.latenciaMs,
      });
    },
  };
}

/** Conexão do próprio central: grava o estado em `central_da_plataforma`. */
async function registrarConexaoDoCentral(instanceName: string, estado: string): Promise<void> {
  const conectado = estado === "open";
  const agora = new Date().toISOString();
  await createServiceClient()
    .from("central_da_plataforma")
    .update(
      conectado
        ? { status_conexao: "conectado", conectado_em: agora, desconectado_em: null }
        : { status_conexao: estado === "connecting" ? "conectando" : "desconectado", desconectado_em: agora },
    )
    .eq("instance_name", instanceName);
  esquecerCentral();
}

export async function tratarWebhookDoCentral(req: NextRequest, payload: Payload): Promise<Response> {
  if (!autenticado(req)) return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  const central = await lerCentral();
  if (!central) return NextResponse.json({ ok: true, ignored: "sem_central" });

  const evento = String(payload.event || payload.type || "").toLowerCase().replace(/_/g, ".");
  const estado: string = payload.data?.state || payload.state || "";
  if (evento === "connection.update") {
    await registrarConexaoDoCentral(central.instanceName, estado);
    return NextResponse.json({ ok: true, action: "central_conexao", estado });
  }
  if (evento && evento !== "messages.upsert") return NextResponse.json({ ok: true, ignored: evento });

  const mensagem = lerMensagemDoCentral(payload);
  if (!mensagem) return NextResponse.json({ ok: true, ignored: "central_sem_mensagem" });

  // Só o `@lid`, sem número: o número do perfil de quem tem esse lid, para
  // conseguir responder.
  if (!mensagem.telefone && mensagem.lid) {
    const { data } = await createServiceClient()
      .from("corretores")
      .select("whatsapp")
      .eq("whatsapp_lid", mensagem.lid)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    mensagem.telefone = data?.whatsapp ?? null;
  }

  const respostas = await responderNoCentral(mensagem, dependenciasReais(central.instanceName, payload));
  if (mensagem.telefone) {
    for (const texto of respostas) {
      await enviarMensagemWhatsapp({ instanceName: central.instanceName, telefone: mensagem.telefone, texto });
    }
  }
  return NextResponse.json({ ok: true, action: "central", respostas: respostas.length });
}
