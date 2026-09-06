/**
 * Quais imóveis ainda não têm "também conhecido como" — e quais são urgentes.
 *
 * ## Por que isto existe
 *
 * `nomes_alternativos` (0044) é o que permite ao bot reconhecer o imóvel
 * pelo nome que o CLIENTE usa: "Dom Parque" para um cadastro chamado
 * "Lançamento ao Lado do Parque", "Manacá" para "More na Aldeia de
 * Barueri". Sem o apelido, a IA trata um imóvel NOSSO como se fosse de
 * outra imobiliária — e nenhuma distância de edição salva, porque não é
 * erro de grafia, é outro nome.
 *
 * Medido em 31/08/2026: **23 dos 25 publicados estão sem apelido**, e os 2
 * que têm vieram do backfill da própria 0044 — nenhum foi curado à mão. O
 * aviso dentro do editor, entregue em 26/08, não produziu uma linha:
 * nenhum empreendimento foi editado desde 25/08. Aviso dentro de tela que
 * ninguém abre é indistinguível de aviso que não existe; por isso a lista
 * vem para a tela de Imóveis, que é onde o corretor já passa.
 *
 * ## A urgência não é igual para todos
 *
 * Um cadastro chamado "Vitra Alphaville" sem apelido é uma perda pequena:
 * o cliente que diz "Vitra" é reconhecido assim mesmo. Já "Melhor valor de
 * metro da Região" ou "3 Dormitórios com Suite e 2 Vagas" são TÍTULOS DE
 * ANÚNCIO, não nomes — nenhum cliente vai digitar isso, e sem apelido esse
 * imóvel é invisível para o bot. São esses que a lista põe na frente.
 */

export type MotivoUrgencia =
  | "tipologia"
  | "oferta"
  | "substantivo_generico"
  | "referencia_de_lugar";

/** O que cada motivo explica ao corretor, em uma linha. */
export const EXPLICACAO_URGENCIA: Record<MotivoUrgencia, string> = {
  tipologia: "o nome descreve a planta, não identifica o empreendimento",
  oferta: "o nome é uma chamada de venda, não um nome",
  substantivo_generico: "começa com um substantivo comum, que não distingue nada",
  referencia_de_lugar: "o nome aponta um lugar vizinho, não o próprio imóvel",
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/*
 * As quatro assinaturas foram tiradas dos 23 cadastros REAIS, não
 * imaginadas — a mesma régua que calibrou o estiloDaCasa. Elas acertam os 9
 * títulos de anúncio da base e não pegam nenhum dos 14 nomes de verdade.
 *
 * O erro aqui é assimétrico e brando nos dois sentidos: um falso positivo
 * sobe para o topo de uma lista que o corretor vai percorrer inteira de
 * qualquer forma; um falso negativo deixa o imóvel mais abaixo na mesma
 * lista. Nada é escondido — a lista mostra os 23.
 */
const TIPOLOGIA = /\b\d+\s*(dorm|dorms|dormitorio|dormitorios|quarto|quartos|suite|suites|vaga|vagas)\b|\b\d+\s*m2\b/;
const OFERTA = /\bminha casa minha vida\b|\banalise de credito\b|\bmelhor\b|\bgratuit[ao]\b|\b[àa] venda\b|\ba venda\b/;
const SUBSTANTIVO_GENERICO = /^(apartamento|apartamentos|casa|casas|studio|cobertura|terreno|sala|loja|torre)\b/;
const REFERENCIA_DE_LUGAR = /\bao lado d|\bem frente a|\bperto d|\bproximo a/;

/**
 * O nome deste cadastro é um título de anúncio em vez de um nome?
 *
 * Devolve o motivo (para a tela poder explicar por que aquele imóvel está
 * no topo) ou `null` quando o nome identifica de verdade.
 */
export function motivoDeUrgencia(nome: string): MotivoUrgencia | null {
  const n = normalizar(nome);
  if (TIPOLOGIA.test(n)) return "tipologia";
  if (OFERTA.test(n)) return "oferta";
  if (SUBSTANTIVO_GENERICO.test(n)) return "substantivo_generico";
  if (REFERENCIA_DE_LUGAR.test(n)) return "referencia_de_lugar";
  return null;
}

export interface ImovelParaCuradoria {
  slug: string;
  nome: string;
  bairro?: string | null;
  cidade?: string | null;
  construtora?: string | null;
  nomesAlternativos?: string[];
}

export interface PendenciaDeApelido<T> {
  imovel: T;
  motivo: MotivoUrgencia | null;
}

/**
 * Os que faltam, urgentes primeiro.
 *
 * Dentro de cada grupo a ordem é alfabética — previsível é melhor que
 * esperta numa lista que a pessoa vai percorrer de cima a baixo, marcando
 * o que já fez.
 */
export function apelidosPendentes<T extends ImovelParaCuradoria>(
  imoveis: readonly T[],
): PendenciaDeApelido<T>[] {
  return imoveis
    .filter((i) => (i.nomesAlternativos?.length ?? 0) === 0)
    .map((imovel) => ({ imovel, motivo: motivoDeUrgencia(imovel.nome) }))
    .sort((a, b) => {
      if (Boolean(a.motivo) !== Boolean(b.motivo)) return a.motivo ? -1 : 1;
      return a.imovel.nome.localeCompare(b.imovel.nome, "pt-BR");
    });
}

/** Quantos, e quantos deles são urgentes. Para o contador da tela. */
export function contarPendencias(pendentes: readonly PendenciaDeApelido<unknown>[]): {
  total: number;
  urgentes: number;
} {
  return {
    total: pendentes.length,
    urgentes: pendentes.filter((p) => p.motivo !== null).length,
  };
}
