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

/**
 * O que já foi mandado nesta conversa, lido do próprio histórico.
 *
 * Cada anexo enviado deixa uma nota de auditoria no Live Chat no formato
 * `📎 título: url` (ver o webhook). A URL é única por arquivo, então ela
 * serve de identidade sem precisar de tabela nova — e funciona para as
 * conversas que já existem, sem backfill.
 *
 * Isto existe porque a IA entrava em LOOP de fotos: mandava as mesmas
 * imagens a cada duas ou três mensagens, e a conversa parava de andar. Uma
 * regra de prompt pedindo "não repita" é probabilística; a lista do que já
 * saiu é um fato, e o fato ganha.
 *
 * Nota do CORRETOR conta também: desde que o painel envia anexo
 * (`enviarMidiaDoPainel`), a foto que ele mandou pelo Live Chat já chegou
 * ao cliente — a IA reenviá-la seria o mesmo loop com outro remetente. Só
 * a fala do CLIENTE fica de fora: URL citada por ele não é anexo nosso.
 */
export function midiasJaEnviadas(
  historico: { remetente: string; texto: string }[] | undefined,
): Set<string> {
  const urls = new Set<string>();
  for (const m of historico ?? []) {
    if (m.remetente !== "bot" && m.remetente !== "corretor") continue;
    for (const linha of m.texto.split("\n")) {
      const marcador = linha.indexOf("📎");
      if (marcador === -1) continue;
      const url = linha.slice(marcador).match(/https?:\/\/\S+/)?.[0];
      if (url) urls.add(url);
    }
  }
  return urls;
}

export function resolverAnexos(
  pedidos: PedidoMidia[] | undefined,
  catalogo: Empreendimento[],
  jaEnviadas: Set<string> = new Set(),
): { anexos: AnexoResolvido[]; pedidosSemMidia: string[]; repetidos: number } {
  const anexos: AnexoResolvido[] = [];
  const pedidosSemMidia: string[] = [];
  const jaIncluidas = new Set<string>();
  let repetidos = 0;

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

    /*
     * Pula o que já saiu nesta conversa ANTES de contar a quantidade: se o
     * cliente já recebeu as duas primeiras fotos, "manda mais uma" tem de
     * trazer a TERCEIRA, não repetir as duas e completar com uma nova.
     */
    const inéditas = disponiveis.filter((m) => !jaEnviadas.has(m.url));
    repetidos += disponiveis.length - inéditas.length;
    if (inéditas.length === 0) {
      pedidosSemMidia.push(`${imovel.nome}: ${pedido.tipo} já enviada nesta conversa`);
      continue;
    }

    const quantos = Math.max(1, Math.min(pedido.quantidade ?? 1, MAXIMO_ANEXOS - anexos.length));
    for (const midia of inéditas.slice(0, quantos)) {
      if (jaIncluidas.has(midia.url)) continue;
      jaIncluidas.add(midia.url);
      anexos.push({
        tipo: pedido.tipo,
        url: midia.url,
        titulo: midia.alt || `${pedido.tipo} — ${imovel.nome}`,
      });
    }
  }

  return { anexos, pedidosSemMidia, repetidos };
}

/**
 * A página do imóvel no site — a "apresentação digital".
 *
 * Montada por código a partir do slug, nunca escrita pela IA: é o mesmo
 * princípio das mídias, e aqui um link errado levaria o cliente a um 404
 * com a marca da imobiliária em cima.
 */
/**
 * O catálogo do corretor É a página dele na plataforma, não um PDF.
 *
 * `?corretor=<slug>` na raiz é detectado pelo `proxy.ts` e leva direto ao
 * catálogo com aquele corretor vinculado — todo CTA dali em diante fala com
 * ele. Isso resolve o material de apoio melhor que um arquivo: nunca
 * desatualiza, não precisa de upload, e o cliente cai num lugar onde pode
 * navegar em vez de rolar um PDF no celular.
 */
export function linkDoCatalogo(slugCorretor: string): string {
  return `${site.url}/?corretor=${slugCorretor}`;
}

/**
 * Põe o link do catálogo na resposta, e é o CÓDIGO que o escreve.
 *
 * Antes o prompt mandava a IA copiar o endereço "exatamente, sem alterar
 * nada". O eval mostrou que ela manda em cerca de METADE das rodadas — e
 * link de atribuição que funciona em metade das vezes é pior que não ter,
 * porque a falha é intermitente e ninguém percebe. É a mesma lição que a
 * mídia já tinha ensinado (0 anexos enviados, 6 bloqueados, até o código
 * passar a montar a URL a partir do slug).
 *
 * Também conserta o caso em que ela escreveu um `?corretor=` por conta
 * própria: qualquer variação vira o link certo, porque um slug errado leva
 * o cliente a uma home sem vínculo e a atribuição do lead se perde.
 */
export function anexarLinkDoCatalogo(
  texto: string,
  slugCorretor: string | null | undefined,
): { texto: string; anexou: boolean } {
  const slug = slugCorretor?.trim();
  if (!slug) return { texto, anexou: false };

  const certo = linkDoCatalogo(slug);
  if (texto.includes(certo)) return { texto, anexou: false };

  /*
   * Link de catálogo escrito pela IA, com slug errado ou truncado. Sem
   * `.test()` de propósito: regex global guarda `lastIndex` entre chamadas
   * e o segundo teste sairia do lugar errado.
   */
  const corrigido = texto.replace(/https?:\/\/\S*\?corretor=\S*/gi, certo);
  if (corrigido !== texto) return { texto: corrigido, anexou: true };

  return { texto: `${texto.trim()} --- ${certo}`.trim(), anexou: true };
}

export function linkDaPagina(slug: string): string {
  return `${site.url}/empreendimentos/${slug}`;
}
