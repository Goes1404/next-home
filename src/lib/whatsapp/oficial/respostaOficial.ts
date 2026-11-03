import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/central/telefone";
import { avisarClienteRespondeu } from "@/lib/notificacoes/clienteRespondeu";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { getEmpreendimentos } from "@/lib/queries";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { horariosDeVisitaSeguros } from "@/lib/crm/agendaDoCorretor";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { lerCasaDoGrupo } from "@/lib/whatsapp/casaDoGrupo";
import { detectarRecusa } from "@/lib/whatsapp/recusaDoCliente";
import { agendarVisitaLead, buscarDossieAtual, destravarDisparo, travarDisparo, validarDataVisita } from "@/lib/whatsapp/repositorio";
import type { Fala } from "@/lib/whatsapp/rajada";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { registrarConsentimento } from "./consentimento";
import { enviarImagemOficial, enviarTextoOficial, marcarLidaEDigitando, type Remetente } from "./envio";
import { PAYLOAD_PARAR } from "./modelos";
import { tokenDoNumero, type NumeroOficial } from "./numeros";
import type { EventoOficial } from "./webhook";

type Supa = ReturnType<typeof createServiceClient>;
type EventoMensagem = Extract<EventoOficial, { tipo: "mensagem" }>;

/**
 * A resposta de um cliente ao número OFICIAL (F3 do roadmap).
 *
 * O desenho é o da opção A: a primeira mensagem fria saiu do número oficial;
 * quem responde vira lead quente e o corretor dono assume pelo WhatsApp dele.
 * Até ele assumir, a IA de sempre (`executarTurnoDeAtendimento`, o mesmo
 * turno do webhook da Evolution, do eval e do playground) responde DENTRO da
 * janela de 24 h que a fala do cliente abriu.
 *
 * Em ordem:
 *   1. a fala é gravada uma vez só (a Meta reentrega: o `wamid` é único);
 *   2. a resposta conta para a lista;
 *   3. "Parar de receber" (botão ou texto) revoga o marketing, tira o lead
 *      das listas e responde só a confirmação;
 *   4. o corretor dono é avisado no celular (o gestor não lê conversa, 0134);
 *   5. a IA responde, se o gestor deixou, a cota permite e ninguém assumiu.
 *
 * O que fica DE FORA de propósito, comparado ao webhook da Evolution:
 * dossiê, memória, telemetria por interação, co-piloto e palavra-chave. O
 * número oficial não é o WhatsApp de ninguém: não há fala do corretor para
 * ler, e a conversa é curta por desenho (vai para o corretor). Visita
 * confirmada pela IA vira visita de verdade, como lá.
 */

const JANELA_HORAS = 24;
/** Quanto esperar por mais falas da mesma rajada antes de responder. */
const ESPERA_DA_RAJADA_MS = 4_000;

