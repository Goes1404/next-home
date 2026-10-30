import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { registrarInteracao } from "@/lib/crm/interacoes";
import { dentroDaJanelaDoCorretor } from "@/lib/whatsapp/antiBan";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { podeEnviarPorIniciativa, silencioDaConversa } from "@/lib/whatsapp/quandoAIaResponde";
import {
  devolverCotaCampanha,
  gravarMensagem,
  lerConversaPersistida,
  registrarResultadoEnvio,
  reservarCotaCampanha,
  situacaoDaConversa,
} from "@/lib/whatsapp/repositorio";
import { lerRamo, vocabularioDoRamo, type Ramo } from "@/lib/ramos/ramos";
import { MOTIVO_EM_PORTUGUES, naJanelaAutomatica, podePedirConfirmacao, textoDoPedidoDeConfirmacao } from "./confirmacaoDaVisita";

type Supa = ReturnType<typeof createServiceClient>;

export type QuemPede = { por: "corretor"; corretorId: string } | { por: "automatica" };

export type Desfecho = { enviado: true; texto: string } | { enviado: false; erro: string; pular?: boolean };

/**
 * Manda ao cliente o pedido de confirmação de UMA visita (0246, 29/10/2026)
 * pelo caminho de envio de sempre: o número do corretor dono do lead, a
 * mensagem gravada na conversa e o resultado no disjuntor do número.
 *
 * Quem chama prova o grupo: o toque do corretor (sessão, e só a visita que
 * ELE faz) ou a varredura automática (a linha lida no próprio grupo). O
 * texto é fixo (`textoDoPedidoDeConfirmacao`), nunca a IA.
 *
 * As travas, por caminho:
 *
 * - toque do corretor: é o corretor falando — como digitar no Live Chat,
 *   não gasta cota e vale com a IA desligada na conversa; só não fala com
 *   quem pediu para não ser contatado, nem pelo número de quem não é mais
 *   dono do lead.
 * - automática: as do lembrete de véspera (`processarFollowup`) — janela
 *   segura e expediente do corretor, IA desligada na conversa ou no número
 *   barra, e a cota anti-ban (com o espaçamento) é reservada antes.
 *
 * O pedido é UM por data de visita: o carimbo `confirmacao_pedida_em` é o
 * claim, gravado antes do envio e desfeito se o envio falhar. E entra como
 * `lembrete_visita` enviado em `whatsapp_followups`: o lembrete da IA não
 * repete o pedido, e a resposta do cliente é lida pelo mesmo caminho (com a
 * IA atendendo, `instrucaoPelosFollowups`; sem ela, `respostaDaConfirmacao`).
 */
