import "server-only";
import { site } from "@/lib/site";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { textoDoAvisoDoLink, type TipoDeEventoDoLink } from "@/lib/crm/linksDoCliente";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O que o cliente faz nos links que o corretor mandou (26/09/2026, 0121).
 *
 * O evento é gravado sempre; é dele que saem a linha "abriu a seleção,
 * clicou no Vitra" na ficha e o painel de uso. O AVISO no WhatsApp do
 * corretor só sai quando é notícia de agora: a primeira abertura da
 * seleção, o primeiro documento e a lista completa. Clique em imóvel e
 * cada documento do meio ficam na ficha — aviso que chega a cada toque do
 * cliente deixa de ser lido (a régua do `evolucaoConversa`).
 *
 * Nada aqui lança: quem chama está servindo a página do cliente.
 */
export async function registrarEventoDoLink(
  supabase: Supa,
  e: { token: string; leadId: string; corretorId: string; tipo: TipoDeEventoDoLink; detalhe?: string | null },
): Promise<void> {
  const { error } = await supabase.from("links_do_cliente_eventos").insert({
    token: e.token,
    lead_id: e.leadId,
    corretor_id: e.corretorId,
    tipo: e.tipo,
    detalhe: e.detalhe?.slice(0, 200) ?? null,
  });
  if (error) console.warn("[links] evento não gravado:", e.tipo, error.message);
}

/**
 * Manda o aviso da instância do PRÓPRIO corretor para o WhatsApp dele — o
 * mesmo caminho do resumo do dia e dos lembretes. Sem número conectado ou
 * sem `whatsapp` cadastrado, o aviso não sai, e o evento continua na ficha.
 */
export async function avisarCorretorDoLink(
  supabase: Supa,
  p: { corretorId: string; leadId: string; tipo: TipoDeEventoDoLink; nomeLead: string | null; detalhe?: string | null },
): Promise<boolean> {
  const [{ data: inst }, { data: corretor }] = await Promise.all([
    supabase
      .from("corretor_whatsapp_instancias")
      .select("instance_name")
      .eq("corretor_id", p.corretorId)
      .eq("status_conexao", "conectado")
      .limit(1)
      .maybeSingle(),
    supabase.from("corretores").select("whatsapp, ativo").eq("id", p.corretorId).maybeSingle(),
  ]);
  if (!inst?.instance_name || !corretor?.ativo || !corretor.whatsapp) return false;

  const texto = textoDoAvisoDoLink({
    tipo: p.tipo,
    nome: p.nomeLead,
    detalhe: p.detalhe ?? null,
    fichaUrl: `${site.url}/corretor/leads/${p.leadId}`,
  });
  if (!texto) return false;
  try {
    const envio = await enviarMensagemWhatsapp({ instanceName: inst.instance_name, telefone: corretor.whatsapp, texto });
    if (!envio.enviado) console.warn("[links] aviso ao corretor não saiu:", envio.motivo);
    return envio.enviado;
  } catch (err) {
    console.warn("[links] aviso ao corretor falhou:", err);
    return false;
  }
}
