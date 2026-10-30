import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  baixarMidiaDoProvedor,
  enviarMensagemWhatsapp,
  enviarMensagemWhatsappParaGrupo,
  listarParticipantesDoGrupo,
} from "@/lib/whatsapp/provider";
import { numeroDoJid } from "@/lib/whatsapp/participantesDoGrupo";
import { desembrulhar } from "@/lib/crm/retornoPeloGrupo/identificar";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { pensar } from "./cerebro";
import { responderNoCentral, responderNoGrupo, type Dependencias, type EstadoDoCentral, type MensagemRecebida } from "./conversa";
import { tratarMensagemDoGrupoNoCentral, type DependenciasDoGrupo, type LinhaDaEquipe, type MensagemDeGrupo } from "./grupo";
import { identificarRemetente, type OpcaoDeImobiliaria } from "./identificar";
import { documentoDaMensagem, referenciaDaMensagem } from "./midia";
import { esquecerCentral, lerCentral, type CentralDaPlataforma } from "./numeroDoCentral";
import type { Proposta } from "./proposta";
import { variantesDoTelefone } from "./telefone";
import type { Json } from "@/lib/supabase/types";

/** jsonb aceita o que for serializável; o tipo gerado não conhece as nossas formas. */
const comoJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

/**
 * O webhook do número central da plataforma (0249; plano da onda 0, Task 7).
 *
 * `route.ts` desvia para cá logo depois de ler `instanceName`, antes de toda
 * a lógica de corretor: `resolverInstancia` não acharia o central (não é de
 * corretor) e a mensagem levaria 404.
 *
 * Trata `connection.update` (o estado do central), mensagem privada nova e,
 * da onda 2 em diante, a menção ao central num grupo só da equipe
 * (`grupo.ts`). Transmissão e status são sempre ignorados. O que o próprio
 * central manda volta como `fromMe` e também é ignorado.
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
  return conteudoDaMensagem(data, mensagemId, telefone, lid);
}

/** Texto, áudio, foto ou arquivo: o mesmo para o privado e para o grupo. */
function conteudoDaMensagem(data: Payload, mensagemId: string, telefone: string | null, lid: string | null): MensagemRecebida | null {
  const m = data.message ?? {};
  // Arquivo com legenda chega embrulhado (`documentWithCaptionMessage`).
  const doc = documentoDaMensagem(m);
  const texto: string = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || doc?.caption || "";
  const tipo = m.audioMessage ? "audio" : m.imageMessage || doc ? "imagem" : "texto";
  if (tipo === "texto" && !texto.trim()) return null;
  // Como baixar a foto ou o arquivo de novo no "sim" (anexar documento, onda
  // 2): só as chaves da mídia, nunca o conteúdo nem a miniatura.
  const referencia = tipo === "imagem" ? referenciaDaMensagem(data) : null;
  const midia = referencia ? { midia: referencia } : {};
  // Arquivo (PDF, planilha, foto mandada "como documento") segue no tipo
  // "imagem" do registro. A conversa só baixa a planilha, e só com a onda 2.
  if (tipo === "imagem" && !m.imageMessage) {
    const tamanho = Number(doc?.fileLength?.low ?? doc?.fileLength);
    const arquivo = {
      nome: typeof doc?.fileName === "string" ? doc.fileName : typeof doc?.title === "string" ? doc.title : null,
      mimeType: typeof doc?.mimetype === "string" ? doc.mimetype : null,
      tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null,
    };
    return { mensagemId, telefone, lid, tipo, texto, documento: true, arquivo, ...midia };
  }
  return { mensagemId, telefone, lid, tipo, texto, ...midia };
}

/**
 * A mensagem de GRUPO que chegou ao central (4.1), ou `null` quando não é
 * para tratar (não é grupo, é do próprio central, sem id, vazia). Quem
 * escreveu vem de `participant`/`participantPn`/`participantAlt`/`senderPn`,
 * como no retorno pelo grupo; a menção, de todo `contextInfo` (a Evolution
 * copia para `data.contextInfo` em algumas versões; o original mora no tipo
 * da mensagem). "Mensagens temporárias" chegam embrulhadas.
 */
