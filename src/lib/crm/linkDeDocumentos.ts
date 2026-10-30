import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { itensIniciais, type FaseDocumento } from "@/lib/crm/documentacao";
import { lerDocumentacaoDoLead } from "@/lib/crm/documentacaoDados";
import { caminhoDoLink, mensagemParaCliente } from "@/lib/crm/linksDoCliente";

/**
 * O link para o cliente mandar os documentos de uma fase (0179), num lugar
 * só para as duas portas: o botão da seção Documentação da ficha
 * (`linkDosDocumentos`) e o "manda o link de documentos pro João" do número
 * central (onda 2). Duas montagens divergiriam no primeiro ajuste (a lista
 * que nasce pelo perfil, o link válido reaproveitado).
 *
 * NÃO confere quem pede: quem chama já provou que o lead é do corretor (a
 * sessão no painel; o grupo e o dono da identificação no central). Escreve
 * pela chave de serviço; o grupo do link sai do carimbo pelo lead (0191).
 *
 * - Um link VÁLIDO da fase é devolvido em vez de criar outro: o cliente
 *   guarda o endereço, e o que ele abre mostra sempre a lista do lead como
 *   está agora (com os recusados).
 * - Sem lista gravada, ela nasce aqui pelo perfil: pedir documento sem lista
 *   seria pedir nada.
 */

type Supa = ReturnType<typeof createServiceClient>;

export type LinkDeDocumentosPronto = { url: string; mensagem: string; criado: boolean } | { erro: string };

export async function garantirLinkDeDocumentos(
  supabase: Supa,
  p: { leadId: string; nomeDoLead: string; corretorId: string; grupoId: string; fase: FaseDocumento; perfil: string | null },
): Promise<LinkDeDocumentosPronto> {
  const doc = await lerDocumentacaoDoLead(supabase, p.leadId);
  const daFase = doc.fases[p.fase];
  if (!daFase.gravada) {
    const itens = daFase.itens.length > 0 ? daFase.itens : itensIniciais(p.fase, p.perfil);
    const { error } = await supabase.from("lead_documentos_lista").upsert(
      {
        lead_id: p.leadId,
        fase: p.fase,
        corretor_id: p.corretorId,
        itens,
        perfil: p.fase === "financiamento" ? p.perfil : null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "lead_id,fase" },
    );
    if (error) {
      console.error("[documentação] lista não gravada:", error.message);
      return { erro: "Não foi possível salvar a lista agora." };
    }
  }
  const primeiroNome = p.nomeDoLead.trim().split(/\s+/)[0] || null;
  const endereco = await lerEnderecoDoCliente(p.grupoId);
  if (daFase.link?.valido) {
    const url = `${endereco}${caminhoDoLink("documentos", daFase.link.token)}`;
    return { url, mensagem: mensagemParaCliente({ tipo: "documentos", primeiroNome, url }), criado: false };
  }
  const { data, error } = await supabase
    .from("links_do_cliente")
    .insert({ tipo: "documentos", lead_id: p.leadId, corretor_id: p.corretorId, dados: { fase: p.fase } })
    .select("token")
    .single();
  if (error || !data) return { erro: "Não foi possível criar o link agora." };
  const url = `${endereco}${caminhoDoLink("documentos", data.token)}`;
  return { url, mensagem: mensagemParaCliente({ tipo: "documentos", primeiroNome, url }), criado: true };
}