export async function receberMensagemOficial(supabase: Supa, numero: NumeroOficial, ev: EventoMensagem): Promise<void> {
  const telefone = telefoneCanonico(ev.de);
  const janelaAte = new Date(ev.quando.getTime() + JANELA_HORAS * 3_600_000).toISOString();

  const listaRespondida = ev.respondeA ? await itemPeloWamid(supabase, numero.grupo_id, ev.respondeA) : null;
  const conversaExistente = await conversaDoTelefone(supabase, numero.id, telefone);
  const leadId =
    listaRespondida?.lead_id ?? conversaExistente?.lead_id ?? (await leadPeloTelefone(supabase, numero.grupo_id, ev.de));
  const lead = leadId ? await lerLead(supabase, leadId) : null;

  // 1. A conversa e a fala.
  const conversa = await gravarConversa(supabase, {
    numero,
    telefone,
    existente: conversaExistente,
    leadId: lead?.id ?? null,
    corretorId: lead?.corretor_id ?? null,
    nome: ev.nome,
    janelaAte,
    ultimaMensagem: ev.conteudo,
    quando: ev.quando.toISOString(),
  });
  if (!conversa) return;

  const { error: erroDaFala } = await supabase.from("whatsapp_oficial_mensagens").insert({
    conversa_id: conversa.id,
    remetente: "cliente",
    tipo: ev.tipoDaMensagem,
    conteudo: ev.conteudo,
    wamid: ev.wamid,
    created_at: ev.quando.toISOString(),
  });
  if (erroDaFala) {
    // 23505 = a Meta mandou a mesma mensagem de novo: já foi tratada.
    if (erroDaFala.code !== "23505") console.error("[oficial] fala do cliente não gravada:", erroDaFala.message);
    return;
  }

  // 2. Conta como resposta à lista.
  if (lead) await marcarRespostaDaListaOficial(supabase, numero, lead.id, listaRespondida?.id ?? null);

  const remetente = remetenteDo(numero);

  // 3. Parar de receber.
  const recusa = ev.payloadDoBotao === PAYLOAD_PARAR ? null : detectarRecusa(ev.conteudo, { ofereceuParar: true });
  if (ev.payloadDoBotao === PAYLOAD_PARAR || recusa?.familia === "parada") {
    await pararDeReceber(supabase, {
      numero,
      conversaId: conversa.id,
      lead,
      telefone,
      origem: ev.payloadDoBotao === PAYLOAD_PARAR ? "botao_parar" : "mensagem_parar",
      trecho: recusa?.trecho ?? ev.conteudo,
      remetente,
    });
    return;
  }

  // Sem cadastro no CRM: agradece uma vez e chama o gestor (só o telefone).
  if (!lead) {
    if (!conversa.avisado_em) {
      const casa = await lerCasaDoGrupo(numero.grupo_id);
      await responder(
        supabase,
        remetente,
        conversa.id,
        telefone,
        `Obrigado pela mensagem! Alguém da ${casa.nomeDaCasa ?? "nossa equipe"} vai falar com você em seguida.`,
      );
      await supabase.from("whatsapp_oficial_conversas").update({ avisado_em: new Date().toISOString() }).eq("id", conversa.id);
      await avisarGestores(supabase, numero.grupo_id, telefone);
    }
    return;
  }

  // 4. O corretor dono fica sabendo (carência de 15 min por lead, como lá).
  if (lead.corretor_id) {
    await avisarClienteRespondeu(supabase, {
      leadId: lead.id,
      conversaId: conversa.id,
      corretorIdDoNumero: lead.corretor_id,
      grupoIdDoNumero: numero.grupo_id,
      texto: ev.conteudo,
      tipo: ev.tipoDaMensagem === "texto" ? "texto" : ev.tipoDaMensagem,
      url: `/corretor/leads/${lead.id}#numero-oficial`,
    });
  }
  if (!conversa.avisado_em) {
    await supabase.from("whatsapp_oficial_conversas").update({ avisado_em: new Date().toISOString() }).eq("id", conversa.id);
    await supabase.from("lead_interacoes").insert({
      lead_id: lead.id,
      corretor_id: null,
      tipo: "sistema",
      conteudo: "Respondeu à mensagem da lista pelo número oficial da imobiliária.",
      detalhes: { canal: "oficial", conversa_oficial_id: conversa.id },
    });
  }

  // 5. Quem responde.
  if (conversa.assumida_em || !conversa.ia_ativa || lead.nao_contatar_em) return;
  if (numero.resposta === "nenhuma") return;
  if (numero.resposta === "mensagem_fixa") {
    if (numero.mensagem_fixa?.trim() && (await semRespostaNossaDesde(supabase, conversa.id, ev.quando))) {
      await responder(supabase, remetente, conversa.id, telefone, numero.mensagem_fixa.trim());
    }
    return;
  }

  await responderComIA(supabase, { numero, conversaId: conversa.id, telefone, lead, wamid: ev.wamid, quando: ev.quando, remetente });
}

// ---------------------------------------------------------------------------
// A IA
// ---------------------------------------------------------------------------

