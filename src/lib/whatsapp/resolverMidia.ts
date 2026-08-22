import type { Empreendimento } from "@/lib/types";
import { site } from "@/lib/site";

/**
 * Resolve o que a IA PEDIU (slug + tipo) para as URLs reais do catálogo.
 *
 * Antes, a IA tinha de escrever a URL inteira no JSON. Elas são assim:
 *
 *   https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/
 *   empreendimentos/vitra-alphaville-vt110/planta-big-4437ee1f8f0ca0135bd73540a6063059.jpg
 *
 * Ou seja: pedíamos a um modelo de linguagem que copiasse um hash de 32
 * caracteres sem errar um dígito. Um caractere fora e o guardrail — com
 * razão — bloqueava o anexo. A telemetria de produção não deixa dúvida:
 * **0 anexos enviados e 6 bloqueados** em 22 interações. Nenhuma foto,
 * nenhuma planta chegou a um cliente.
 *
 * A correção não é afrouxar o guardrail: é parar de pedir o impossível. A
 * IA agora escolhe pelo que ela realmente sabe — o slug do imóvel e o tipo
 * de mídia — e o código busca as URLs no catálogo. Alucinação de URL deixa
 * de ser possível por construção, e o guardrail vira rede de segurança em
 * vez de gargalo.
 */

/** O que a IA pede: nunca uma URL. */
export type PedidoMidia = {
  slug: string;
  tipo: "foto" | "planta" | "video" | "tour360";
  /** Quantas peças enviar. Sem isso, "manda as fotos" viraria 15 anexos. */
  quantidade?: number;
};

export type AnexoResolvido = {
  tipo: PedidoMidia["tipo"];
  url: string;
  titulo: string;
};

/**
 * Teto de anexos por resposta.
 *
 * O WhatsApp entrega mídia uma a uma, com pausa entre elas (ver o laço de
 * envio no webhook). Sete fotos viram sete notificações e quase um minuto
 * segurando a função. Três é o que um corretor manda de verdade quando
 * alguém pede "umas fotos".
 */
export const MAXIMO_ANEXOS = 3;

function midiasDoTipo(imovel: Empreendimento, tipo: PedidoMidia["tipo"]) {
  switch (tipo) {
    case "planta":
      return imovel.plantas ?? [];
    case "video":
      return imovel.videos ?? [];
    case "tour360":
      return imovel.tours360 ?? [];
    case "foto":
    default: {
      // A capa é a primeira foto e já vem em `midias`; usar as duas fontes
      // duplicaria o primeiro anexo.
      const fotos = (imovel.midias ?? []).filter((m) => m.tipo === "foto");
      return fotos.length > 0 ? fotos : imovel.capa?.url ? [imovel.capa] : [];
    }
  }
}

export function resolverAnexos(
  pedidos: PedidoMidia[] | undefined,
  catalogo: Empreendimento[],
): { anexos: AnexoResolvido[]; pedidosSemMidia: string[] } {
  const anexos: AnexoResolvido[] = [];
  const pedidosSemMidia: string[] = [];
  const jaIncluidas = new Set<string>();

  for (const pedido of pedidos ?? []) {
    if (anexos.length >= MAXIMO_ANEXOS) break;
    if (!pedido?.slug || !pedido?.tipo) continue;

    const imovel = catalogo.find((e) => e.slug === pedido.slug);
    if (!imovel) {
      // Slug que não existe: a IA inventou o imóvel. Não é anexo faltando,
      // é alucinação — e quem reporta isso é o guardrail.
      pedidosSemMidia.push(`${pedido.slug} (imóvel fora do catálogo)`);
      continue;
    }

    const disponiveis = midiasDoTipo(imovel, pedido.tipo);
    if (disponiveis.length === 0) {
      pedidosSemMidia.push(`${imovel.nome} não tem ${pedido.tipo} cadastrada`);
      continue;
    }

    const quantos = Math.max(1, Math.min(pedido.quantidade ?? 1, MAXIMO_ANEXOS - anexos.length));
    for (const midia of disponiveis.slice(0, quantos)) {
      if (jaIncluidas.has(midia.url)) continue;
      jaIncluidas.add(midia.url);
      anexos.push({
        tipo: pedido.tipo,
        url: midia.url,
        titulo: midia.alt || `${pedido.tipo} — ${imovel.nome}`,
      });
    }
  }

  return { anexos, pedidosSemMidia };
}

/**
 * A página do imóvel no site — a "apresentação digital".
 *
 * Montada por código a partir do slug, nunca escrita pela IA: é o mesmo
 * princípio das mídias, e aqui um link errado levaria o cliente a um 404
 * com a marca da imobiliária em cima.
 */
export function linkDaPagina(slug: string): string {
  return `${site.url}/empreendimentos/${slug}`;
}
