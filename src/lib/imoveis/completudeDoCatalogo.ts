/**
 * O que cada imóvel TEM e o que falta, por categoria.
 *
 * ## Por que existe, ao lado de `pendenciasDoCatalogo`
 *
 * O cartão de pendências responde "o que dói na conversa" e só fala de
 * ausência. Isto responde outra pergunta, que é a do corretor completando o
 * cadastro: "o que já está aqui e o que ainda falta". Por isso ele lista
 * presença TAMBÉM, e cobre categorias que a assistente nem usa.
 *
 * As duas contas vivem aqui, e `pendenciasDoCatalogo` deriva desta. Duas
 * implementações de "tem planta?" divergem no primeiro ajuste, e esta base
 * registra esse defeito desde `montarResumo`.
 *
 * ## As duas faixas, e o que ficou de fora
 *
 * **Essencial** é o que a assistente usa ou o cliente vê na página. Só ele
 * conta na completude, porque é ele que muda o atendimento.
 *
 * **Complementar** enriquece a página e aparece sem cobrança. Ele existe na
 * lista para o corretor SABER que dá para preencher, não para ser cobrado.
 *
 * Ficaram de fora quatro campos, medido no código em 16/09/2026:
 *
 * - `seo_titulo` e `seo_descricao` não são lidos por arquivo NENHUM. O
 *   título da página é gerado de nome mais cidade em `lib/seo.ts`. Pedi-los
 *   ao corretor seria trabalho sem efeito.
 * - `iptu` e `condominio_valor` só existem no editor e no mapper. Não
 *   aparecem no site nem no prompt da assistente, e `semValores.ts` cortaria
 *   o número se ela tentasse dizer.
 *
 * Se algum deles ganhar leitor, ele entra aqui — e é este comentário que
 * explica por que hoje não está.
 *
 * ## Categorias que hoje vivem em 100%
 *
 * Foto, descrição e tagline estão completas nos 25 publicados, e a régua da
 * casa diz que degrau que vive em zero ensina a ignorar a lista. Elas entram
 * assim mesmo porque aquele zero é artefato de medir só o PUBLICADO:
 * rascunho novo nasce sem foto e sem descrição, e é o rascunho que este
 * checklist existe para completar.
 *
 * Módulo PURO, sem `server-only`: as telas são `"use client"` e precisam dos
 * rótulos. Mesma pedra de `limitesPdf.ts`, `pessoasTipos.ts` e
 * `imagensTipos.ts`.
 */

/** Onde a categoria pesa: só o essencial entra na conta de completude. */
export type Faixa = "essencial" | "complementar";

export type ChaveCategoria =
  | "foto"
  | "planta_imagem"
  | "tipologia"
  | "lazer"
  | "preco"
  | "descricao"
  | "endereco"
  | "apelido"
  | "construtora"
  | "entrega"
  | "unidades"
  | "torres"
  | "andares"
  | "book"
  | "video_ou_tour";

export interface Categoria {
  chave: ChaveCategoria;
  faixa: Faixa;
  /** O nome que o corretor usa, não o da coluna. */
  rotulo: string;
  /** Uma linha dizendo o que se perde sem isso. */
  explicacao: string;
}

