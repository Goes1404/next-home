import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairVariosLeadsComIA } from "@/lib/inbound/aiParser";
import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import type { EmailInboundInput } from "@/lib/inbound/types";

export type ResultadoDoEmail = {
  ok: boolean;
  totalEncontrados: number;
  totalInseridos: number;
  totalDeduplicados: number;
  totalFalhas: number;
  leads: { id: string; deduplicado: boolean; nome: string; telefone: string }[];
};

/**
 * O miolo da ingestão de leads por e-mail, compartilhado pelas duas portas:
 * o webhook do serviço de recebimento (Postmark/SendGrid) e a leitura da
 * caixa do Gmail do corretor (26/09/2026). Duas cópias da deduplicação e do
 * casamento de imóvel divergiriam no primeiro ajuste.
 *
 * `corretorDono`: quando o e-mail veio da caixa DE um corretor, o lead é
 * dele se nada mais específico (imóvel com dono, corretor citado) decidir.
 */
export async function processarEmailDeLead(
  emailInput: EmailInboundInput,
  opcoes: { bodyRaw?: Record<string, unknown>; corretorDono?: string | null } = {},
): Promise<ResultadoDoEmail> {
  const bodyRaw = opcoes.bodyRaw ?? { ...emailInput };
  const vazio: ResultadoDoEmail = { ok: true, totalEncontrados: 0, totalInseridos: 0, totalDeduplicados: 0, totalFalhas: 0, leads: [] };

  // O mesmo e-mail duas vezes (reentrega do serviço, releitura da caixa)
  // não pode anexar o contato de novo na mensagem do lead.
  if (emailInput.messageId) {
    const { count } = await createServiceClient()
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("email_message_id", emailInput.messageId);
    if ((count ?? 0) > 0) return vazio;
  }
  const supabase = createServiceClient();

  const registrarLog = async (
    status: "sucesso" | "erro" | "ignorado",
    extra: { erroMensagem?: string; leadId?: string | null } = {},
  ) => {
    const { error } = await supabase.from("inbound_logs").insert({
      de: emailInput.from || null,
      para: emailInput.to || null,
      assunto: emailInput.subject || null,
      payload_raw: bodyRaw as never,
      status,
      erro_mensagem: extra.erroMensagem ?? null,
      lead_id: extra.leadId ?? null,
    });
    // Este log é a fila de dead-letter do endpoint: se nem ele grava, o
    // problema precisa aparecer em algum lugar.
    if (error) console.error("[inbound] falha ao gravar inbound_logs:", error.message);
  };

  const leadsExtraidos = await extrairVariosLeadsComIA(emailInput);

  if (leadsExtraidos.length === 0) {
    await registrarLog("ignorado", {
      erroMensagem: "Nenhum lead com telefone válido foi identificado no e-mail.",
    });
    return { ok: false, totalEncontrados: 0, totalInseridos: 0, totalDeduplicados: 0, totalFalhas: 0, leads: [] };
  }

  const [{ data: empreendimentos }, { data: corretores }] = await Promise.all([
    supabase.from("empreendimentos").select("id, nome, slug, corretor_id").limit(50),
    supabase.from("corretores").select("id, nome, slug").eq("ativo", true),
  ]);

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const processados: { id: string; deduplicado: boolean; nome: string; telefone: string }[] = [];
  const falhas: { telefone: string; motivo: string }[] = [];
  let totalInseridos = 0;
  let totalDeduplicados = 0;

  for (const lead of leadsExtraidos) {
    let empreendimentoId: string | null = null;
    let corretorId: string | null = null;

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

    /*
     * Compara pela coluna gerada `telefone_e164`, não pelo texto digitado: o
     * mesmo cliente chega "(11) 99123-4567" por um portal e "11991234567"
     * por outro, e a igualdade crua nunca casava os dois.
     */
    const e164 = normalizarTelefoneBrasileiro(lead.telefone);

    const { data: existente, error: erroBusca } = await supabase
      .from("leads")
      .select("id, mensagem")
      .eq("telefone_e164", e164 ?? lead.telefone)
      .gte("created_at", trintaDiasAtras.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroBusca) console.error("[inbound] falha ao consultar duplicado:", erroBusca.message);

    if (existente) {
      const hoje = new Date().toLocaleDateString("pt-BR");
      const novaMensagem =
        `${existente.mensagem || ""}\n\n[Novo contato via ${lead.portalOrigem} em ${hoje}]: ${lead.mensagemOriginal || ""}`.trim();

      const { error: erroUpdate } = await supabase
        .from("leads")
        .update({
          mensagem: novaMensagem,
          etapa_alterada_em: new Date().toISOString(),
          portal_origem: lead.portalOrigem,
        })
        .eq("id", existente.id);

      if (erroUpdate) {
        console.error(`[inbound] falha ao atualizar duplicado ${existente.id}:`, erroUpdate.message);
        falhas.push({ telefone: lead.telefone, motivo: erroUpdate.message });
        continue;
      }

      totalDeduplicados++;
      processados.push({
        id: existente.id,
        deduplicado: true,
        nome: lead.nome,
        telefone: lead.telefone,
      });
      continue;
    }

    const { data: novo, error: erroInsert } = await supabase
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
        corretor_id: corretorId ?? opcoes.corretorDono ?? null,
        consentimento_lgpd: true,
      })
      .select("id")
      .single();

    /*
     * O contador só sobe depois de o banco confirmar. Antes ele subia junto
     * com a tentativa, e a resposta anunciava leads que nunca existiram.
     */
    if (erroInsert || !novo) {
      const motivo = erroInsert?.message ?? "insert não retornou linha";
      console.error(`[inbound] falha ao inserir lead ${lead.telefone}: ${motivo}`);
      falhas.push({ telefone: lead.telefone, motivo });
      continue;
    }

    totalInseridos++;
    processados.push({ id: novo.id, deduplicado: false, nome: lead.nome, telefone: lead.telefone });
  }

  await registrarLog(falhas.length > 0 ? "erro" : "sucesso", {
    leadId: processados[0]?.id ?? null,
    erroMensagem:
      falhas.length > 0
        ? `${falhas.length} de ${leadsExtraidos.length} falharam: ${falhas
            .map((f) => `${f.telefone} (${f.motivo})`)
            .join("; ")}`.slice(0, 2000)
        : undefined,
  });

  return {
    ok: falhas.length === 0,
    totalEncontrados: leadsExtraidos.length,
    totalInseridos,
    totalDeduplicados,
    totalFalhas: falhas.length,
    leads: processados,
  };
}
