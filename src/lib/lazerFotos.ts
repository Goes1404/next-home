import type { Midia } from "@/lib/types";

/**
 * Casa um item de lazer ("Piscina adulto") com a foto da galeria que o
 * mostra, lendo o texto alternativo das mídias.
 *
 * Por que por ALT e não por uma coluna própria: `lazer_itens` tem só `nome` e
 * `icone` — e os 69 itens cadastrados em produção estão com `icone` nulo. Não
 * existe, hoje, vínculo foto↔item no banco. O alt é o único lugar onde essa
 * informação já foi escrita por gente.
 *
 * O corolário incômodo, medido em 24/08/2026: das 265 fotos de produção,
 * **257 têm alt igual ao nome do empreendimento** ("Estação 267" repetido 16
 * vezes) e só 8 são descritivas. Ou seja, hoje o casamento acerta em poucos
 * imóveis — e é assim que tem que ser. Inventar uma foto qualquer para o item
 * "Academia" seria mostrar ao cliente uma sala de estar dizendo que é a
 * academia. Sem foto casada, o item não vira botão (mesmo princípio do "sem
 * coordenada, sem pin" do mapa).
 *
 * Para ligar isso no catálogo inteiro basta preencher os alts das fotos.
 */

/**
 * Substantivos que nomeiam QUALQUER coisa ("Espaço Gourmet", "Espaço Pet",
 * "Área de Serviço", "Área de Lazer"). Sozinhos não identificam nada, então
 * quando o item começa por um deles o casamento passa a exigir também a
 * palavra que de fato o especifica. Sem essa regra, tocar em "Espaço Gourmet"
 * mostrava a foto do espaço PET — falso positivo pego no teste.
 */
const GENERICAS = new Set(["espaco", "area", "ambiente", "sala", "local", "lugar", "centro"]);

/** Não carregam significado para o casamento — "Churrasqueira com Piscina". */
const VAZIAS = new Set([
  "com", "sem", "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os",
  "para", "em", "no", "na", "nos", "nas", "ao", "aos", "um", "uma",
]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !VAZIAS.has(t));
}

/**
 * Pontua o quanto uma foto representa o item. Zero significa "não é ela".
 *
 * O token PRINCIPAL (a primeira palavra significativa do item — "piscina" em
 * "Piscina adulto") é obrigatório: sem essa trava, "Espaço Gourmet" casaria
 * com "Espaço pet place" pelo "espaço", e o cliente veria cachorro no lugar
 * da churrasqueira.
 */
export function pontuarFoto(item: string, alt: string): number {
  const doItem = tokens(item);
  const daFoto = new Set(tokens(alt));
  if (doItem.length === 0 || daFoto.size === 0) return 0;

  const [principal, ...resto] = doItem;
  if (!daFoto.has(principal)) return 0;

  // "Espaço"/"Área" não identificam nada sozinhos: exigem a palavra que
  // especifica o item ("gourmet", "pet", "serviço") também presente na foto.
  const especificos = resto.filter((t) => daFoto.has(t));
  if (GENERICAS.has(principal) && especificos.length === 0) return 0;

  // A frase inteira no alt ("piscina adulto") vale mais que só o substantivo,
  // para "Piscina adulto" preferir a foto da piscina adulto à da infantil.
  const frase = normalizar(alt).includes(normalizar(item)) ? 4 : 0;
  return 2 + frase + especificos.length;
}

/**
 * Devolve a melhor foto para cada item de lazer. Item sem foto convincente
 * fica de fora do mapa — quem consome usa isso para decidir se o item é
 * clicável.
 *
 * Uma mesma foto pode servir a dois itens (a foto da piscina serve a "Piscina"
 * e a "Piscina aquecida"): reservar a foto para o primeiro item deixaria o
 * segundo sem nada por acidente de ordenação.
 */
export function fotosDoLazer(itens: string[], fotos: Midia[]): Map<string, Midia> {
  const mapa = new Map<string, Midia>();

  for (const item of itens) {
    let melhor: Midia | null = null;
    let melhorPonto = 0;

    for (const foto of fotos) {
      const ponto = pontuarFoto(item, foto.alt);
      if (ponto > melhorPonto) {
        melhorPonto = ponto;
        melhor = foto;
      }
    }

    if (melhor) mapa.set(item, melhor);
  }

  return mapa;
}