async function responderComIA(
  supabase: Supa,
  p: {
    numero: NumeroOficial;
    conversaId: string;
    telefone: string;
    lead: LeadDaConversa;
    wamid: string;
    quando: Date;
    remetente: Remetente | null;
  },
): Promise<void> {
  const { numero, lead } = p;
  if (!p.remetente || !lead.corretor_id) return;

  // Rajada: a fala seguinte, se vier, responde pelas duas.
  await new Promise((r) => setTimeout(r, ESPERA_DA_RAJADA_MS));
  const { data: ultima } = await supabase
    .from("whatsapp_oficial_mensagens")
    .select("wamid, remetente")
    .eq("conversa_id", p.conversaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima || ultima.remetente !== "cliente" || ultima.wamid !== p.wamid) return;

  const escopo = `oficial-conversa:${p.conversaId}`;
  const dono = `oficial-${crypto.randomUUID()}`;
  if (!(await travarDisparo(escopo, dono, 90))) return;

  try {
    const corretor = await lerCorretor(supabase, lead.corretor_id);
    const [cota, suspenso] = await Promise.all([lerCotaDaIa(numero.grupo_id), grupoSuspenso(numero.grupo_id)]);
    if (!corretor || cota.nivel === "esgotada" || suspenso) {
      // Sem IA: a resposta fixa, uma vez, para o cliente não ficar no vácuo.
      if (await semRespostaNossaDesde(supabase, p.conversaId, p.quando)) {
        await responder(
          supabase,
          p.remetente,
          p.conversaId,
          p.telefone,
          `Obrigado pela resposta! ${corretor?.nome ? primeiroNome(corretor.nome) : "Nossa equipe"} vai falar com você em seguida pelo WhatsApp.`,
        );
      }
      return;
    }

    await marcarLidaEDigitando(p.remetente, p.wamid);

    const [catalogo, historico, casa, dossie, horarios, parametros, contexto] = await Promise.all([
      getEmpreendimentos(numero.grupo_id).catch(() => []),
      historicoDaConversa(supabase, p.conversaId),
      lerCasaDoGrupo(numero.grupo_id),
      buscarDossieAtual(lead.id).catch(() => null),
      horariosDeVisitaSeguros(lead.corretor_id),
      getParametrosCredito(numero.grupo_id).catch(() => undefined),
      contextoDaLista(supabase, lead.id),
    ]);

    const turno = await executarTurnoDeAtendimento({
      quemPaga: { corretorId: lead.corretor_id, grupoId: numero.grupo_id },
      identidade: {
        nomeCorretor: corretor.nome,
        slugCorretor: corretor.slug ?? undefined,
        creciCorretor: corretor.creci ?? "",
        telefoneCorretor: corretor.whatsapp ?? "",
        nomeAssistente: corretor.nomeAssistente,
        tomVoz: corretor.tomVoz,
        regrasDaIa: corretor.regrasDaIa,
        casa,
      },
      catalogo,
      historico,
      dossie,
      visitaMarcadaEm: lead.visita_agendada_em,
      horariosReais: horarios,
      parametrosCredito: parametros,
      instrucaoExtra: [instrucaoDoCanalOficial(casa.nomeDaCasa ?? "imobiliária", corretor.nome), contexto].filter(Boolean).join(" "),
    });

    // Um balão só: no número oficial, cada mensagem nossa é uma mensagem de
    // serviço (grátis até 1.000 por mês por número, cobrada depois desde
    // 01/10/2026). Quebrar em três triplicaria a conta sem ganho.
    const texto = turno.baloes.join("\n\n").trim();
    if (texto) await responder(supabase, p.remetente, p.conversaId, p.telefone, texto);
    for (const anexo of turno.anexos.slice(0, 3)) {
      if (anexo.tipo === "foto" || anexo.tipo === "planta") {
        const r = await enviarImagemOficial({ remetente: p.remetente, telefone: p.telefone, link: anexo.url, legenda: anexo.titulo });
        await gravarNossa(supabase, p.conversaId, anexo.titulo || "[foto]", r.enviado ? r.wamid : null, "imagem");
      } else {
        await responder(supabase, p.remetente, p.conversaId, p.telefone, `${anexo.titulo}: ${anexo.url}`);
      }
    }

    // Visita confirmada pela IA vira compromisso de verdade, como no webhook
    // da Evolution; e o corretor fica sabendo na hora.
    const proposta = turno.resposta.visitaProposta;
    if (proposta?.confirmadaPeloCliente) {
      const data = validarDataVisita(proposta.dataHoraISO);
      if (data && (await agendarVisitaLead(lead.id, data))) {
        await notificarCorretor(supabase, lead.corretor_id, {
          titulo: "Visita marcada pelo número oficial",
          corpo: `${lead.nome ?? "O cliente"} confirmou a visita para ${data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.`,
          url: `/corretor/leads/${lead.id}`,
          tag: `oficial-visita-${lead.id}`,
        });
      }
    } else if (turno.resposta.transferirHumano) {
      await notificarCorretor(supabase, lead.corretor_id, {
        titulo: "O cliente quer falar com você",
        corpo: `${lead.nome ?? "O cliente"} pediu atendimento pelo número oficial. Assuma pelo seu WhatsApp.`,
        url: `/corretor/leads/${lead.id}#numero-oficial`,
        tag: `oficial-humano-${lead.id}`,
      });
    }
  } catch (erro) {
    console.error("[oficial] a IA não respondeu:", erro);
  } finally {
    await destravarDisparo(escopo, dono);
  }
}