export const CATEGORIAS: readonly Categoria[] = [
  {
    chave: "foto",
    faixa: "essencial",
    rotulo: "Fotos",
    explicacao: "sem foto o imóvel não aparece na vitrine nem tem o que anexar na conversa",
  },
  {
    chave: "planta_imagem",
    faixa: "essencial",
    rotulo: "Imagem da planta",
    explicacao: "o cliente pede a planta e a assistente não tem o que mandar",
  },
  {
    chave: "tipologia",
    faixa: "essencial",
    rotulo: "Plantas cadastradas",
    explicacao: "sem metragem e dormitórios na ficha, a assistente inventa",
  },
  {
    chave: "lazer",
    faixa: "essencial",
    rotulo: "Lazer",
    explicacao: "é o que separa este imóvel dos outros na hora de convencer",
  },
  {
    chave: "preco",
    faixa: "essencial",
    rotulo: "Preço a partir de",
    explicacao: "sem ele o imóvel some do filtro de faixa e do simulador",
  },
  {
    chave: "descricao",
    faixa: "essencial",
    rotulo: "Descrição",
    explicacao: "é o texto que a página mostra e de onde a assistente tira contexto",
  },
  {
    chave: "endereco",
    faixa: "essencial",
    rotulo: "Endereço",
    explicacao: "sem ele não há ponto de encontro para a visita",
  },
  {
    chave: "apelido",
    faixa: "essencial",
    rotulo: "Também conhecido como",
    explicacao: "o cliente pode chamar por outro nome e a assistente não reconhecer",
  },
  {
    chave: "construtora",
    faixa: "essencial",
    rotulo: "Construtora",
    explicacao: "é a primeira pergunta de quem compra na planta",
  },
  {
    chave: "entrega",
    faixa: "complementar",
    rotulo: "Entrega prevista",
    explicacao: "sem data cadastrada a assistente é proibida de falar prazo",
  },
  {
    chave: "unidades",
    faixa: "complementar",
    rotulo: "Total de unidades",
    explicacao: "ajuda a responder se o empreendimento é grande ou reservado",
  },
  {
    chave: "torres",
    faixa: "complementar",
    rotulo: "Total de torres",
    explicacao: "compõe a ficha técnica da página",
  },
  {
    chave: "andares",
    faixa: "complementar",
    rotulo: "Total de andares",
    explicacao: "compõe a ficha técnica da página",
  },
  {
    chave: "book",
    faixa: "complementar",
    rotulo: "Book em PDF",
    explicacao: "é o material que o cliente folheia sozinho depois da conversa",
  },
  {
    chave: "video_ou_tour",
    faixa: "complementar",
    rotulo: "Vídeo ou tour 360",
    explicacao: "segura o visitante na página por muito mais tempo",
  },
];

/**
 * O que o módulo precisa saber de um imóvel.
 *
 * Só o TAMANHO das listas importa, nunca o conteúdo — a assinatura larga é
 * a mesma escolha de `pendenciasDoCatalogo`: apertá-la a `{ id }` obrigaria
 * cada chamador a buscar uma coluna que ninguém lê.
 */
export interface ImovelAvaliavel {
  nome: string;
  descricao?: string | null;
  endereco?: string | null;
  construtora?: string | null;
  precoAPartir?: number | null;
  entregaPrevista?: string | null;
  totalUnidades?: number | null;
  totalTorres?: number | null;
  totalAndares?: number | null;
  bookUrl?: string | null;
  nomesAlternativos?: readonly string[];
  galeria?: readonly unknown[];
  plantas?: readonly unknown[];
  tipologias?: readonly unknown[];
  lazer?: readonly unknown[];
  videos?: readonly unknown[];
  tours360?: readonly unknown[];
}

export interface ItemDaCompletude {
  categoria: Categoria;
  presente: boolean;
}

export interface CompletudeDoImovel {
  itens: ItemDaCompletude[];
  essencialCompletos: number;
  essencialTotal: number;
}

/** Texto que conta: `null`, vazio e só espaço são a mesma ausência. */
function temTexto(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.trim().length > 0;
}

function temItem(lista: readonly unknown[] | null | undefined): boolean {
  return (lista?.length ?? 0) > 0;
}

/**
 * Está preenchido?
 *
 * Um predicado por categoria, e nenhum deles olha o CONTEÚDO: a pergunta é
 * "tem alguma coisa aqui", nunca "o que tem é bom". Julgar qualidade é o que
 * transformaria a lista numa opinião, e opinião envelhece.
 */
