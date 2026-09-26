"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { site } from "@/lib/site";
import { compatibilidade, perfilDoLead } from "@/lib/crm/compatibilidade";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { validarProposta, type EntradaDaProposta } from "@/lib/crm/proposta";
import {
  caminhoDoLink,
  documentosDoPerfil,
  IMOVEIS_NA_SELECAO,
  PERFIS_DE_DOCUMENTO,
  type PerfilDeDocumento,
  mensagemParaCliente,
  type TipoDeLink,
} from "@/lib/crm/linksDoCliente";

export type LinkCriado = { url: string; mensagem: string } | { erro: string };

async function leadDaCarteira(leadId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." } as const;
  const supabase = await createClient();
  // RLS recorta: lead de outro corretor não vem.
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, nome, corretor_id, regiao_interesse, dormitorios_min, orcamento_max, renda_mensal, empreendimento_id, imovel_interesse_id",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: "Lead não encontrado na sua carteira." } as const;
  if (lead.corretor_id !== corretor.id) {
    return { erro: "Só o corretor responsável pelo lead cria links para ele." } as const;
  }
  return { supabase, lead, corretor } as const;
}

async function gravar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  p: { tipo: TipoDeLink; leadId: string; corretorId: string; dados: Record<string, unknown>; nome: string; expiraEm?: string },
): Promise<LinkCriado> {
  const { data, error } = await supabase
    .from("links_do_cliente")
    .insert({
      tipo: p.tipo,
      lead_id: p.leadId,
      corretor_id: p.corretorId,
      dados: p.dados as never,
      ...(p.expiraEm ? { expira_em: p.expiraEm } : {}),
    })
    .select("token")
    .single();
  if (error || !data) return { erro: "Não foi possível criar o link agora." };
  revalidatePath(`/corretor/leads/${p.leadId}`);
  const url = `${site.url}${caminhoDoLink(p.tipo, data.token)}`;
  const primeiroNome = p.nome.trim().split(/\s+/)[0] || null;
  return { url, mensagem: mensagemParaCliente({ tipo: p.tipo, primeiroNome, url }) };
}

/** Quantos imóveis a tela de escolha oferece. */
const CANDIDATOS_NA_ESCOLHA = 12;

export type CandidatoDaSelecao = {
  id: string;
  nome: string;
  onde: string;
  motivos: string[];
};

/**
 * Seleção personalizada, passo 1: a sugestão. Os imóveis publicados que mais
 * combinam com o lead (`perfilDoLead`: ficha, dossiê da IA e renda), com o
 * imóvel de interesse na frente. Os três primeiros vêm marcados; o corretor
 * troca antes de gerar o link — a máquina sugere, quem manda o link assina.
 *
 * Sem critério nenhum, ainda oferece o catálogo, mas nada marcado: é o
 * corretor quem sabe o que mostrar a quem não disse o que procura.
 */
export async function sugerirSelecao(
  leadId: string,
): Promise<{ candidatos: CandidatoDaSelecao[]; marcados: string[] } | { erro: string }> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  const { supabase, lead } = r;

  const [catalogo, credito, { data: dossie }] = await Promise.all([
    getEmpreendimentos().catch(() => []),
    getParametrosCredito(),
    supabase.from("lead_observacoes_ia").select("orcamento_max").eq("lead_id", leadId).maybeSingle(),
  ]);
  const perfil = perfilDoLead(lead, dossie, credito);
  const interesse = [lead.imovel_interesse_id, lead.empreendimento_id].filter(Boolean) as string[];

  const avaliados = catalogo
    .filter((e) => e.id)
    .map((e) => ({
      e,
      compat: compatibilidade(perfil, {
        cidade: e.cidade,
        bairro: e.bairro,
        precoAPartir: e.precoAPartir,
        dormitorios: e.tipologias.map((t) => t.dormitorios),
      }),
      interesse: interesse.includes(e.id!),
    }))
    .sort(
      (a, b) =>
        Number(b.interesse) - Number(a.interesse) ||
        Number(b.compat.combina) - Number(a.compat.combina) ||
        b.compat.pontos - a.compat.pontos,
    )
    .slice(0, CANDIDATOS_NA_ESCOLHA);

  if (avaliados.length === 0) return { erro: "Não há imóvel publicado no catálogo." };
  const marcados = avaliados
    .filter((a) => a.interesse || a.compat.combina)
    .slice(0, IMOVEIS_NA_SELECAO)
    .map((a) => a.e.id!);

  return {
    marcados,
    candidatos: avaliados.map((a) => ({
      id: a.e.id!,
      nome: a.e.nome,
      onde: [a.e.bairro, a.e.cidade].filter(Boolean).join(", "),
      motivos: a.interesse ? ["imóvel de interesse", ...a.compat.motivos] : a.compat.motivos,
    })),
  };
}