/** O que a IA precisa saber sobre ESTE canal, que não é o do corretor. */
export function instrucaoDoCanalOficial(nomeDaCasa: string, nomeDoCorretor: string): string {
  const corretor = primeiroNome(nomeDoCorretor);
  return [
    `CANAL: você está respondendo pelo número OFICIAL da ${nomeDaCasa}, não pelo WhatsApp pessoal de ${corretor}.`,
    `A conversa começou com uma mensagem de lista da imobiliária e vai passar para ${corretor}, que é quem atende este cliente.`,
    `Tire as dúvidas e qualifique como sempre. Quando o cliente pedir para falar com alguém, pedir ligação, quiser negociar valor ou fechar, diga que ${corretor} vai chamar pelo WhatsApp dele em seguida.`,
    "Não peça para o cliente mudar de número nem passar dados que ele não ofereceu.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Parar de receber
// ---------------------------------------------------------------------------

async function pararDeReceber(
  supabase: Supa,
  p: {
    numero: NumeroOficial;
    conversaId: string;
    lead: LeadDaConversa | null;
    telefone: string;
    origem: "botao_parar" | "mensagem_parar";
    trecho: string;
    remetente: Remetente | null;
  },
): Promise<void> {
  await supabase.from("whatsapp_oficial_conversas").update({ ia_ativa: false, atualizado_em: new Date().toISOString() }).eq("id", p.conversaId);

  if (p.lead) {
    await registrarConsentimento(supabase, { leadId: p.lead.id, concedido: false, origem: p.origem });
    // A mesma marca do "me tira da lista" da Evolution (registrarParadaSemIA):
    // sai de TODAS as listas, e a conversa continua possível com o corretor.
    const { data: marcado } = await supabase
      .from("leads")
      .update({ nao_contatar_em: new Date().toISOString(), nao_contatar_motivo: "parada" })
      .eq("id", p.lead.id)
      .is("nao_contatar_em", null)
      .select("id");
    await supabase.from("whatsapp_campanhas_fila").delete().eq("lead_id", p.lead.id).eq("status", "pendente");
    if (marcado?.length) {
      await supabase.from("lead_interacoes").insert({
        lead_id: p.lead.id,
        corretor_id: null,
        tipo: "sistema",
        conteudo: "Pediu para não receber mais mensagens (número oficial). Saiu das listas de transmissão; a conversa continua com o corretor.",
        detalhes: { familia: "parada", canal: "oficial", origem: p.origem, conversa_oficial_id: p.conversaId },
      });
      if (p.lead.corretor_id) {
        await notificarCorretor(supabase, p.lead.corretor_id, {
          titulo: "Pediu para não receber mais",
          corpo: `${p.lead.nome ?? "Um cliente"} pediu para sair das listas pelo número oficial. Se foi engano, dá para reverter na ficha.`,
          url: `/corretor/leads/${p.lead.id}`,
          tag: `oficial-parou-${p.lead.id}`,
        });
      }
    }
  }

  await responder(
    supabase,
    p.remetente,
    p.conversaId,
    p.telefone,
    "Pronto! Você não vai mais receber nossas mensagens por aqui. Se precisar de algo, é só chamar.",
  );
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

type LeadDaConversa = {
  id: string;
  nome: string | null;
  corretor_id: string | null;
  nao_contatar_em: string | null;
  visita_agendada_em: string | null;
};

type ConversaOficial = {
  id: string;
  lead_id: string | null;
  avisado_em: string | null;
  assumida_em: string | null;
  ia_ativa: boolean;
};

function remetenteDo(numero: NumeroOficial): Remetente | null {
  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) {
    console.warn(`[oficial] sem token para responder pelo número ${numero.id}: ${credencial.erro}`);
    return null;
  }
  return { phoneNumberId: numero.phone_number_id, token: credencial.token };
}

async function itemPeloWamid(supabase: Supa, grupoId: string, wamid: string) {
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id, lead_id")
    .eq("grupo_id", grupoId)
    .eq("wamid", wamid)
    .maybeSingle();
  return data;
}

async function conversaDoTelefone(supabase: Supa, numeroId: string, telefone: string): Promise<ConversaOficial | null> {
  const { data } = await supabase
    .from("whatsapp_oficial_conversas")
    .select("id, lead_id, avisado_em, assumida_em, ia_ativa")
    .eq("numero_oficial_id", numeroId)
    .eq("telefone", telefone)
    .maybeSingle();
  return data;
}

/** O cadastro mais recente do grupo com este telefone, fora os arquivados. */
async function leadPeloTelefone(supabase: Supa, grupoId: string, waId: string): Promise<string | null> {
  const formas = variantesDoTelefone(waId).filter((v) => v.startsWith("55"));
  if (formas.length === 0) return null;
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("grupo_id", grupoId)
    .in("telefone_e164", formas)
    .is("arquivado_em", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function lerLead(supabase: Supa, leadId: string): Promise<LeadDaConversa | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, corretor_id, nao_contatar_em, visita_agendada_em")
    .eq("id", leadId)
    .maybeSingle();
  return data;
}

async function gravarConversa(
  supabase: Supa,
  p: {
    numero: NumeroOficial;
    telefone: string;
    existente: ConversaOficial | null;
    leadId: string | null;
    corretorId: string | null;
    nome: string | null;
    janelaAte: string;
    ultimaMensagem: string;
    quando: string;
  },
): Promise<ConversaOficial | null> {
  const campos = {
    janela_ate: p.janelaAte,
    ultima_mensagem: p.ultimaMensagem.slice(0, 500),
    ultima_interacao_em: p.quando,
    atualizado_em: new Date().toISOString(),
    ...(p.leadId ? { lead_id: p.leadId, corretor_id: p.corretorId } : {}),
    ...(p.nome ? { nome_cliente: p.nome } : {}),
  };
  if (p.existente) {
    const { data, error } = await supabase
      .from("whatsapp_oficial_conversas")
      .update(campos)
      .eq("id", p.existente.id)
      .select("id, lead_id, avisado_em, assumida_em, ia_ativa")
      .single();
    if (error) console.error("[oficial] conversa não atualizada:", error.message);
    return data ?? p.existente;
  }
  const { data, error } = await supabase
    .from("whatsapp_oficial_conversas")
    .upsert(
      { grupo_id: p.numero.grupo_id, numero_oficial_id: p.numero.id, telefone: p.telefone, ...campos },
      { onConflict: "numero_oficial_id,telefone" },
    )
    .select("id, lead_id, avisado_em, assumida_em, ia_ativa")
    .single();
  if (error) {
    console.error("[oficial] conversa não criada:", error.message);
    return null;
  }
  return data;
}

/**
 * A resposta conta para a lista: o item que a pessoa respondeu (o botão traz
 * o `wamid`), ou o último item oficial enviado a ela nos últimos 30 dias.
 */
async function marcarRespostaDaListaOficial(
  supabase: Supa,
  numero: NumeroOficial,
  leadId: string,
  itemId: string | null,
): Promise<void> {
  let alvo = itemId;
  if (!alvo) {
    const { data: listas } = await supabase
      .from("whatsapp_campanhas")
      .select("id")
      .eq("numero_oficial_id", numero.id)
      .eq("canal", "oficial");
    const ids = (listas ?? []).map((l) => l.id);
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id")
      .eq("lead_id", leadId)
      .in("campanha_id", ids)
      .eq("status", "enviado")
      .gte("enviado_em", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("enviado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    alvo = data?.id ?? null;
  }
  if (!alvo) return;

  const { data: mudou } = await supabase
    .from("whatsapp_campanhas_fila")
    .update({ status: "respondido", resposta_em: new Date().toISOString() })
    .eq("id", alvo)
    .eq("status", "enviado")
    .select("campanha_id");
  const campanhaId = mudou?.[0]?.campanha_id;
  if (!campanhaId) return;
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .eq("status", "respondido");
  await supabase.from("whatsapp_campanhas").update({ total_respondidos: count ?? 0 }).eq("id", campanhaId);
}

/** As últimas 40 falas, em ordem, no formato do turno. */
async function historicoDaConversa(supabase: Supa, conversaId: string): Promise<Fala[]> {
  const { data } = await supabase
    .from("whatsapp_oficial_mensagens")
    .select("remetente, conteudo, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data ?? [])
    .reverse()
    .filter((m) => m.remetente !== "sistema" && m.conteudo.trim())
    .map((m) => ({
      remetente: m.remetente === "cliente" ? ("cliente" as const) : m.remetente === "corretor" ? ("corretor" as const) : ("bot" as const),
      texto: m.conteudo,
      em: m.created_at,
    }));
}

/** A mensagem da lista que abriu esta conversa, para a IA continuar dela. */
async function contextoDaLista(supabase: Supa, leadId: string): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("mensagem_personalizada, enviado_em, campanha:whatsapp_campanhas!inner(titulo, canal)")
    .eq("lead_id", leadId)
    .eq("campanha.canal", "oficial")
    .in("status", ["enviado", "respondido"])
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.mensagem_personalizada) return null;
  const campanha = (Array.isArray(data.campanha) ? data.campanha[0] : data.campanha) as { titulo: string | null } | null;
  return `CONTEXTO: nós mandamos a este cliente a mensagem${campanha?.titulo ? ` da lista "${campanha.titulo}"` : ""}: «${data.mensagem_personalizada
    .replace(/\s+/g, " ")
    .slice(0, 400)}». A fala dele responde a ela: continue dali, sem se apresentar de novo.`;
}

async function lerCorretor(supabase: Supa, corretorId: string) {
  const [{ data: corretor }, { data: instancia }] = await Promise.all([
    supabase.from("corretores").select("nome, creci, slug, whatsapp").eq("id", corretorId).maybeSingle(),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("nome_assistente, tom_voz, regras_da_ia")
      .eq("corretor_id", corretorId)
      .maybeSingle(),
  ]);
  if (!corretor) return null;
  return {
    nome: corretor.nome,
    creci: corretor.creci,
    slug: corretor.slug,
    whatsapp: corretor.whatsapp,
    nomeAssistente: instancia?.nome_assistente ?? "Sofia",
    tomVoz: instancia?.tom_voz ?? "consultivo_alto_padrao",
    regrasDaIa: instancia?.regras_da_ia ?? null,
  };
}

/** Já mandamos alguma coisa nesta conversa depois desta fala? */
async function semRespostaNossaDesde(supabase: Supa, conversaId: string, desde: Date): Promise<boolean> {
  const { count } = await supabase
    .from("whatsapp_oficial_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", conversaId)
    .in("remetente", ["bot", "corretor"])
    .gte("created_at", new Date(desde.getTime() - JANELA_HORAS * 3_600_000).toISOString());
  return (count ?? 0) === 0;
}

async function responder(
  supabase: Supa,
  remetente: Remetente | null,
  conversaId: string,
  telefone: string,
  texto: string,
): Promise<void> {
  if (!remetente) return;
  const r = await enviarTextoOficial({ remetente, telefone, texto });
  if (!r.enviado) console.warn(`[oficial] resposta não saiu (${r.erro.codigo ?? "rede"}): ${r.erro.detalhe ?? r.erro.mensagem}`);
  await gravarNossa(supabase, conversaId, texto, r.enviado ? r.wamid : null, "texto", r.enviado ? null : r.erro);
}

async function gravarNossa(
  supabase: Supa,
  conversaId: string,
  texto: string,
  wamid: string | null,
  tipo: "texto" | "imagem",
  erro: { codigo: number | null; detalhe: string | null; mensagem: string } | null = null,
): Promise<void> {
  await supabase.from("whatsapp_oficial_mensagens").insert({
    conversa_id: conversaId,
    remetente: "bot",
    tipo,
    conteudo: texto,
    wamid,
    status_entrega: wamid ? "enviada" : "falhou",
    erro_codigo: erro?.codigo ?? null,
    erro_detalhe: erro ? (erro.detalhe ?? erro.mensagem) : null,
  });
  await supabase
    .from("whatsapp_oficial_conversas")
    .update({ ultima_mensagem: texto.slice(0, 500), ultima_interacao_em: new Date().toISOString() })
    .eq("id", conversaId);
}

async function avisarGestores(supabase: Supa, grupoId: string, telefone: string): Promise<void> {
  const { data: gestores } = await supabase
    .from("corretores")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("papel", "gestor")
    .eq("ativo", true);
  for (const g of gestores ?? []) {
    await notificarCorretor(supabase, g.id, {
      titulo: "Mensagem no número oficial",
      corpo: `O número ${telefone} escreveu no número oficial e não está no CRM. Cadastre o lead para alguém atender.`,
      url: "/corretor/admin/whatsapp-oficial",
      tag: `oficial-sem-lead-${telefone}`,
    });
  }
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
