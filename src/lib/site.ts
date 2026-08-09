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
 * Vídeo de fundo do hero da home — prédios, lazer, algo que traga sensação
 * de paz e pertencimento. Fica `null` até haver um arquivo definitivo; a
 * home cai de volta na imagem estática enquanto isso. Para ativar: suba um
 * .mp4 (H.264, sem áudio, ~15–25s em loop, idealmente < 8 MB) no bucket
 * público `empreendimentos` do Supabase Storage e cole a URL aqui.
 */
export const HERO_VIDEO_URL: string | null =
  "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/hero-video.mp4";

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
    ? `Olá! Vim pelo site e quero saber mais sobre o ${empreendimento}.`
    : "Olá! Vim pelo site e quero falar com um corretor.";
  return linkWhatsappPara(alvo.numero, texto);
}
