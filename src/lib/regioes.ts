import type { Empreendimento } from "@/lib/types";

/**
 * As regiões em que a Next Home atua, e o que cada uma tem DE VERDADE.
 *
 * ## Por que isto existe
 *
 * A home listava cinco regiões como chips de texto, e duas delas — Santana de
 * Parnaíba e Itapevi — apontavam para a listagem INTEIRA porque não havia
 * cadastro nelas. Um chip que promete uma região e entrega o catálogo todo é
 * pior que um chip a menos: quem clica não descobre que ali não há nada, ele
 * só acha que o filtro está quebrado.
 *
 * Aqui a região é derivada do catálogo publicado. Região sem imóvel some da
 * tela sozinha, e nenhum link leva a lugar vazio por construção.
 *
 * ## Região não é bairro
 *
 * O `docs/MEMORIA.md` registra a medição que descarta página por bairro: são
 * ~25 imóveis em 18 bairros, a maioria com UM — dezoito páginas de um imóvel
 * cada é o caminho conhecido para o Google tratar o site como conteúdo fino.
 * O agrupamento que TEM inventário é este: Alphaville, Aldeia, e as cidades.
 * Por isso a lista abaixo é curta e escrita à mão, não gerada de `bairro`.
 *
 * ## Alphaville e Aldeia moram DENTRO de Barueri, e isso é de propósito
 *
 * Elas se sobrepõem à cidade, então um imóvel de Alphaville conta nas duas.
 * Não é erro de contagem: quem procura "Alphaville" e quem procura "Barueri"
 * são buscas diferentes, e as duas devem achar o imóvel. O cartão diz quantos
 * há em cada recorte, então nada é afirmado a mais.
 */

export type Regiao = {
  slug: string;
  nome: string;
  /** Uma linha sobre o lugar — o que faz alguém querer morar ali. */
  chamada: string;
  /** Decide se um imóvel do catálogo pertence a esta região. */
  pertence: (e: Empreendimento) => boolean;
  /** O filtro da listagem que corresponde a este recorte. */
  filtro: string;
};

const contem = (texto: string | null | undefined, agulha: string) =>
  (texto ?? "").toLowerCase().includes(agulha.toLowerCase());

export const REGIOES: Regiao[] = [
  {
    slug: "alphaville",
    nome: "Alphaville",
    chamada:
      "O endereço mais consolidado da região: comércio, escolas e serviços a pé, com acesso rápido à Castello Branco.",
    pertence: (e) => contem(e.bairro, "Alphaville"),
    filtro: "/empreendimentos?bairro=Alphaville",
  },
  {
    slug: "barueri",
    nome: "Barueri",
    chamada:
      "A cidade que concentra o maior número de lançamentos da região, do compacto ao alto padrão.",
    pertence: (e) => contem(e.cidade, "Barueri"),
    filtro: "/empreendimentos?cidade=Barueri",
  },
  {
    slug: "aldeia-da-serra",
    nome: "Aldeia",
    chamada:
      "Verde, ruas largas e condomínios com lazer completo — a escolha de quem quer sair do trânsito sem sair da região.",
    pertence: (e) => contem(e.bairro, "Aldeia"),
    filtro: "/empreendimentos?bairro=Aldeia",
  },
  {
    slug: "santana-de-parnaiba",
    nome: "Santana de Parnaíba",
    chamada: "Condomínios amplos e custo por metro mais convidativo, a minutos de Alphaville.",
    pertence: (e) => contem(e.cidade, "Santana de Parnaíba"),
    filtro: "/empreendimentos?cidade=Santana de Parnaíba",
  },
  {
    slug: "osasco",
    nome: "Osasco",
    chamada: "Trem, metrô e Rodoanel na porta — a região com a melhor mobilidade para quem trabalha na capital.",
    pertence: (e) => contem(e.cidade, "Osasco"),
    filtro: "/empreendimentos?cidade=Osasco",
  },
  {
    slug: "itapevi",
    nome: "Itapevi",
    chamada: "Onde o metro quadrado ainda cabe no primeiro imóvel, com linha de trem para a capital.",
    pertence: (e) => contem(e.cidade, "Itapevi"),
    filtro: "/empreendimentos?cidade=Itapevi",
  },
];

export type RegiaoComEstoque = Regiao & {
  imoveis: Empreendimento[];
  /** O menor `precoAPartir` da região, ou `null` se nenhum imóvel tem preço. */
  precoMinimo: number | null;
  /** A primeira foto de verdade encontrada na região — a capa do cartão. */
  capaUrl: string | null;
};

/**
 * As regiões que têm imóvel publicado, da maior para a menor.
 *
 * `galeria[0]` e não `capa`: `mapEmpreendimento` devolve o LOGOTIPO da casa
 * quando não há foto (ver a nota do vault sobre `capa` nunca ser nula), e um
 * cartão de região com o logotipo esticado é pior que um cartão sem foto.
 */
export function regioesComEstoque(catalogo: Empreendimento[]): RegiaoComEstoque[] {
  return REGIOES.map((regiao) => {
    const imoveis = catalogo.filter(regiao.pertence);
    const precos = imoveis
      .map((e) => e.precoAPartir)
      .filter((p): p is number => typeof p === "number" && p > 0);

    return {
      ...regiao,
      imoveis,
      precoMinimo: precos.length > 0 ? Math.min(...precos) : null,
      capaUrl: imoveis.find((e) => e.galeria?.[0]?.url)?.galeria?.[0]?.url ?? null,
    };
  })
    .filter((r) => r.imoveis.length > 0)
    .sort((a, b) => b.imoveis.length - a.imoveis.length);
}

export function regiaoPorSlug(slug: string): Regiao | undefined {
  return REGIOES.find((r) => r.slug === slug);
}
