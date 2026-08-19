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
    "Sua imobiliária de confiança em Alphaville, Barueri, Santana de Parnaíba e região. As melhores oportunidades em apartamentos, casas, lançamentos na planta e prontos para morar com condições facilitadas e assessoria completa.",
  keywords: [
    "imobiliária em alphaville",
    "apartamentos em alphaville barueri",
    "lançamentos na planta alphaville",
    "oportunidades imobiliárias barueri",
    "casas em condomínio alphaville",
    "comprar apartamento santana de parnaíba",
    "imóveis em barueri",
    "anunciar imóvel alphaville",
    "next home imóveis",
    "corretor de imóveis alphaville",
    "imobiliária barueri e região",
  ],
  /**
   * Endereço onde este site realmente está publicado.
   *
   * **Não** é `nexthomeimobiliaria.com.br`: esse domínio ainda aponta para o
   * site legado (Migmidia) e não está conectado ao projeto na Vercel. Como
   * `site.url` monta o link pessoal que o corretor copia no painel, apontar
   * para lá jogava o cliente dele no site antigo — o link chegava quebrado
   * em toda conversa de WhatsApp.
   *
   * Também alimenta canonical, sitemap e JSON-LD, que precisam apontar para
   * onde o conteúdo de fato está.
   *
   * No dia da virada de DNS, basta definir `NEXT_PUBLIC_SITE_URL` nas
   * variáveis de ambiente da Vercel com o domínio final — sem tocar no
   * código.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://next-home-drab.vercel.app",

  endereco: {
    logradouro: "Calçada Antares, 264 — 2º andar",
    bairro: "Alphaville",
    cidade: "Santana de Parnaíba",
    uf: "SP",
    cep: "06541-065",
    // Centroide da via (geocodificado via Nominatim) — o cadastro não tem
    // coordenada exata do prédio, mesma honestidade de escala usada no
    // mapa de cada empreendimento (ver Localizacao.tsx).
    lat: -23.4633543,
    lng: -46.8774165,
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
 * Vídeo de fundo do hero — servido como asset estático (`public/video/`) em
 * vez do bucket do Supabase Storage porque agora ele não toca sozinho: o
 * scroll da página controla o quadro exibido (ver HeroVideoBackground),
 * então o arquivo precisa estar disponível desde o primeiro request, sem
 * depender de uma URL externa.
 */
export const HERO_VIDEO_URL: string | null = "/video/hero-scroll.mp4";

/** Monta um link `wa.me` para qualquer número em E.164, com mensagem pré-preenchida. */
export function linkWhatsappPara(numero: string, mensagem: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Link de WhatsApp para a linha geral da imobiliária, com mensagem
 * pré-preenchida. Use `linkWhatsappPara` diretamente quando o contato for
 * com um corretor específico (ex.: o responsável por um empreendimento).
 */
export function linkWhatsapp(empreendimento?: string, indice = 0): string {
  const alvo = site.whatsapp[indice] ?? site.whatsapp[0];
  const texto = empreendimento
    ? `Olá! Vim pelo site e quero receber a tabela de valores e condições do ${empreendimento}.`
    : "Olá! Vim pelo site e quero conhecer as melhores oportunidades de imóveis.";
  return linkWhatsappPara(alvo.numero, texto);
}
