import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";

type Supa = ReturnType<typeof createServiceClient>;

/*
 * Lista diária dos leads sem retorno de ligação (spec 7). O gestor não cobra
 * um por um: às 18h ele recebe, no WhatsApp dele, quem foi avisado no grupo há
 * mais de 3 horas e ainda não teve retorno. Não cobra o corretor nem muda dono.
 */

const FUSO = "America/Sao_Paulo";
const HORA_DA_LISTA = 18;
const ESPERA_MINIMA_MS = 3 * 60 * 60_000;
const TITULO = "📋 Leads sem retorno de ligação (hoje, 18h)";

function hojeEmSaoPaulo(agora: Date): { dia: string; hora: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) };
}

/** De 18:00 a 18:59 em São Paulo: o cron passa várias vezes, a trava manda uma. */
export function ehHoraDaLista(agora: Date): boolean {
  return hojeEmSaoPaulo(agora).hora === HORA_DA_LISTA;
}

/** `AAAA-MM-DD` de São Paulo: a trava é por dia de lá, não de UTC. */
export function diaEmSaoPaulo(agora: Date): string {
  return hojeEmSaoPaulo(agora).dia;
}

function haQuantoTempo(desde: Date, agora: Date): string {
  const horas = Math.max(0, Math.floor((agora.getTime() - desde.getTime()) / 3_600_000));
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

function tentativas(n: number): string {
  if (n <= 0) return "nenhuma tentativa";
  return n === 1 ? "1 tentativa" : `${n} tentativas`;
}

type Item = { corretor: string; cliente: string | null; avisadoEm: Date; tentativas: number };

/** Agrupado por corretor (ordem alfabética), mais antigo primeiro. `null` se vazio. */
export function textoDaListaSemRetorno(itens: Item[], agora: Date): string | null {
  if (itens.length === 0) return null;
  const porCorretor = new Map<string, Item[]>();
  for (const item of itens) porCorretor.set(item.corretor, [...(porCorretor.get(item.corretor) ?? []), item]);
  const nomes = [...porCorretor.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const linhas = [TITULO];
  for (const nome of nomes) {
    linhas.push("", `*${nome}*`);
    const dele = [...(porCorretor.get(nome) ?? [])].sort((a, b) => a.avisadoEm.getTime() - b.avisadoEm.getTime());
    for (const item of dele) {
      linhas.push(`• ${item.cliente?.trim() || "Cliente novo"} · ${haQuantoTempo(item.avisadoEm, agora)} · ${tentativas(item.tentativas)}`);
    }
  }
  return linhas.join("\n");
}

/**
 * Manda a lista a cada gestor dos grupos com o envio para grupos ligado. Fora
 * das 18h não faz nada. Nunca lança por um grupo: o erro vai para o log e o
 * próximo segue. Devolve quantas listas saíram.
 */
export async function enviarListasSemRetorno(supabase: Supa, agora: Date = new Date()): Promise<number> {
  if (!ehHoraDaLista(agora)) return 0;
  const { data: grupos, error } = await supabase
    .from("grupos")
    .select("id, envio_grupo_leads_instancia")
    .eq("envio_grupo_leads_ativo", true)
    .not("envio_grupo_leads_instancia", "is", null);
  if (error) {
    console.error("[sem retorno] falha ao ler os grupos:", error.message);
    return 0;
  }
  let enviadas = 0;
  for (const grupo of grupos ?? []) {
    try {
      enviadas += await enviarListaDoGrupo(supabase, grupo.id, grupo.envio_grupo_leads_instancia as string, agora);
    } catch (erro) {
      console.error(`[sem retorno] grupo ${grupo.id}:`, erro);
    }
  }
  return enviadas;
}

async function enviarListaDoGrupo(supabase: Supa, grupoId: string, instanceName: string, agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - ESPERA_MINIMA_MS).toISOString();
  const { data: avisos, error } = await supabase
    .from("lead_envios_grupo")
    .select("lead_id, corretor_id, enviado_em, tentativas_ligacao")
    .eq("grupo_id", grupoId)
    .eq("status", "enviado")
    .is("retorno_em", null)
    .lt("enviado_em", limite)
    .limit(500);
  if (error) throw new Error(`avisos: ${error.message}`);
  if (!avisos?.length) return 0;

  const [{ data: leads, error: erroLeads }, { data: equipe, error: erroEquipe }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nome, corretor_id, trazido_por, etapa")
      .eq("grupo_id", grupoId)
      .in("id", avisos.map((a) => a.lead_id)),
    supabase.from("corretores").select("id, nome, papel, ativo, oculta, whatsapp").eq("grupo_id", grupoId),
  ]);
  if (erroLeads) throw new Error(`leads: ${erroLeads.message}`);
  if (erroEquipe) throw new Error(`equipe: ${erroEquipe.message}`);

  const leadPorId = new Map((leads ?? []).map((l) => [l.id, l]));
  const nomePorCorretor = new Map((equipe ?? []).map((c) => [c.id, c.nome]));
  const itens: Item[] = [];
  for (const aviso of avisos) {
    const lead = leadPorId.get(aviso.lead_id);
    // O lead ainda é de quem foi avisado, a casa trouxe e não acabou.
    if (!lead || lead.corretor_id !== aviso.corretor_id) continue;
    if (lead.trazido_por === "corretor" || lead.etapa === "perdido" || lead.etapa === "fechado") continue;
    if (!aviso.enviado_em) continue;
    itens.push({
      corretor: nomePorCorretor.get(aviso.corretor_id) ?? "Corretor",
      cliente: lead.nome,
      avisadoEm: new Date(aviso.enviado_em),
      tentativas: aviso.tentativas_ligacao ?? 0,
    });
  }
  const texto = textoDaListaSemRetorno(itens, agora);
  if (!texto) return 0;

  const dia = diaEmSaoPaulo(agora);
  const gestores = (equipe ?? []).filter((c) => c.papel === "gestor" && c.ativo && !c.oculta && c.whatsapp);
  let enviadas = 0;
  for (const gestor of gestores) {
    // A trava: dois crons na mesma hora não mandam duas vezes.
    const { data: trava, error: erroTrava } = await supabase
      .from("listas_de_retorno_enviadas")
      .insert({ grupo_id: grupoId, gestor_id: gestor.id, dia })
      .select("id")
      .maybeSingle();
    if (erroTrava || !trava) {
      if (erroTrava && erroTrava.code !== "23505") console.error("[sem retorno] trava:", erroTrava.message);
      continue;
    }
    const envio = await enviarMensagemWhatsapp({ instanceName, telefone: gestor.whatsapp as string, texto });
    if (envio.enviado) {
      enviadas++;
      continue;
    }
    // Não saiu: solta a trava para o próximo tique da mesma hora tentar de novo.
    console.warn("[sem retorno] lista não saiu:", envio.motivo, envio.detalhe);
    await supabase.from("listas_de_retorno_enviadas").delete().eq("id", trava.id).eq("grupo_id", grupoId);
  }
  return enviadas;
}
