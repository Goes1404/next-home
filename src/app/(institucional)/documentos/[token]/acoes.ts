"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { after } from "next/server";
import { nomeSeguro, problemaDoArquivo, TETO_DOCUMENTOS_POR_LINK } from "@/lib/crm/linksDoCliente";
import { avisarCorretorDoLink, registrarEventoDoLink } from "@/lib/crm/eventosDoLink";
import { documentacaoDoLink } from "@/lib/crm/documentacaoDados";
import { arquivosNaPasta, autorizarEnvio, conferirArquivoEnviado } from "@/lib/crm/envioAutorizado";

/**
 * O cliente envia um documento pelo link (26/09/2026; em dois tempos desde
 * 16/10/2026).
 *
 * Endpoint PÚBLICO — o token é a credencial, e tudo é conferido aqui:
 * link válido e do tipo certo, item que está na lista pedida, tamanho e
 * formato, e teto de arquivos por link (sem ele, um link vazado viraria
 * depósito de arquivo). O arquivo vai para o bucket PRIVADO; ninguém lê sem
 * URL assinada gerada para o corretor.
 *
 * O arquivo NÃO passa por aqui: `prepararEnvio` autoriza um caminho, o
 * navegador sobe direto ao armazenamento e `confirmarEnvio` confere o que
 * chegou (`envioAutorizado.ts`). Pela Server Action, todo arquivo acima de
 * 4,5 MB morria na Vercel antes do nosso código.
 *
 * Foto pequena demais para o banco ler ganha um `alerta` que só o corretor
 * vê: o envio NÃO é recusado — recusar travaria o cliente num celular com
 * câmera ruim, e quem decide se dá para ler é quem vai levar ao banco.
 *
 * O primeiro documento e a lista completa avisam o corretor no WhatsApp
 * (`eventosDoLink.ts`). A lista completa NÃO muda a etapa do lead: mover
 * para "documentação" é julgamento do corretor (`etapaAutomatica.test.ts`).
 */

const LINK_VENCIDO = "Este link venceu. Peça um novo ao seu corretor.";
/** Arquivos na pasta de envios do lead, confirmados ou não: um link vazado não enche o bucket. */
const TETO_DA_PASTA = TETO_DOCUMENTOS_POR_LINK * 3;

async function itemDoLink(token: string, item: string) {
  const link = await lerLinkPublico(token, "documentos", { previa: true });
  if (!link) return { erro: LINK_VENCIDO } as const;
  // A lista é a do lead como está agora (0179), na fase do link.
  const supabase = createServiceClient();
  const lista = await documentacaoDoLink(supabase, link.leadId, link.dados);
  const doItem = lista.itens.find((i) => i.item === item);
  if (!doItem) return { erro: "Este documento saiu da lista. Recarregue a página para ver a lista atual." } as const;
  if (doItem.situacao === "conferido") return { erro: "Este documento já foi conferido pelo seu corretor." } as const;
  return { link, lista, supabase } as const;
}

async function passouDoTeto(supabase: ReturnType<typeof createServiceClient>, token: string): Promise<boolean> {
  const { count } = await supabase
    .from("lead_documentos")
    .select("id", { count: "exact", head: true })
    .eq("link_token", token);
  return (count ?? 0) >= TETO_DOCUMENTOS_POR_LINK;
}

const MUITOS_ARQUIVOS = "Este link já recebeu muitos arquivos. Fale com seu corretor.";

/** 1º tempo: confere o pedido e devolve a autorização de subir UM arquivo. */
export async function prepararEnvio(p: {
  token: string;
  item: string;
  nome: string;
  tamanho: number;
  tipo: string;
}): Promise<{ caminho: string; autorizacao: string } | { erro: string }> {
  const ctx = await itemDoLink(p.token, p.item);
  if ("erro" in ctx) return { erro: ctx.erro! };
  const problema = problemaDoArquivo({ size: p.tamanho, type: p.tipo, name: p.nome });
  if (problema) return { erro: problema };
  if (await passouDoTeto(ctx.supabase, p.token)) return { erro: MUITOS_ARQUIVOS };

  const pasta = `${ctx.link.leadId}/envios`;
  if ((await arquivosNaPasta(ctx.supabase, pasta, TETO_DA_PASTA)) >= TETO_DA_PASTA) return { erro: MUITOS_ARQUIVOS };
  return autorizarEnvio(ctx.supabase, `${pasta}/${crypto.randomUUID()}-${nomeSeguro(p.nome)}`);
}

