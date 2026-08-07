/**
 * Dados institucionais da Next Home.
 * Fonte única de verdade para NAP (nome/endereço/telefone), usada tanto na
 * interface quanto no JSON-LD — o Google penaliza divergência entre os dois.
 */

export const site = {
  nome: "Next Home",
  nomeCompleto: "Next Home Negócios Imobiliários",
  creci: "044589-J",
  descricao:
    "Portfólio de empreendimentos em Alphaville, Barueri, Santana de Parnaíba e Osasco. Lançamentos, alto padrão e oportunidades selecionadas.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nexthomeimobiliaria.com.br",

  endereco: {
    logradouro: "Calçada Antares, 264 — 2º andar",
    bairro: "Alphaville",
    cidade: "Santana de Parnaíba",
    uf: "SP",
    cep: "06541-065",
  },

  /** Formato E.164 em `numero`, legível em `label`. */
  whatsapp: [
    { numero: "5511972207204", label: "(11) 97220-7204" },
    { numero: "5511973330660", label: "(11) 97333-0660" },
  ],

  social: {
    instagram: "https://www.instagram.com/next_home_imoveis/",
    facebook: "https://www.facebook.com/nexthomeimoveis",
    youtube: "https://www.youtube.com/@nexthomeimoveis",
    linkedin: "https://www.linkedin.com/company/next-home-imoveis",
  },

  /** Regiões de atuação — alimenta filtros e texto de SEO local. */
  regioes: [
    "Alphaville",
    "Barueri",
    "Santana de Parnaíba",
    "Osasco",
    "Itapevi",
  ],
} as const;

export const enderecoLinha = `${site.endereco.logradouro} — ${site.endereco.bairro}, ${site.endereco.cidade}/${site.endereco.uf}`;

/**
 * Monta o link de WhatsApp com mensagem pré-preenchida.
 * O empreendimento entra na mensagem para o corretor já saber o contexto.
 */
export function linkWhatsapp(empreendimento?: string, indice = 0): string {
  const alvo = site.whatsapp[indice] ?? site.whatsapp[0];
  const texto = empreendimento
    ? `Olá! Vim pelo site e quero saber mais sobre o ${empreendimento}.`
    : "Olá! Vim pelo site e quero falar com um corretor.";
  return `https://wa.me/${alvo.numero}?text=${encodeURIComponent(texto)}`;
}
