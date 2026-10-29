// A marca da PLATAFORMA (28/10/2026): Astro Soluções.
//
// Módulo PURO. A plataforma é o produto que a Astro Soluções vende a
// empresas que vendem e atendem pelo WhatsApp (imobiliárias, corretoras de
// seguros, escritórios de advocacia e outros ramos desde 29/10/2026, 0244) e
// a profissionais autônomos; cada cliente é um grupo, com a marca DELE
// (`marcaDoCrm/marca.ts`). Aqui fica só o que é da plataforma: o
// login, o ícone de quem não tem logo, a área `/plataforma` e a barra do
// topo do painel, que mostra "Astro Soluções | <imobiliária>" como os
// sistemas de gestão (TOTVS, SAP) mostram o produto e a empresa logada.
//
// Antes de 28/10/2026 a plataforma se chamava AstroImob; os arquivos de
// ícone e o endereço `astroimob.vercel.app` mantêm o nome antigo.

import { nomeDoRamo, type Ramo } from "@/lib/ramos/ramos";

export const MARCA_DA_PLATAFORMA = {
  nome: "Astro Soluções",
  /** As duas partes do nome escrito (a segunda sai em destaque). */
  wordmark: ["Astro", " Soluções"] as const,
  /** Rótulo curto da barra do topo e do suporte. */
  produto: "Astro CRM",
  frase: "O CRM que atende seus clientes no WhatsApp enquanto você vende.",
  // Geral desde 29/10/2026: o CRM é vendido a vários ramos, não só imobiliária.
  apoio: "Leads, conversas, agenda e vendas da sua empresa num lugar só.",
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

/**
 * O rótulo da conta na barra do topo: o tipo de cliente da plataforma. Na
 * imobiliária (o ramo padrão) é o de sempre; nos outros ramos (0244,
 * 29/10/2026) a barra mostra o RAMO ("Corretora de seguros", "Advocacia", o
 * texto do "Outro"), que é o que diz de quem é aquele CRM.
 */
export function rotuloDaConta(
  tipo: "imobiliaria" | "independente",
  ramo: Ramo = "imobiliaria",
  descricao: string | null = null,
): string {
  if (ramo !== "imobiliaria") return nomeDoRamo(ramo, descricao);
  return tipo === "independente" ? "Corretor autônomo" : "Imobiliária";
}

/**
 * O WhatsApp comercial da Astro, para a página de vendas. Vem de
 * `NEXT_PUBLIC_WHATSAPP_DA_ASTRO` (só dígitos, com DDI: 5511999999999).
 * Sem ele a página esconde o botão de conversa e fica só o "Entrar".
 */
export function linkDoWhatsAppDaAstro(
  numero = process.env.NEXT_PUBLIC_WHATSAPP_DA_ASTRO,
  texto = "Olá! Quero conhecer o CRM da Astro Soluções.",
): string | null {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (digitos.length < 12 || digitos.length > 13) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

/**
 * Os dados da empresa nas páginas legais (privacidade, termos, exclusão de
 * conta). Vêm da Vercel para não ficarem escritos no código antes de
 * confirmados: `NEXT_PUBLIC_CNPJ_DA_ASTRO`, `NEXT_PUBLIC_RAZAO_SOCIAL_DA_ASTRO`
 * e `NEXT_PUBLIC_EMAIL_DA_ASTRO`. Linha sem valor simplesmente não aparece.
 */
export function dadosDaEmpresa(env: Record<string, string | undefined> = process.env) {
  const limpo = (v: string | undefined) => (v ?? "").trim() || null;
  const email = limpo(env.NEXT_PUBLIC_EMAIL_DA_ASTRO);
  return {
    razaoSocial: limpo(env.NEXT_PUBLIC_RAZAO_SOCIAL_DA_ASTRO) ?? MARCA_DA_PLATAFORMA.nome,
    cnpj: limpo(env.NEXT_PUBLIC_CNPJ_DA_ASTRO),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  };
}

/** O texto de suporte que aparece nos avisos de limite e cobrança. */
export const SUPORTE_DA_PLATAFORMA = `o suporte da ${MARCA_DA_PLATAFORMA.nome}`;
