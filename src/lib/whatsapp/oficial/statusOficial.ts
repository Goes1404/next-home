import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { registrarConsentimento } from "./consentimento";
import { decidirErroDaMeta } from "./erros";
import { estadoDaMeta } from "./modelos";
import { atualizarNumeroPelaMeta, pausarNumero, type NumeroOficial } from "./numeros";
import type { EventoOficial } from "./webhook";
import { variantesDoTelefone } from "@/lib/central/telefone";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O que a Meta conta DEPOIS do envio: entregue, lida, falhou, cobrada. E o
 * que ela conta sobre a conta: modelo aprovado ou pausado, qualidade e limite
 * do número, conta restrita, pessoa que parou o marketing.
 *
 * O envio só diz "aceito" (o `wamid`). Entrega e falha chegam aqui, minutos
 * depois. É aqui que o 131049 (limite por pessoa) vira nova tentativa em
 * 24 h, que o 131050 vira consentimento revogado, e que um modelo pausado
 * pela Meta pausa as listas que o usam, antes de a lista inteira falhar.
 */

type EventoStatus = Extract<EventoOficial, { tipo: "status" }>;

/** Minutos até a próxima tentativa, a partir de agora. */
const daquiA = (minutos: number) => new Date(Date.now() + minutos * 60_000).toISOString();

export async function aplicarStatus(supabase: Supa, numero: NumeroOficial, ev: EventoStatus): Promise<void> {
  const quando = ev.quando.toISOString();

  // A mensagem da conversa oficial (lista ou resposta da IA).
  const statusDaMensagem =
    ev.status === "failed"
      ? ("falhou" as const)
      : ev.status === "read"
        ? ("lida" as const)
        : ev.status === "delivered"
          ? ("entregue" as const)
          : ("enviada" as const);
  const atualizacaoDaMensagem: Database["public"]["Tables"]["whatsapp_oficial_mensagens"]["Update"] = {
    status_entrega: statusDaMensagem,
  };
  if (ev.erro) {
    atualizacaoDaMensagem.erro_codigo = ev.erro.codigo;
    atualizacaoDaMensagem.erro_detalhe = ev.erro.detalhe ?? ev.erro.titulo;
  }
  if (ev.cobranca) {
    atualizacaoDaMensagem.cobranca_categoria = ev.cobranca.categoria;
    atualizacaoDaMensagem.cobrada = ev.cobranca.cobrada;
  }
  // "Lida" não volta para "entregue": os status chegam fora de ordem às vezes.
  let mensagem = supabase
    .from("whatsapp_oficial_mensagens")
    .update(atualizacaoDaMensagem)
    .eq("grupo_id", numero.grupo_id)
    .eq("wamid", ev.wamid);
  if (ev.status === "delivered") mensagem = mensagem.neq("status_entrega", "lida");
  if (ev.status === "sent") mensagem = mensagem.is("status_entrega", null);
  const { error: erroMensagem } = await mensagem;
  if (erroMensagem) console.warn("[oficial] status na mensagem:", erroMensagem.message);

  // O item da lista.
  const { data: item } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id, campanha_id, lead_id, status, tentativas, erro_meta_codigo, entregue_em, lido_em")
    .eq("grupo_id", numero.grupo_id)
    .eq("wamid", ev.wamid)
    .maybeSingle();
  if (!item) return;

  const cobranca = ev.cobranca
    ? { cobranca_categoria: ev.cobranca.categoria, cobrada: ev.cobranca.cobrada }
    : {};

  if (ev.status === "delivered" || ev.status === "read") {
    await supabase
      .from("whatsapp_campanhas_fila")
      .update({
        ...cobranca,
        entregue_em: item.entregue_em ?? quando,
        ...(ev.status === "read" ? { lido_em: item.lido_em ?? quando } : {}),
      })
      .eq("id", item.id);
    return;
  }
  if (ev.status === "sent") {
    if (ev.cobranca) await supabase.from("whatsapp_campanhas_fila").update(cobranca).eq("id", item.id);
    return;
  }

  // Falhou depois de aceita.
  const decisao = decidirErroDaMeta({ codigo: ev.erro?.codigo ?? null });
  const base = { erro_meta_codigo: ev.erro?.codigo ?? null, erro_motivo: decisao.motivo, wamid: null, ...cobranca };

  if (decisao.tipo === "reagendar") {
    // 131049 volta UMA vez, 24 h depois (a Meta: tentar antes só piora).
    const jaVoltouPeloMesmo = decisao.umaVez && item.erro_meta_codigo === ev.erro?.codigo;
    const esgotou = !decisao.umaVez && (item.tentativas ?? 0) >= 3;
    await supabase
      .from("whatsapp_campanhas_fila")
      .update(
        jaVoltouPeloMesmo || esgotou
          ? { ...base, status: "erro" as const }
          : { ...base, status: "pendente" as const, agendado_para: daquiA(decisao.minutos), enviado_em: null },
      )
      .eq("id", item.id);
    return;
  }

  if (decisao.tipo === "optout") {
    await supabase.from("whatsapp_campanhas_fila").update({ ...base, status: "erro" }).eq("id", item.id);
    if (item.lead_id) await registrarConsentimento(supabase, { leadId: item.lead_id, concedido: false, origem: "meta_131050" });
    return;
  }

  if (decisao.tipo === "pausar_lista") {
    // Nada desta lista sai com este modelo: o item volta à fila e a lista
    // pausa com o motivo à vista. Retomar depois de trocar o modelo.
    await supabase
      .from("whatsapp_campanhas_fila")
      .update({ ...base, status: "pendente", enviado_em: null })
      .eq("id", item.id);
    await supabase
      .from("whatsapp_campanhas")
      .update({ status: "pausada", pausa_automatica: decisao.motivo })
      .eq("id", item.campanha_id)
      .eq("status", "em_andamento");
    return;
  }

  if (decisao.tipo === "pausar_numero") {
    await supabase
      .from("whatsapp_campanhas_fila")
      .update({ ...base, status: "pendente", enviado_em: null })
      .eq("id", item.id);
    await pausarNumero(supabase, numero.id, decisao.motivo);
    return;
  }

  // Definitivo (número sem WhatsApp, dado inválido) ou incerto.
  await supabase.from("whatsapp_campanhas_fila").update({ ...base, status: "erro" }).eq("id", item.id);
}