export async function pedirConfirmacaoDaVisita(
  supabase: Supa,
  p: { visitaId: string; grupoId: string; quem: QuemPede },
  agora: Date = new Date(),
): Promise<Desfecho> {
  const { data: visita } = await supabase
    .from("visitas")
    .select("id, lead_id, corretor_id, inicio, status, confirmacao_pedida_em, remarcacao_pedida_em")
    .eq("id", p.visitaId)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!visita) return { enviado: false, erro: "Visita não encontrada." };
  if (p.quem.por === "corretor" && visita.corretor_id !== p.quem.corretorId) {
    return { enviado: false, erro: "Só quem faz a visita pede a confirmação." };
  }

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, nome, corretor_id, nao_contatar_em, arquivado_em, visita_agendada_em, visita_confirmada_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)",
    )
    .eq("id", visita.lead_id)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!lead || lead.arquivado_em) return { enviado: false, erro: "Lead não encontrado." };
  // A mensagem sai do número do DONO do lead: visita passada a outro corretor
  // (0225) não fala com o cliente por um número que não é o da conversa.
  if (lead.corretor_id !== visita.corretor_id) {
    return { enviado: false, erro: "Esta visita foi passada por outro corretor: quem confirma é o dono do lead." };
  }
  if (lead.nao_contatar_em) return { enviado: false, erro: "Este cliente pediu para não receber mensagens." };

  const ehAtual = lead.visita_agendada_em !== null && Date.parse(lead.visita_agendada_em) === Date.parse(visita.inicio);
  const pode = podePedirConfirmacao(
    {
      inicio: visita.inicio,
      status: visita.status,
      confirmadaPeloCliente: ehAtual && lead.visita_confirmada_em !== null,
      confirmacaoPedidaEm: visita.confirmacao_pedida_em,
      remarcacaoPedidaEm: visita.remarcacao_pedida_em,
    },
    agora,
  );
  if (!pode.pode) return { enviado: false, erro: MOTIVO_EM_PORTUGUES[pode.motivo] };
  if (p.quem.por === "automatica" && !naJanelaAutomatica(visita.inicio, agora)) {
    return { enviado: false, erro: "Fora da janela da confirmação automática.", pular: true };
  }

  const { data: conversaDoLead } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("corretor_id", visita.corretor_id)
    .eq("grupo_id", p.grupoId)
    .limit(1)
    .maybeSingle();
  const conversa = conversaDoLead ? await lerConversaPersistida(conversaDoLead.id) : null;
  if (!conversa) {
    return { enviado: false, erro: "Este cliente ainda não conversou com você pelo WhatsApp: confirme pelo botão WhatsApp ou por ligação." };
  }

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name, status_conexao, conectado_em, bloqueado_ate, modo_bot, expediente_inicio, expediente_fim")
    .eq("corretor_id", visita.corretor_id)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em) {
    return { enviado: false, erro: "Conecte o seu WhatsApp para pedir a confirmação por aqui." };
  }
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > agora) {
    return { enviado: false, erro: "O número está em pausa de proteção agora. Tente mais tarde." };
  }

  const situacao = situacaoDaConversa(conversa);
  if (p.quem.por === "corretor") {
    const silencio = silencioDaConversa(situacao);
    if (silencio && silencio.motivo !== "ia_desligada_na_conversa") {
      return { enviado: false, erro: "Este número não fala mais com este cliente." };
    }
  } else {
    const numero = {
      modo: instancia.modo_bot as "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado",
      expediente: { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim },
    };
    if (!dentroDaJanelaDoCorretor(agora, numero.expediente)) return { enviado: false, erro: "Fora do expediente.", pular: true };
    if (!podeEnviarPorIniciativa({ conversa: situacao, numero }).responde) {
      return { enviado: false, erro: "A conversa ou o número não aceitam envio automático." };
    }
  }

  // O claim: um pedido por data de visita, mesmo com dois toques ou dois tiques.
  const { data: ganhou } = await supabase
    .from("visitas")
    .update({ confirmacao_pedida_em: agora.toISOString(), confirmacao_pedida_por: p.quem.por })
    .eq("id", visita.id)
    .eq("grupo_id", p.grupoId)
    .eq("inicio", visita.inicio)
    .eq("status", "marcada")
    .is("confirmacao_pedida_em", null)
    .select("id");
  if (!ganhou?.length) return { enviado: false, erro: MOTIVO_EM_PORTUGUES.ja_pedida };
  const soltar = () =>
    supabase
      .from("visitas")
      .update({ confirmacao_pedida_em: null, confirmacao_pedida_por: null })
      .eq("id", visita.id)
      .eq("grupo_id", p.grupoId);

  if (p.quem.por === "automatica") {
    const cota = await reservarCotaCampanha(instancia.id, new Date(instancia.conectado_em));
    if (!cota.permitido) {
      await soltar();
      // Espaçamento não é recusa: a vez chega em segundos e o próximo tique tenta.
      return { enviado: false, erro: "Cota anti-ban do número.", pular: cota.motivo === "aguardando_intervalo" };
    }
  }

  const [{ data: corretor }, ramo] = await Promise.all([
    supabase.from("corretores").select("nome").eq("id", visita.corretor_id).eq("grupo_id", p.grupoId).maybeSingle(),
    ramoDoGrupo(supabase, p.grupoId),
  ]);
  const imovel = Array.isArray(lead.empreendimento) ? lead.empreendimento[0] : lead.empreendimento;
  const texto = textoDoPedidoDeConfirmacao({
    cliente: lead.nome,
    // "seu corretor" na imobiliária (o de sempre); "seu consultor" etc. nos outros ramos.
    corretor: corretor?.nome ?? `seu ${vocabularioDoRamo(ramo).equipe.singular}`,
    inicio: visita.inicio,
    lugar: imovel?.nome ?? null,
    agora,
    ramo,
  });

  const envio = await enviarMensagemWhatsapp({ instanceName: instancia.instance_name, telefone: conversa.telefoneCliente, texto });
  await registrarResultadoEnvio(instancia.id, envio.enviado);
  if (!envio.enviado) {
    await soltar();
    if (p.quem.por === "automatica") await devolverCotaCampanha(instancia.id);
    console.warn("[confirmação de visita] não saiu:", envio.motivo);
    return { enviado: false, erro: "Não foi possível enviar agora. Tente de novo em instantes." };
  }

  await gravarMensagem({
    conversaId: conversa.id,
    // O toque é o corretor falando; a automática é a casa (como o lembrete).
    remetente: p.quem.por === "corretor" ? "corretor" : "bot",
    conteudo: texto,
    conversaLiberada: true,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });
  const { error: erroDoFollowup } = await supabase.from("whatsapp_followups").insert({
    conversa_id: conversa.id,
    instancia_id: instancia.id,
    tentativa: 1,
    tipo: "lembrete_visita",
    status: "enviado",
    agendado_para: agora.toISOString(),
    enviado_em: agora.toISOString(),
  });
  if (erroDoFollowup) console.error("[confirmação de visita] o registro do pedido falhou:", erroDoFollowup.message);
  await registrarInteracao(supabase, {
    leadId: lead.id,
    corretorId: p.quem.por === "corretor" ? p.quem.corretorId : null,
    tipo: "sistema",
    conteudo:
      p.quem.por === "corretor"
        ? "Pedido de confirmação da visita enviado pelo WhatsApp"
        : "Pedido de confirmação da visita enviado automaticamente pelo WhatsApp",
    detalhes: { visita_id: visita.id, inicio: visita.inicio, por: p.quem.por },
  });
  // O lembrete de véspera da IA que ainda ia sair para esta conversa perde o
  // motivo: o cliente não recebe as duas perguntas.
  const { error: erroDoCancelamento } = await supabase
    .from("whatsapp_followups")
    .update({ status: "cancelado", motivo: "confirmacao_pedida" })
    .eq("conversa_id", conversa.id)
    .eq("grupo_id", p.grupoId)
    .eq("tipo", "lembrete_visita")
    .eq("status", "pendente");
  if (erroDoCancelamento) console.warn("[confirmação de visita] lembrete pendente não cancelado:", erroDoCancelamento.message);
  return { enviado: true, texto };
}

/**
 * O ramo do grupo (0244) para o texto que vai ao cliente (30/10/2026,
 * revisão). Sem a coluna (antes da 0244) ou com erro, imobiliária: o texto
 * de sempre.
 */
async function ramoDoGrupo(supabase: Supa, grupoId: string): Promise<Ramo> {
  const { data, error } = await supabase.from("grupos").select("ramo").eq("id", grupoId).maybeSingle();
  return lerRamo(error ? null : (data as { ramo?: unknown } | null)?.ramo);
}
