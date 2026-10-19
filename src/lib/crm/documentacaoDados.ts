import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { linkValido } from "@/lib/crm/linksDoCliente";
import {
  ehFase,
  FASES_DOCUMENTO,
  listaEfetiva,
  resumirLista,
  type DocumentoDaLista,
  type FaseDocumento,
  type ResumoDaLista,
  type SituacaoDocumento,
} from "@/lib/crm/documentacao";

type Cliente = SupabaseClient<Database>;

export type DocumentoDoLead = DocumentoDaLista & {
  fase: FaseDocumento;
  caminho: string;
  nomeArquivo: string | null;
  mime: string | null;
  alerta: string | null;
  origem: "link" | "corretor" | "whatsapp";
};

/**
 * Os arquivos do lead. Antes da 0179 as colunas novas não existem e a
 * consulta completa falha: aí vale a leitura antiga, tudo "recebido" na
 * fase do financiamento — o deploy pode sair antes da migration sem
 * derrubar a ficha nem a página do cliente.
 */
export async function lerDocumentosDoLead(
  supabase: Cliente,
  leadId: string,
): Promise<{ documentos: DocumentoDoLead[]; migrado: boolean }> {
  const { data, error } = await supabase
    .from("lead_documentos")
    .select("id, item, caminho, nome_arquivo, mime, created_at, alerta, fase, situacao, motivo_recusa, origem")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (!error) {
    return {
      migrado: true,
      documentos: (data ?? []).map((d) => ({
        id: d.id,
        item: d.item,
        caminho: d.caminho,
        nomeArquivo: d.nome_arquivo,
        mime: d.mime,
        alerta: d.alerta,
        criadoEm: d.created_at,
        fase: ehFase(d.fase) ? d.fase : "financiamento",
        situacao: d.situacao as SituacaoDocumento,
        motivoRecusa: d.motivo_recusa,
        origem: d.origem,
      })),
    };
  }
  const { data: antigos } = await supabase
    .from("lead_documentos")
    .select("id, item, caminho, nome_arquivo, mime, created_at, alerta")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return {
    migrado: false,
    documentos: (antigos ?? []).map((d) => ({
      id: d.id,
      item: d.item,
      caminho: d.caminho,
      nomeArquivo: d.nome_arquivo,
      mime: d.mime,
      alerta: d.alerta,
      criadoEm: d.created_at,
      fase: "financiamento",
      situacao: "recebido",
      motivoRecusa: null,
      origem: "link",
    })),
  };
}

export type LinkDeDocumentos = { token: string; fase: FaseDocumento; itens: string[] | null; valido: boolean };

/** O link de documentos mais recente de cada fase (o válido ganha do vencido). */
export async function linksDeDocumentos(supabase: Cliente, leadId: string): Promise<LinkDeDocumentos[]> {
  const { data } = await supabase
    .from("links_do_cliente")
    .select("token, dados, expira_em, created_at")
    .eq("lead_id", leadId)
    .eq("tipo", "documentos")
    .order("created_at", { ascending: false })
    .limit(20);
  const porFase = new Map<FaseDocumento, LinkDeDocumentos>();
  for (const l of data ?? []) {
    const dados = (l.dados ?? {}) as { fase?: unknown; itens?: unknown };
    const fase: FaseDocumento = ehFase(dados.fase) ? dados.fase : "financiamento";
    const valido = linkValido(l);
    const atual = porFase.get(fase);
    if (atual && (atual.valido || !valido)) continue;
    porFase.set(fase, {
      token: l.token,
      fase,
      valido,
      itens: Array.isArray(dados.itens) ? (dados.itens as unknown[]).filter((i): i is string => typeof i === "string") : null,
    });
  }
  return [...porFase.values()];
}

export type FaseDoLead = {
  fase: FaseDocumento;
  itens: string[];
  /** A lista é do lead (0179) — sem isso ela veio do link antigo, ou não existe. */
  gravada: boolean;
  perfil: string | null;
  resumo: ResumoDaLista;
  link: LinkDeDocumentos | null;
};

export type DocumentacaoDoLead = {
  migrado: boolean;
  fases: Record<FaseDocumento, FaseDoLead>;
  documentos: DocumentoDoLead[];
};

/** Tudo o que a seção da ficha e a página do cliente precisam, numa leitura. */
export async function lerDocumentacaoDoLead(supabase: Cliente, leadId: string): Promise<DocumentacaoDoLead> {
  const [{ documentos, migrado }, links, { data: listas, error: erroListas }] = await Promise.all([
    lerDocumentosDoLead(supabase, leadId),
    linksDeDocumentos(supabase, leadId),
    supabase.from("lead_documentos_lista").select("fase, itens, perfil").eq("lead_id", leadId),
  ]);
  const gravadas = erroListas ? [] : (listas ?? []);

  const fases = Object.fromEntries(
    FASES_DOCUMENTO.map((fase) => {
      const gravada = gravadas.find((l) => l.fase === fase) ?? null;
      const link = links.find((l) => l.fase === fase) ?? null;
      const itens = listaEfetiva({ gravada: gravada?.itens ?? null, doLink: link?.itens ?? null });
      const daFase = documentos.filter((d) => d.fase === fase);
      return [
        fase,
        {
          fase,
          itens,
          gravada: Boolean(gravada),
          perfil: gravada?.perfil ?? null,
          resumo: resumirLista(itens, daFase),
          link,
        } satisfies FaseDoLead,
      ];
    }),
  ) as Record<FaseDocumento, FaseDoLead>;

  return { migrado: migrado && !erroListas, fases, documentos };
}

export type ItemParaCliente = { item: string; situacao: ResumoDaLista["itens"][number]["situacao"]; motivo: string | null };

/**
 * O que a página pública do link mostra: a lista da fase DO LINK, como está
 * agora no lead (com recusados e motivo). Nunca o arquivo: o link pode ser
 * encaminhado, e documento pessoal não aparece para quem o recebeu.
 */
export async function documentacaoDoLink(
  supabase: Cliente,
  leadId: string,
  dados: Record<string, unknown>,
): Promise<{ fase: FaseDocumento; itens: ItemParaCliente[]; completa: boolean; migrado: boolean }> {
  const fase: FaseDocumento = ehFase(dados.fase) ? dados.fase : "financiamento";
  const doc = await lerDocumentacaoDoLead(supabase, leadId);
  const daFase = doc.fases[fase];
  // Link antigo sem lista no lead: vale a lista que veio nele.
  const doLink = Array.isArray(dados.itens) ? (dados.itens as unknown[]).filter((i): i is string => typeof i === "string") : [];
  const resumo =
    daFase.itens.length > 0
      ? daFase.resumo
      : resumirLista(
          doLink,
          doc.documentos.filter((d) => d.fase === fase),
        );
  return {
    fase,
    migrado: doc.migrado,
    completa: resumo.completa,
    itens: resumo.itens.map((i) => ({ item: i.item, situacao: i.situacao, motivo: i.motivo })),
  };
}