type EventoModelo = Extract<EventoOficial, { tipo: "modelo" }>;

/** Aprovado, reprovado, pausado ou desativado pela Meta. */
export async function aplicarEstadoDoModelo(supabase: Supa, numeros: NumeroOficial[], ev: EventoModelo): Promise<void> {
  const estado = estadoDaMeta(ev.evento);
  if (!estado || numeros.length === 0) return;
  const ids = numeros.map((n) => n.id);

  let consulta = supabase
    .from("whatsapp_modelos_oficiais")
    .update({ estado, motivo: ev.motivo, atualizado_em: new Date().toISOString() })
    .in("numero_oficial_id", ids);
  consulta = ev.metaId ? consulta.eq("meta_id", ev.metaId) : consulta.eq("nome", ev.nome ?? "");
  if (ev.idioma && !ev.metaId) consulta = consulta.eq("idioma", ev.idioma);
  const { data: modelos, error } = await consulta.select("id, nome");
  if (error) {
    console.warn("[oficial] estado do modelo não gravado:", error.message);
    return;
  }

  // Modelo pausado ou desativado: as listas que o usam param ANTES de cada
  // item falhar com 132015/132016 e gastar a vez da fila à toa.
  if ((estado === "pausado" || estado === "desativado") && modelos?.length) {
    const motivo =
      estado === "pausado"
        ? `A Meta pausou o modelo "${modelos[0].nome}" por baixa qualidade. Troque ou edite o modelo para retomar.`
        : `A Meta desativou o modelo "${modelos[0].nome}". Crie um modelo novo para retomar.`;
    await supabase
      .from("whatsapp_campanhas")
      .update({ status: "pausada", pausa_automatica: motivo })
      .in(
        "modelo_oficial_id",
        modelos.map((m) => m.id),
      )
      .eq("status", "em_andamento");
  }
}

type EventoQualidadeModelo = Extract<EventoOficial, { tipo: "qualidade_do_modelo" }>;

export async function aplicarQualidadeDoModelo(
  supabase: Supa,
  numeros: NumeroOficial[],
  ev: EventoQualidadeModelo,
): Promise<void> {
  if (!ev.metaId || numeros.length === 0) return;
  await supabase
    .from("whatsapp_modelos_oficiais")
    .update({ qualidade: ev.qualidade, atualizado_em: new Date().toISOString() })
    .in(
      "numero_oficial_id",
      numeros.map((n) => n.id),
    )
    .eq("meta_id", ev.metaId);
}

/**
 * Qualidade ou limite do número mudou: pergunta à Meta o estado completo em
 * vez de interpretar cada nome de evento (que a Meta muda de tempos em
 * tempos). Uma chamada por evento, e eles são raros.
 */
export async function aplicarQualidadeDoNumero(supabase: Supa, numeros: NumeroOficial[]): Promise<void> {
  for (const numero of numeros) await atualizarNumeroPelaMeta(supabase, numero);
}

type EventoConta = Extract<EventoOficial, { tipo: "conta" }>;

/** Conta restrita, desativada ou banida: o número pausa com o motivo. */
export async function aplicarEventoDaConta(supabase: Supa, numeros: NumeroOficial[], ev: EventoConta): Promise<void> {
  const evento = (ev.evento ?? "").toUpperCase();
  const grave = ["DISABLED_UPDATE", "ACCOUNT_RESTRICTION", "ACCOUNT_VIOLATION", "BANNED", "ACCOUNT_DELETED"].some((e) =>
    evento.includes(e),
  );
  if (!grave) return;
  for (const numero of numeros) {
    await pausarNumero(
      supabase,
      numero.id,
      `A Meta informou "${ev.evento}" para a conta${ev.detalhe ? ` (${ev.detalhe})` : ""}. Confira no WhatsApp Manager.`,
    );
  }
}

type EventoPreferencia = Extract<EventoOficial, { tipo: "preferencia" }>;

/**
 * A pessoa parou (ou voltou a aceitar) marketing pelo próprio WhatsApp. Vale
 * para todo cadastro do grupo com esse telefone.
 */
export async function aplicarPreferencia(supabase: Supa, numero: NumeroOficial, ev: EventoPreferencia): Promise<void> {
  const variantes = variantesDoTelefone(ev.de).filter((v) => v.startsWith("55"));
  const formas = variantes.length > 0 ? variantes : [ev.de];
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("grupo_id", numero.grupo_id)
    .in("telefone_e164", formas);
  for (const lead of leads ?? []) {
    await registrarConsentimento(supabase, {
      leadId: lead.id,
      concedido: ev.valor === "resume",
      origem: ev.valor === "resume" ? "meta_preferencia_voltou" : "meta_preferencia_parou",
    });
  }
}
