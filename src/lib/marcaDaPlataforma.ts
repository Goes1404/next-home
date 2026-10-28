// A marca da PLATAFORMA (28/10/2026): Astro Soluções.
//
// Módulo PURO. A plataforma é o produto que a Astro Soluções vende às
// imobiliárias e aos corretores autônomos; cada cliente é um grupo, com a
// marca DELE (`marcaDoCrm/marca.ts`). Aqui fica só o que é da plataforma: o
// login, o ícone de quem não tem logo, a área `/plataforma` e a barra do
// topo do painel, que mostra "Astro Soluções | <imobiliária>" como os
// sistemas de gestão (TOTVS, SAP) mostram o produto e a empresa logada.
//
// Antes de 28/10/2026 a plataforma se chamava AstroImob; os arquivos de
// ícone e o endereço `astroimob.vercel.app` mantêm o nome antigo.

export const MARCA_DA_PLATAFORMA = {
  nome: "Astro Soluções",
  /** As duas partes do nome escrito (a segunda sai em destaque). */
  wordmark: ["Astro", " Soluções"] as const,
  /** Rótulo curto da barra do topo e do suporte. */
  produto: "Astro CRM",
  frase: "O CRM que atende seus clientes no WhatsApp enquanto você vende.",
  apoio: "Leads, conversas, visitas e vendas da sua imobiliária num lugar só.",
  /** Azul-marinho e azul acinzentado do logo da Astro, com um brilho de estrela. */
  cores: {
    marinho: "#0f2547",
    acinzentado: "#5b7ba8",
    claro: "#a9c1e0",
    base: "#050b18",
    acento: "#2f5ea8",
    acentoHover: "#244c8c",
  },
} as const;

/** O rótulo da conta na barra do topo: o tipo de cliente da plataforma. */
export function rotuloDaConta(tipo: "imobiliaria" | "independente"): string {
  return tipo === "independente" ? "Corretor autônomo" : "Imobiliária";
}

/** O texto de suporte que aparece nos avisos de limite e cobrança. */
export const SUPORTE_DA_PLATAFORMA = `o suporte da ${MARCA_DA_PLATAFORMA.nome}`;
