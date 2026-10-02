/**
 * Limpeza de exibição do texto do cadastro (02/10/2026).
 *
 * Os imóveis importados de portal chegaram com dois defeitos que a página do
 * imóvel mostrava ao cliente:
 *
 * 1. A "frase de destaque" (`tagline`) era o começo da descrição: em uns,
 *    a primeira linha inteira, que então aparecia DUAS vezes seguidas na
 *    seção Sobre; em outros, os primeiros 160 caracteres cortados no meio de
 *    uma palavra, que viravam título.
 * 2. Frases coladas sem espaço ("…em Osasco!Descubra…",
 *    "Características:Academia"), resto de quebras de linha perdidas.
 *
 * Mora no mapper, e não na tela, para que site, prompt da assistente e
 * legenda de rede social recebam o mesmo texto. Nada aqui inventa conteúdo:
 * só separa o que veio colado e tira o que se repete.
 */

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Frase de destaque mais longa que isso não é título, é parágrafo. */
const TETO_DA_FRASE = 120;

/**
 * Separa frases que o import colou. Só age em fronteira inequívoca:
 * "!" ou "?" seguidos de maiúscula; "." depois de pelo menos três
 * minúsculas (para não quebrar "Jd.Esperança" nem "Av.Paulista");
 * ":" seguido de maiúscula, que vira ": "; e vírgula entre letras, que
 * ganha o espaço (número decimal, "52,39", não é tocado).
 */
export function separarFrasesColadas(texto: string): string {
  return texto
    .replace(/([\p{Ll}\d])([!?]+)(\p{Lu})/gu, "$1$2\n\n$3")
    .replace(/(\p{Ll}{3})\.(\p{Lu}\p{Ll})/gu, "$1.\n\n$2")
    .replace(/(\p{Ll}):(\p{Lu})/gu, "$1: $2")
    .replace(/(\p{Ll}),(\p{L})/gu, "$1, $2");
}

export function textoDoCadastro(
  nome: string,
  taglineCrua: string | null | undefined,
  descricaoCrua: string | null | undefined,
): { tagline: string; descricao: string } {
  let descricao = separarFrasesColadas((descricaoCrua ?? "").trim());
  let tagline = separarFrasesColadas((taglineCrua ?? "").trim()).replace(/\s+/g, " ");

  if (tagline) {
    const t = normal(tagline);
    const paragrafos = descricao.split(/\n\s*\n/);
    const primeiro = normal(paragrafos[0] ?? "");

    if (t && primeiro === t && paragrafos.length > 1) {
      // A frase é o primeiro parágrafo: fica como título, sai da descrição.
      descricao = paragrafos.slice(1).join("\n\n").trim();
    } else if (t && normal(descricao).startsWith(t)) {
      // Começo da descrição cortado: não é título, e a descrição já o tem.
      tagline = "";
    }

    const n = normal(nome);
    if (tagline && n && t.includes(n) && t.split(" ").length - n.split(" ").length <= 3) {
      // "Bosque AlphaGran", "Bless Parque Barueri", "Lançamento em Barueri
      // Breeze Home Clube": o nome e no máximo três palavras de enfeite. O
      // nome já é o título da página; repetido como frase, aparecia três
      // vezes na mesma tela.
      tagline = "";
    }
    if (tagline.length > TETO_DA_FRASE) tagline = "";
  }

  return { tagline, descricao };
}
