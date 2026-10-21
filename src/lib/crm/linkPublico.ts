import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { after } from "next/server";
import { linkValido, type TipoDeLink } from "@/lib/crm/linksDoCliente";
import { avisarCorretorDoLink, registrarEventoDoLink } from "@/lib/crm/eventosDoLink";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkPublico = {
  token: string;
  leadId: string;
  corretorId: string;
  /** Grupo do link, o mesmo do corretor que o mandou (o gatilho da 0191 garante). */
  grupoId: string;
  dados: Record<string, unknown>;
  primeiroNome: string | null;
  corretor: { nome: string; whatsapp: string | null; fotoUrl: string | null; creci: string | null };
};

/**
 * Lê um link do cliente pelo token, com a chave de serviço (o `anon` não
 * enxerga a tabela). Vencido, de outro tipo ou inexistente devolve `null` —
 * a página responde 404 e não diz qual dos três foi.
 *
 * A primeira abertura é carimbada (`aberto_em`): é o que diz ao corretor,
 * na ficha, que o cliente viu a seleção. Quem ganha o carimbo (o UPDATE
 * condicional devolve a linha) registra o evento e, na seleção, avisa o
 * corretor no WhatsApp — depois da resposta (`after`), para o cliente não
 * esperar o envio.
 */
export async function lerLinkPublico(
  token: string,
  tipo: TipoDeLink,
  opcoes: { previa?: boolean } = {},
): Promise<LinkPublico | null> {
  if (!UUID.test(token)) return null;
  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from("links_do_cliente")
    .select("token, tipo, lead_id, corretor_id, grupo_id, dados, expira_em, aberto_em")
    .eq("token", token)
    .eq("tipo", tipo)
    .maybeSingle();
  if (!link || !linkValido(link)) return null;

  const [{ data: lead }, { data: corretor }] = await Promise.all([
    supabase.from("leads").select("nome").eq("id", link.lead_id).maybeSingle(),
    supabase.from("corretores").select("nome, whatsapp, foto_url, creci").eq("id", link.corretor_id).maybeSingle(),
  ]);
  if (!lead || !corretor) return null;

  // A prévia do corretor ("ver como o cliente vê") não conta como abertura.
  if (!link.aberto_em && !opcoes.previa) {
    const { data: carimbou } = await supabase
      .from("links_do_cliente")
      .update({ aberto_em: new Date().toISOString() })
      .eq("token", token)
      .is("aberto_em", null)
      .select("token");
    if (carimbou && carimbou.length > 0) {
      const evento = { token, leadId: link.lead_id, corretorId: link.corretor_id, grupoId: link.grupo_id, tipo: "abriu" as const };
      after(async () => {
        await registrarEventoDoLink(supabase, evento);
        if (tipo === "selecao" || tipo === "proposta") {
          const detalhe = tipo === "proposta" ? "a proposta que você mandou" : null;
          await avisarCorretorDoLink(supabase, { ...evento, nomeLead: lead.nome, detalhe });
        }
      });
    }
  }

  return {
    token: link.token,
    leadId: link.lead_id,
    corretorId: link.corretor_id,
    grupoId: link.grupo_id,
    dados: (link.dados ?? {}) as Record<string, unknown>,
    primeiroNome: primeiroNomeUtil(lead.nome),
    corretor: {
      nome: corretor.nome,
      whatsapp: corretor.whatsapp,
      fotoUrl: corretor.foto_url,
      creci: corretor.creci,
    },
  };
}

export type LinkVencido = {
  primeiroNome: string | null;
  corretor: { nome: string; whatsapp: string | null };
};

/**
 * Quando `lerLinkPublico` devolve `null`, distingue o link que EXISTIU e
 * venceu do que nunca existiu (16/10/2026). O vencido ganha página própria
 * com o botão de pedir outro ao corretor: o cliente que abria o link do mês
 * passado via "página não encontrada" e não sabia a quem recorrer. Token
 * inexistente continua em 404 — não há corretor a quem mandar.
 */
export async function lerLinkVencido(token: string, tipo: TipoDeLink): Promise<LinkVencido | null> {
  if (!UUID.test(token)) return null;
  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from("links_do_cliente")
    .select("lead_id, corretor_id, expira_em")
    .eq("token", token)
    .eq("tipo", tipo)
    .maybeSingle();
  if (!link || linkValido(link)) return null;
  const [{ data: lead }, { data: corretor }] = await Promise.all([
    supabase.from("leads").select("nome").eq("id", link.lead_id).maybeSingle(),
    supabase.from("corretores").select("nome, whatsapp").eq("id", link.corretor_id).maybeSingle(),
  ]);
  if (!corretor) return null;
  return {
    primeiroNome: primeiroNomeUtil(lead?.nome ?? null),
    corretor: { nome: corretor.nome, whatsapp: corretor.whatsapp },
  };
}

function primeiroNomeUtil(nome: string | null): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] || null;
  return primeiro && !/^\+?\d/.test(primeiro) && !primeiro.startsWith("WhatsApp") ? primeiro : null;
}
