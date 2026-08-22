import type { Empreendimento } from "@/lib/types";
import type { RespostaAgenteIA } from "./aiAgent";
import { soarHumano } from "./vozHumana";

/**
 * Guardrails de saída: nada sai para o WhatsApp do cliente sem conferir
 * contra o catálogo.
 *
 * O modelo é instruído a só usar mídias do catálogo — mas instrução não é
 * garantia, e uma URL alucinada ia direto para `sendMedia` como anexo real
 * (o único filtro era `a?.url` truthy). Aqui é o trilho do padrão híbrido
 * "trilho + IA": a conversa é livre, os FATOS (mídia, imóvel citado) são
 * validados por código.
 *
 * Além dos fatos, o trilho normaliza a VOZ: `soarHumano` tira o markdown
 * que o WhatsApp não renderiza e as aberturas de manual de atendimento.
 * Isso mora aqui, e não só no prompt, porque instrução de prompt é
 * probabilística — falha justo na resposta que importa — enquanto uma
 * função determinística vale sempre e é testável.
 *
 * Módulo puro de propósito: sem rede e sem banco, para o eval e o vitest
 * exercitarem exatamente o que roda em produção.
 */

export type RespostaSaneada = {
  resposta: RespostaAgenteIA;
  /** Telemetria: quanta alucinação o trilho segurou (ver ia_interacoes). */
  anexosBloqueados: number;
  slugsBloqueados: number;
};

/** Toda URL que o catálogo de fato oferece — o universo permitido de anexos. */
function urlsDoCatalogo(catalogo: Empreendimento[]): Set<string> {
  const urls = new Set<string>();
  for (const e of catalogo) {
    if (e.capa?.url) urls.add(e.capa.url);
    if (e.bookUrl) urls.add(e.bookUrl);
    for (const p of e.plantas ?? []) urls.add(p.url);
    for (const v of e.videos ?? []) urls.add(v.url);
    for (const m of e.midias ?? []) urls.add(m.url);
  }
  return urls;
}

export function sanearRespostaIA(
  resposta: RespostaAgenteIA,
  catalogo: Empreendimento[],
): RespostaSaneada {
  const urlsPermitidas = urlsDoCatalogo(catalogo);
  const slugsPermitidos = new Set(catalogo.map((e) => e.slug));

  const anexosValidos = (resposta.anexosMidia ?? []).filter(
    (a) => a?.url && urlsPermitidas.has(a.url),
  );
  const recomendadosValidos = (resposta.imoveisRecomendados ?? []).filter(
    (r) => r?.slug && slugsPermitidos.has(r.slug),
  );

  return {
    resposta: {
      ...resposta,
      textoResposta: soarHumano(resposta.textoResposta ?? ""),
      anexosMidia: anexosValidos,
      imoveisRecomendados: recomendadosValidos,
    },
    anexosBloqueados: (resposta.anexosMidia?.length ?? 0) - anexosValidos.length,
    slugsBloqueados: (resposta.imoveisRecomendados?.length ?? 0) - recomendadosValidos.length,
  };
}