/**
 * Seleção personalizada, passo 2: o link, com os imóveis que o corretor
 * deixou marcados. Os ids chegam pela rede, então só vale o que é imóvel
 * PUBLICADO do catálogo — um id qualquer não vira página para o cliente.
 */
export async function criarSelecao(leadId: string, escolhidos: string[]): Promise<LinkCriado> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  const { supabase, lead, corretor } = r;

  const pedidos = [...new Set(Array.isArray(escolhidos) ? escolhidos : [])].filter((id) => typeof id === "string");
  if (pedidos.length === 0) return { erro: "Marque ao menos um imóvel." };
  if (pedidos.length > IMOVEIS_NA_SELECAO) return { erro: `No máximo ${IMOVEIS_NA_SELECAO} imóveis por seleção.` };

  const catalogo = await getEmpreendimentos().catch(() => []);
  const publicados = new Set(catalogo.map((e) => e.id).filter(Boolean));
  const ids = pedidos.filter((id) => publicados.has(id));
  if (ids.length !== pedidos.length) return { erro: "Algum imóvel saiu do catálogo. Monte a seleção de novo." };

  return gravar(supabase, {
    tipo: "selecao",
    leadId,
    corretorId: corretor.id,
    nome: lead.nome,
    // Só os imóveis: a renda do cliente não viaja num link compartilhável.
    dados: { empreendimentos: ids },
  });
}

export async function criarLinkDeDocumentos(leadId: string, perfil: string = "clt"): Promise<LinkCriado> {
  if (!(PERFIS_DE_DOCUMENTO as readonly string[]).includes(perfil)) return { erro: "Perfil desconhecido." };
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  return gravar(r.supabase, {
    tipo: "documentos",
    leadId,
    corretorId: r.corretor.id,
    nome: r.lead.nome,
    dados: { itens: documentosDoPerfil(perfil as PerfilDeDocumento), perfil },
  });
}

/**
 * Proposta por link (0123). O corretor escreve os números; a validação é a
 * de `proposta.ts`, porque a entrada vem pela rede.
 */
export async function criarProposta(leadId: string, entrada: EntradaDaProposta): Promise<LinkCriado> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  const v = validarProposta(entrada ?? ({} as EntradaDaProposta));
  if ("erro" in v) return { erro: v.erro };
  return gravar(r.supabase, {
    tipo: "proposta",
    leadId,
    corretorId: r.corretor.id,
    nome: r.lead.nome,
    dados: v.dados,
  });
}

/**
 * Portal do comprador (0125): UM link por cliente, que vale até as chaves.
 * Pedir de novo devolve o mesmo link enquanto ele vale — o cliente guarda o
 * endereço, e um link novo a cada clique deixaria o antigo órfão na mão dele.
 */
export async function criarPortal(leadId: string): Promise<LinkCriado> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  const primeiroNome = r.lead.nome.trim().split(/\s+/)[0] || null;
  const { data: existente } = await r.supabase
    .from("links_do_cliente")
    .select("token, expira_em")
    .eq("lead_id", leadId)
    .eq("tipo", "portal")
    .gt("expira_em", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente) {
    const url = `${site.url}${caminhoDoLink("portal", existente.token)}`;
    return { url, mensagem: mensagemParaCliente({ tipo: "portal", primeiroNome, url }) };
  }
  return gravar(r.supabase, {
    tipo: "portal",
    leadId,
    corretorId: r.corretor.id,
    nome: r.lead.nome,
    dados: {},
    // Obra na planta leva anos: o link acompanha o cliente até as chaves.
    expiraEm: new Date(Date.now() + 4 * 365 * 86_400_000).toISOString(),
  });
}