const PRESENTE: Record<ChaveCategoria, (i: ImovelAvaliavel) => boolean> = {
  foto: (i) => temItem(i.galeria),
  planta_imagem: (i) => temItem(i.plantas),
  tipologia: (i) => temItem(i.tipologias),
  lazer: (i) => temItem(i.lazer),
  preco: (i) => typeof i.precoAPartir === "number" && i.precoAPartir > 0,
  descricao: (i) => temTexto(i.descricao),
  endereco: (i) => temTexto(i.endereco),
  apelido: (i) => temItem(i.nomesAlternativos),
  construtora: (i) => temTexto(i.construtora),
  entrega: (i) => temTexto(i.entregaPrevista),
  unidades: (i) => typeof i.totalUnidades === "number" && i.totalUnidades > 0,
  torres: (i) => typeof i.totalTorres === "number" && i.totalTorres > 0,
  andares: (i) => typeof i.totalAndares === "number" && i.totalAndares > 0,
  book: (i) => temTexto(i.bookUrl),
  // Um OU outro: são dois jeitos de resolver a mesma falta, e cobrar os dois
  // faria a lista pedir trabalho dobrado pelo mesmo ganho.
  video_ou_tour: (i) => temItem(i.videos) || temItem(i.tours360),
};

export function avaliarCompletude(imovel: ImovelAvaliavel): CompletudeDoImovel {
  const itens = CATEGORIAS.map((categoria) => ({
    categoria,
    presente: PRESENTE[categoria.chave](imovel),
  }));

  const essenciais = itens.filter((x) => x.categoria.faixa === "essencial");

  return {
    itens,
    essencialCompletos: essenciais.filter((x) => x.presente).length,
    essencialTotal: essenciais.length,
  };
}

export interface CompletudeDaCategoria {
  categoria: Categoria;
  /** Quantos imóveis têm esta categoria preenchida. */
  completos: number;
  /** Sobre quantos imóveis a conta foi feita. */
  total: number;
}

/**
 * A visão do catálogo INTEIRO, uma linha por categoria.
 *
 * É ela que responde "onde o catálogo está fraco", que é outra pergunta da
 * lista por imóvel: cinco imóveis faltando coisas diferentes é trabalho
 * espalhado; vinte faltando a MESMA coisa é uma tarefa só.
 *
 * A ordem é a de `CATEGORIAS`, não a do estrago: aqui a pessoa procura uma
 * categoria específica, e lista que muda de lugar a cada carregamento é
 * lista que ninguém acha nada.
 */
export function completudePorCategoria(
  imoveis: readonly ImovelAvaliavel[],
): CompletudeDaCategoria[] {
  return CATEGORIAS.map((categoria) => ({
    categoria,
    completos: imoveis.filter((imovel) => PRESENTE[categoria.chave](imovel)).length,
    total: imoveis.length,
  }));
}

export interface ImovelAvaliado<T> {
  imovel: T;
  completude: CompletudeDoImovel;
  /** Só o que falta, na ordem de `CATEGORIAS`. É o que a tela vira chip. */
  faltando: Categoria[];
}

/**
 * Os imóveis ordenados por quanto falta, do mais incompleto para o menos.
 *
 * Ordena pelo ESSENCIAL, não pelo total: um imóvel a que só falta o total de
 * torres não é trabalho urgente, e misturá-lo com um rascunho sem foto faria
 * a lista mentir sobre a prioridade.
 *
 * Empate resolve por nome, como em `pendenciasDoCatalogo`: previsível é
 * melhor que esperta numa lista que a pessoa percorre marcando o que já fez.
 */
export function imoveisPorCompletude<T extends ImovelAvaliavel>(
  imoveis: readonly T[],
): ImovelAvaliado<T>[] {
  return imoveis
    .map((imovel) => {
      const completude = avaliarCompletude(imovel);
      return {
        imovel,
        completude,
        faltando: completude.itens.filter((x) => !x.presente).map((x) => x.categoria),
      };
    })
    .sort(
      (a, b) =>
        a.completude.essencialCompletos - b.completude.essencialCompletos ||
        a.imovel.nome.localeCompare(b.imovel.nome, "pt-BR"),
    );
}
