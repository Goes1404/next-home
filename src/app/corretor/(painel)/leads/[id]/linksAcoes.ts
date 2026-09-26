"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { site } from "@/lib/site";
import { compatibilidade, ordenarCompativeis } from "@/lib/crm/compatibilidade";
import {
  caminhoDoLink,
  DOCUMENTOS_PADRAO,
  IMOVEIS_NA_SELECAO,
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
      "id, nome, corretor_id, regiao_interesse, dormitorios_min, orcamento_max, empreendimento_id, imovel_interesse_id",
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
  p: { tipo: TipoDeLink; leadId: string; corretorId: string; dados: Record<string, unknown>; nome: string },
): Promise<LinkCriado> {
  const { data, error } = await supabase
    .from("links_do_cliente")
    .insert({ tipo: p.tipo, lead_id: p.leadId, corretor_id: p.corretorId, dados: p.dados as never })
    .select("token")
    .single();
  if (error || !data) return { erro: "Não foi possível criar o link agora." };
  revalidatePath(`/corretor/leads/${p.leadId}`);
  const url = `${site.url}${caminhoDoLink(p.tipo, data.token)}`;
  const primeiroNome = p.nome.trim().split(/\s+/)[0] || null;
  return { url, mensagem: mensagemParaCliente({ tipo: p.tipo, primeiroNome, url }) };
}

/**
 * Seleção personalizada: os imóveis publicados que mais combinam com o que o
 * lead declarou (`compatibilidade.ts`), com o imóvel de interesse dele na
 * frente quando existe. Sem nenhum critério e sem imóvel de interesse, não
 * há o que selecionar — a tela pede para qualificar primeiro.
 */
export async function criarSelecao(leadId: string): Promise<LinkCriado> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  const { supabase, lead, corretor } = r;

  const catalogo = await getEmpreendimentos().catch(() => []);
  const interesse = [lead.imovel_interesse_id, lead.empreendimento_id].filter(Boolean) as string[];
  const primeiros = catalogo.filter((e) => e.id && interesse.includes(e.id));
  const compativeis = ordenarCompativeis(catalogo, (e) =>
    compatibilidade(
      {
        regiaoInteresse: lead.regiao_interesse,
        dormitoriosMin: lead.dormitorios_min,
        orcamentoMax: lead.orcamento_max != null ? Number(lead.orcamento_max) : null,
      },
      {
        cidade: e.cidade,
        bairro: e.bairro,
        precoAPartir: e.precoAPartir,
        dormitorios: e.tipologias.map((t) => t.dormitorios),
      },
    ),
  );
  const ids = [...new Set([...primeiros, ...compativeis].map((e) => e.id!).filter(Boolean))].slice(
    0,
    IMOVEIS_NA_SELECAO,
  );
  if (ids.length === 0) {
    return {
      erro: "Nenhum imóvel combina ainda. Preencha região, dormitórios ou orçamento na qualificação.",
    };
  }

  return gravar(supabase, {
    tipo: "selecao",
    leadId,
    corretorId: corretor.id,
    nome: lead.nome,
    // Só os imóveis: a renda do cliente não viaja num link compartilhável.
    dados: { empreendimentos: ids },
  });
}

export async function criarLinkDeDocumentos(leadId: string): Promise<LinkCriado> {
  const r = await leadDaCarteira(leadId);
  if ("erro" in r) return { erro: r.erro! };
  return gravar(r.supabase, {
    tipo: "documentos",
    leadId,
    corretorId: r.corretor.id,
    nome: r.lead.nome,
    dados: { itens: [...DOCUMENTOS_PADRAO] },
  });
}
