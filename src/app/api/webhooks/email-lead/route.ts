import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/public";
import { extrairVariosLeadsComIA } from "@/lib/inbound/aiParser";
import type { EmailInboundInput } from "@/lib/inbound/types";

export const runtime = "nodejs";

/**
 * Endpoint de Webhook para Ingestão Automática de Leads por E-mail (Email-to-Lead).
 * Suporta 1 lead individual ou listas/tabelas com até 50+ leads no mesmo e-mail.
 */
export async function POST(req: Request) {
  const secretConfigurado = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const tokenHeader = req.headers.get("x-webhook-token") || req.headers.get("x-webhook-secret");
  const url = new URL(req.url);
  const tokenQuery = url.searchParams.get("token");

  // Validação de autenticação se configurada
  if (secretConfigurado && tokenHeader !== secretConfigurado && tokenQuery !== secretConfigurado) {
    return NextResponse.json({ erro: "Token de autenticação inválido." }, { status: 401 });
  }

  let bodyRaw: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      bodyRaw = Object.fromEntries(formData.entries());
    } else {
      bodyRaw = await req.json();
    }
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const emailInput: EmailInboundInput = {
    from: String(bodyRaw.from || bodyRaw.From || bodyRaw.sender || ""),
    to: String(bodyRaw.to || bodyRaw.To || bodyRaw.recipient || ""),
    subject: String(bodyRaw.subject || bodyRaw.Subject || ""),
    html: String(bodyRaw.html || bodyRaw.HtmlBody || bodyRaw.HTML || ""),
    text: String(bodyRaw.text || bodyRaw.TextBody || bodyRaw.plain || ""),
    messageId: String(bodyRaw.messageId || bodyRaw.MessageID || bodyRaw.email_id || bodyRaw["Message-Id"] || ""),
  };

  const supabase = createClient();

  // 1. Extração com IA (Gemini 2.0 Flash) + Fallback Regex (suporta 1 ou múltiplos leads)
  const leadsExtraidos = await extrairVariosLeadsComIA(emailInput);

  if (leadsExtraidos.length === 0) {
    await supabase.from("inbound_logs").insert({
      de: emailInput.from || null,
      para: emailInput.to || null,
      assunto: emailInput.subject || null,
      payload_raw: bodyRaw as any,
      status: "ignorado",
      erro_mensagem: "Não foi possível extrair nenhum lead com telefone válido do e-mail.",
    });

    return NextResponse.json(
      { ok: false, mensagem: "E-mail recebido mas nenhum telefone válido foi identificado." },
      { status: 200 },
    );
  }

  // Carrega catálogo e equipe para atribuição inteligente
  const [{ data: empreendimentos }, { data: corretores }] = await Promise.all([
    supabase.from("empreendimentos").select("id, nome, slug, corretor_id").limit(50),
    supabase.from("corretores").select("id, nome, slug").eq("ativo", true),
  ]);

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const leadsProcessados = [];
  let totalInseridos = 0;
  let totalDeduplicados = 0;

  for (const lead of leadsExtraidos) {
    let empreendimentoId: string | null = null;
    let corretorId: string | null = null;

    // Busca Empreendimento
    if (empreendimentos && (lead.imovelInteresse || lead.codigoReferencia)) {
      const termo = (lead.imovelInteresse || lead.codigoReferencia || "").toLowerCase();
      const match = empreendimentos.find(
        (e) =>
          termo.includes(e.nome.toLowerCase()) ||
          termo.includes(e.slug.toLowerCase()) ||
          e.nome.toLowerCase().includes(termo),
      );
      if (match) {
        empreendimentoId = match.id;
        if (match.corretor_id) corretorId = match.corretor_id;
      }
    }

    // Busca Corretor
    if (!corretorId && corretores && lead.corretorMencionado) {
      const nomeC = lead.corretorMencionado.toLowerCase();
      const matchC = corretores.find(
        (c) =>
          nomeC.includes(c.nome.toLowerCase()) ||
          (c.slug ? nomeC.includes(c.slug.toLowerCase()) : false) ||
          c.nome.toLowerCase().includes(nomeC),
      );
      if (matchC) corretorId = matchC.id;
    }

    // Deduplicação por Telefone (30 dias)
    const { data: leadExistente } = await supabase
      .from("leads")
      .select("id, mensagem, corretor_id")
      .eq("telefone", lead.telefone)
      .gte("created_at", trintaDiasAtras.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadExistente) {
      totalDeduplicados++;
      const novaMensagem = `${leadExistente.mensagem || ""}\n\n[Novo contato via ${lead.portalOrigem} em ${new Date().toLocaleDateString("pt-BR")}]: ${lead.mensagemOriginal || ""}`.trim();

      await supabase
        .from("leads")
        .update({
          mensagem: novaMensagem,
          etapa_alterada_em: new Date().toISOString(),
          portal_origem: lead.portalOrigem,
        })
        .eq("id", leadExistente.id);

      leadsProcessados.push({ id: leadExistente.id, deduplicado: true, nome: lead.nome, telefone: lead.telefone });
    } else {
      totalInseridos++;
      const { data: novoLead, error: erroInsert } = await supabase
        .from("leads")
        .insert({
          nome: lead.nome,
          telefone: lead.telefone,
          email: lead.email,
          mensagem: lead.mensagemOriginal,
          tipo: "comprador",
          origem: `inbound/${lead.portalOrigem}`,
          portal_origem: lead.portalOrigem,
          anuncio_origem: lead.imovelInteresse || lead.codigoReferencia || null,
          email_message_id: emailInput.messageId || null,
          empreendimento_id: empreendimentoId,
          corretor_id: corretorId,
          consentimento_lgpd: true,
        })
        .select("id, corretor_id")
        .single();

      if (novoLead) {
        leadsProcessados.push({ id: novoLead.id, deduplicado: false, nome: lead.nome, telefone: lead.telefone });
      }
    }
  }

  // Registra log de auditoria
  await supabase.from("inbound_logs").insert({
    de: emailInput.from || null,
    para: emailInput.to || null,
    assunto: emailInput.subject || null,
    payload_raw: bodyRaw as any,
    status: "sucesso",
    lead_id: leadsProcessados[0]?.id || null,
  });

  return NextResponse.json({
    ok: true,
    totalEncontrados: leadsExtraidos.length,
    totalInseridos,
    totalDeduplicados,
    leads: leadsProcessados,
  });
}