/** 2º tempo: confere o que chegou ao armazenamento e registra na lista. */
export async function confirmarEnvio(p: {
  token: string;
  item: string;
  caminho: string;
  nome: string;
}): Promise<{ ok?: true; erro?: string }> {
  const ctx = await itemDoLink(p.token, p.item);
  if ("erro" in ctx) return { erro: ctx.erro! };
  const { link, lista, supabase } = ctx;
  // O caminho vem do navegador: só vale o que este link autorizou.
  if (!p.caminho.startsWith(`${link.leadId}/envios/`) || p.caminho.includes("..")) {
    return { erro: "Envio não reconhecido. Toque em enviar de novo." };
  }
  const { count: jaRegistrado } = await supabase
    .from("lead_documentos")
    .select("id", { count: "exact", head: true })
    .eq("caminho", p.caminho);
  if ((jaRegistrado ?? 0) > 0) return { ok: true };
  if (await passouDoTeto(supabase, p.token)) {
    await supabase.storage.from("documentos-clientes").remove([p.caminho]);
    return { erro: MUITOS_ARQUIVOS };
  }

  const arquivo = await conferirArquivoEnviado(supabase, p.caminho);
  if ("erro" in arquivo) return { erro: arquivo.erro };

  const { error } = await supabase.from("lead_documentos").insert({
    lead_id: link.leadId,
    corretor_id: link.corretorId,
    link_token: p.token,
    item: p.item,
    caminho: p.caminho,
    nome_arquivo: p.nome.slice(0, 120),
    tamanho: arquivo.tamanho,
    mime: arquivo.mime,
    alerta: arquivo.alerta,
    // Antes da 0179 a coluna não existe: mandar a fase recusaria o insert.
    ...(lista.migrado ? { fase: lista.fase } : {}),
  });
  if (error) {
    // Sem a linha, o arquivo ficaria órfão no bucket e invisível ao corretor.
    console.error("[documentos] envio não registrado:", error.message);
    await supabase.storage.from("documentos-clientes").remove([p.caminho]);
    return { erro: "O arquivo chegou, mas não foi possível registrá-lo. Toque em enviar de novo." };
  }
  after(() =>
    registrarAvanco(supabase, {
      token: p.token,
      leadId: link.leadId,
      corretorId: link.corretorId,
      item: p.item,
      dados: link.dados,
    }),
  );
  return { ok: true };
}

/** Evento do documento e, quando cabe, o aviso ao corretor. */
async function registrarAvanco(
  supabase: ReturnType<typeof createServiceClient>,
  p: { token: string; leadId: string; corretorId: string; item: string; dados: Record<string, unknown> },
): Promise<void> {
  const [{ data: anteriores }, lista, { data: lead }] = await Promise.all([
    supabase.from("links_do_cliente_eventos").select("tipo").eq("token", p.token),
    documentacaoDoLink(supabase, p.leadId, p.dados),
    supabase.from("leads").select("nome").eq("id", p.leadId).maybeSingle(),
  ]);
  const ja = new Set((anteriores ?? []).map((e) => e.tipo));
  const base = { token: p.token, leadId: p.leadId, corretorId: p.corretorId };

  await registrarEventoDoLink(supabase, { ...base, tipo: "documento", detalhe: p.item });
  if (!ja.has("documento")) {
    await avisarCorretorDoLink(supabase, { ...base, tipo: "documento", nomeLead: lead?.nome ?? null, detalhe: p.item });
  }

  // "Completa" é a mesma conta da ficha: todo item com arquivo e nenhum
  // recusado esperando o cliente (`resumirLista`).
  if (lista.completa && !ja.has("documentos_completos")) {
    await registrarEventoDoLink(supabase, { ...base, tipo: "documentos_completos" });
    await avisarCorretorDoLink(supabase, { ...base, tipo: "documentos_completos", nomeLead: lead?.nome ?? null });
  }
}