export function lerMensagemDeGrupoNoCentral(payload: Payload): MensagemDeGrupo | null {
  const data = payload.data ?? {};
  const key = data.key ?? {};
  const grupoJid: string = key.remoteJid || payload.remoteJid || "";
  if (!/@g\.us$/i.test(grupoJid)) return null;
  if (key.fromMe || payload.fromMe) return null;
  const mensagemId: string | null = key.id || payload.messageId || null;
  if (!mensagemId) return null;

  const ids = [key.participant, key.participantPn, key.participantAlt, key.senderPn, data.participant, data.senderPn].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  const telefone = ids.map(numeroDoJid).find((n): n is string => n !== null) ?? null;
  const lid = ids.find((i) => /^\d+@lid$/i.test(i.trim()))?.trim() ?? null;

  const message: Payload = desembrulhar(data.message) ?? {};
  const contextos = [data.contextInfo, message.contextInfo, ...Object.values(message).map((v) => (v as Payload | null)?.contextInfo)].filter(
    (c): c is Payload => typeof c === "object" && c !== null,
  );
  const mencionados = [
    ...new Set(contextos.flatMap((c) => (Array.isArray(c.mentionedJid) ? c.mentionedJid : [])).filter((j): j is string => typeof j === "string")),
  ];
  // Resposta a uma mensagem: o autor dela (o central, quando citam o que ele disse).
  const citado =
    contextos.map((c) => (c.stanzaId || c.quotedMessage ? c.participant : null)).find((p): p is string => typeof p === "string" && p !== "") ??
    null;

  const mensagem = conteudoDaMensagem({ ...data, message }, mensagemId, telefone, lid);
  if (!mensagem) return null;
  return { grupoJid, mensagem, autor: { telefone, lid }, mencionados, citado };
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
    // Mesmo caminho do áudio: a Evolution decifra pela mensagem inteira. Nunca
    // a `url` do webhook, que é o arquivo cifrado do WhatsApp. Serve à foto e,
    // na onda 2, à planilha mandada como arquivo.
    baixarImagem: () =>
      baixarMidiaDoProvedor({ instanceName, messageId: payload.data?.key?.id, mensagemCompleta: payload.data }),
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

/**
 * Os corretores ATIVOS que têm algum destes números ou lids, de qualquer
 * imobiliária: é o que mostra que o grupo tem gente de outra. Erro de
 * leitura é `null`, e o central não fala (falha fechada).
 */
async function lerEquipePorContato(e: { numeros: string[]; lids: string[] }): Promise<LinhaDaEquipe[] | null> {
  const variantes = [...new Set(e.numeros.flatMap(variantesDoTelefone))];
  const lids = e.lids.filter((l) => /^\d+@lid$/i.test(l));
  const filtros = [
    ...(variantes.length > 0 ? [`whatsapp.in.(${variantes.join(",")})`] : []),
    ...(lids.length > 0 ? [`whatsapp_lid.in.(${lids.join(",")})`] : []),
  ];
  if (filtros.length === 0) return [];
  const supabase = createServiceClient();
  const { data: corretores, error } = await supabase
    .from("corretores")
    .select("id, nome, papel, grupo_id, whatsapp, whatsapp_lid")
    .or(filtros.join(","))
    .eq("ativo", true);
  if (error) return null;
  if (!corretores || corretores.length === 0) return [];
  const { data: grupos, error: erroDosGrupos } = await supabase
    .from("grupos")
    .select("id, nome, central_whatsapp_ativo")
    .in("id", [...new Set(corretores.map((c) => c.grupo_id))]);
  if (erroDosGrupos) return null;
  const grupoPorId = new Map((grupos ?? []).map((g) => [g.id, g]));
  return corretores.map((c) => ({
    id: c.id,
    nome: c.nome,
    papel: c.papel,
    grupoId: c.grupo_id,
    imobiliaria: grupoPorId.get(c.grupo_id)?.nome ?? "",
    whatsapp: c.whatsapp,
    whatsappLid: c.whatsapp_lid,
    ligado: grupoPorId.get(c.grupo_id)?.central_whatsapp_ativo === true,
  }));
}

function dependenciasDoGrupo(central: CentralDaPlataforma, grupoJid: string, payload: Payload): DependenciasDoGrupo {
  const daConversa = dependenciasReais(central.instanceName, payload);
  return {
    telefoneDoCentral: central.telefone,
    jaTratada: daConversa.jaTratada,
    participantes: async (jid) => {
      const r = await listarParticipantesDoGrupo(central.instanceName, jid);
      return r.erro ? null : r.participantes;
    },
    equipe: lerEquipePorContato,
    registrarTentativa: daConversa.registrarTentativa,
    // Quem escreveu já foi achado entre os participantes, na imobiliária do
    // grupo: a conversa não procura de novo (nem pergunta "por qual imobiliária").
    responder: (m, remetente) => responderNoGrupo(m, { ...daConversa, identificar: async () => remetente }),
    enviarNoGrupo: async (texto) => (await enviarMensagemWhatsappParaGrupo({ instanceName: central.instanceName, grupoJid, texto })).enviado,
    enviarNoPrivado: async (telefone, texto) => (await enviarMensagemWhatsapp({ instanceName: central.instanceName, telefone, texto })).enviado,
  };
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

  // Grupo (4.1): só com a onda 2, e a regra inteira mora em `grupo.ts`.
  // Antes dela, a mesma resposta de sempre para grupo.
  const jid: string = payload.data?.key?.remoteJid || payload.remoteJid || "";
  if (/@g\.us$/i.test(jid)) {
    const decisao = await tratarMensagemDoGrupoNoCentral(lerMensagemDeGrupoNoCentral(payload), dependenciasDoGrupo(central, jid, payload));
    if (decisao.tipo === "ignorado") {
      return NextResponse.json({ ok: true, ignored: decisao.motivo === "onda" ? "central_sem_mensagem" : `grupo:${decisao.motivo}` });
    }
    return NextResponse.json({ ok: true, action: "central_grupo", noGrupo: decisao.noGrupo, noPrivado: decisao.noPrivado });
  }

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
