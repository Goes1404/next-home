import type { Empreendimento } from "@/lib/types";

/**
 * A IA não inventa acabamento, material nem revestimento.
 *
 * Flagrado na medição da v33 (`quer-tudo-pelo-zap`), lendo a transcrição:
 * o cliente insistiu em detalhes do decorado e recebeu, em três turnos
 * seguidos, "piso laminado na sala e quartos", "bancadas em granito",
 * "azulejos modernos na cozinha" e "piso cerâmico de alta qualidade" no
 * banheiro. NADA disso existe no cadastro — não existe nem CAMPO para isso
 * em `empreendimentos`. Os quatro dados foram inventados e afirmados como
 * fato.
 *
 * É a mesma família do "1 suíte" para um imóvel cadastrado com 3, e do
 * "pronto para morar" com `em_construcao` na ficha: o que não está no
 * prompt, a IA preenche de cabeça. A diferença é o custo — acabamento é
 * verificável na visita, e o cliente que vai ver o piso laminado que
 * prometemos encontra outro. Quem paga essa conta é o corretor, na frente
 * do cliente.
 *
 * O corte só age quando NENHUM imóvel do catálogo do prompt menciona
 * acabamento na descrição — aí qualquer material citado é necessariamente
 * inventado. Havendo um que mencione (3 dos 25 publicados em 09/2026, um
 * deles com "Porcelanato" escrito na descrição), não dá para atribuir a
 * frase ao imóvel certo sem adivinhar, e adivinhar apagaria informação
 * verdadeira. Conservador de propósito, como `removerPrazoInventado`.
 */

/**
 * MATERIAL nomeado. É o que separa a promessa verificável do elogio vago:
 * "o acabamento é moderno" não promete nada e não é acusado; "piso
 * laminado na sala" é um fato que o cliente confere na visita.
 */
const MATERIAL =
  /\b(porcelanato|laminad[oa]s?|vin[íi]lic[oa]s?|cer[âa]mic[oa]s?|granito|m[áa]rmore|quartzo|azulejos?|gesso|inox|mdf|alvenaria|madeira\s+maci[çc]a|carpete)\b/i;

/**
 * O que DESARMA: a frase não está afirmando, está dizendo que não sabe ou
 * que confirma. É o comportamento que queremos — punir isso empurraria a
 * IA para o silêncio justamente onde a honestidade importa (mesma lição
 * que o detector de prazo aprendeu em 26/08).
 */
const DESARME =
  /\bn[ãa]o\b|\bdepende\b|\bvaria\b|\bconfirm(o|ar|amos)\b|\bchec(o|ar)\b|\bverific(o|ar)\b|\bpergunt(o|ar)\b|\bna\s+visita\b|\bno\s+decorado\b/i;

/** A frase AFIRMA um material de acabamento? */
export function afirmaAcabamento(texto: string): boolean {
  if (!MATERIAL.test(texto)) return false;
  return !DESARME.test(texto);
}

/**
 * Algum imóvel do catálogo menciona acabamento no texto cadastrado?
 *
 * Não há campo próprio para isso no schema — o único lugar onde essa
 * informação pode existir de verdade é a descrição escrita pela
 * construtora.
 */
export function catalogoTemAcabamento(catalogo: readonly Empreendimento[]): boolean {
  return catalogo.some((e) => MATERIAL.test(`${e.descricao ?? ""} ${e.tagline ?? ""}`));
}

/**
 * Tira as frases que afirmam material quando o catálogo não tem nenhum.
 *
 * Corta a FRASE inteira, não só a palavra — mesma decisão de `semValores` e
 * `prazoEntrega`: remover só "laminado" deixaria "o piso da sala é" e
 * pareceria defeito de software.
 */
export function removerAcabamentoInventado(
  texto: string,
  catalogo: readonly Empreendimento[],
): { texto: string; removeu: boolean } {
  if (catalogoTemAcabamento(catalogo)) return { texto, removeu: false };
  if (!afirmaAcabamento(texto)) return { texto, removeu: false };

  const frases = texto.split(/(?<=[.!?])\s+|\s*---\s*/);
  const limpas = frases.filter((f) => f.trim() && !afirmaAcabamento(f));

  if (limpas.length === 0) {
    return {
      texto: "O acabamento eu confirmo certinho com a construtora e te falo — no decorado dá para ver de perto.",
      removeu: true,
    };
  }

  return { texto: limpas.join(" --- "), removeu: true };
}

/**
 * O bloco que entra no prompt quando nenhum imóvel do catálogo tem
 * acabamento cadastrado.
 *
 * Irmão de `blocoSemPrazoCadastrado`, e pela mesma razão: avisar ANTES
 * evita a frase existir, cortar DEPOIS deixa a resposta mais pobre. E,
 * como lá, o bloco diz também o que ela PODE dizer — bloco que só proíbe
 * empurra a IA para o silêncio, e silêncio sobre acabamento também perde
 * cliente.
 */
export function blocoSemAcabamentoCadastrado(): string {
  return [
    "ACABAMENTO E MATERIAIS — VOCÊ NÃO TEM ESSA INFORMAÇÃO:",
    "NENHUM imóvel desta conversa tem acabamento cadastrado. Você não sabe o piso, o revestimento, a bancada, a louça nem o metal de nenhuma unidade, e não dá para deduzir pelo padrão do empreendimento.",
    'PROIBIDO afirmar material: nada de "piso laminado na sala", "bancada em granito", "porcelanato nos quartos", "azulejo na cozinha". Inventar isso é promessa que o cliente confere na visita, e quem paga é o corretor na frente dele.',
    "O que você PODE dizer, e deve: que esse detalhe você confirma com a construtora, que as fotos e a planta mostram o padrão, e que o decorado é justamente onde se vê acabamento de perto — é um bom motivo para a visita.",
  ].join("\n");
}
