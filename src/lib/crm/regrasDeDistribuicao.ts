/**
 * Regras de distribuição de leads do gestor (0246, 29/10/2026).
 *
 * Quem decide de verdade é o banco: o gatilho `distribuir_lead` chama
 * `escolher_corretor_pela_regra` ANTES da roleta de sempre, na mesma
 * transação do insert (com a trava da roleta). Este arquivo é o espelho
 * PURO da mesma conta — o que casa com o quê, em que ordem e quando a vez
 * passa à roleta — para a tela explicar a regra, validar o que o gestor
 * escreve e os testes cobrarem a ordem. As contas daqui e as do SQL têm os
 * mesmos nomes (`normalizarRotulo`/`normalizar_rotulo`,
 * `canalDoLead`/`canal_do_lead`, `regraCasaComOLead`/`regra_casa_com_o_lead`),
 * e `distribuicaoPorRegra.test.ts` confere os pontos que podem divergir.
 *
 * Nenhuma regra ativa que case (ou nenhuma com alguém disponível) = a roleta
 * de sempre, sem mudança nenhuma.
 */

export const CRITERIOS = ["regiao", "faixa_valor", "origem", "desempenho"] as const;
export type Criterio = (typeof CRITERIOS)[number];

export const CANAIS = ["portal", "anuncio", "site", "outro"] as const;
export type Canal = (typeof CANAIS)[number];

/**
 * Os rótulos de tela, num lugar só: a frente do vocabulário por ramo troca
 * estes textos sem procurar pela tela. "Imóvel" não aparece: a faixa é de
 * valor, e o lugar é região ou bairro.
 */
export const ROTULO_DO_CRITERIO: Record<Criterio, string> = {
  regiao: "Região ou bairro",
  faixa_valor: "Faixa de valor",
  origem: "Origem do lead",
  desempenho: "Desempenho",
};

export const ROTULO_DO_CANAL: Record<Canal, string> = {
  portal: "Portal",
  anuncio: "Anúncio",
  site: "Site",
  outro: "Outros canais",
};

export type RegraDeDistribuicao = {
  id: string;
  ordem: number;
  ativa: boolean;
  nome: string;
  criterio: Criterio;
  regioes: string[];
  valorMin: number | null;
  valorMax: number | null;
  origens: Canal[];
  maxLeadsParados: number | null;
  corretores: string[];
  /** Desempate da ordem (a mais antiga primeiro), como no banco. */
  criadaEm?: string;
};

/** O que a regra olha do lead. */
export type FatosDoLead = {
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  valor: number | null;
  canal: Canal;
};

const ACENTOS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c",
};

/**
 * `normalizar_rotulo` do SQL: minúsculas, sem os acentos do português, sem
 * espaço nas pontas; vazio vira `null`. A tabela de acentos é a MESMA do
 * `translate` da 0246 (não `normalize("NFD")`, que tiraria acento que o
 * banco mantém e as duas contas divergiriam).
 */
export function normalizarRotulo(texto: string | null | undefined): string | null {
  const t = (texto ?? "")
    .toLowerCase()
    .replace(/[áàâãäéèêëíìîïóòôõöúùûüç]/g, (c) => ACENTOS[c] ?? c)
    .trim();
  return t === "" ? null : t;
}

/** `canal_do_lead` do SQL: portal, anúncio, site ou outro, nessa precedência. */
export function canalDoLead(p: {
  origem: string | null;
  portalOrigem: string | null;
  anuncioOrigem: string | null;
  metaLeadId: string | null;
}): Canal {
  const origem = (p.origem ?? "").toLowerCase();
  const preenchido = (v: string | null) => (v ?? "").trim() !== "";
  if (preenchido(p.portalOrigem) || origem.startsWith("inbound/")) return "portal";
  if (preenchido(p.metaLeadId) || preenchido(p.anuncioOrigem) || origem.startsWith("meta/")) return "anuncio";
  if (origem.startsWith("site")) return "site";
  return "outro";
}

/** `regra_casa_com_o_lead` do SQL. `desempenho` casa com todo lead. */
export function regraCasaComOLead(regra: RegraDeDistribuicao, lead: FatosDoLead): boolean {
  switch (regra.criterio) {
    case "regiao": {
      const bairro = normalizarRotulo(lead.bairro);
      const cidade = normalizarRotulo(lead.cidade);
      const regiao = normalizarRotulo(lead.regiao) ?? "";
      return regra.regioes.some((r) => {
        const alvo = normalizarRotulo(r);
        return alvo !== null && (alvo === bairro || alvo === cidade || regiao.includes(alvo));
      });
    }
    case "faixa_valor":
      return (
        lead.valor !== null &&
        (regra.valorMin === null || lead.valor >= regra.valorMin) &&
        (regra.valorMax === null || lead.valor <= regra.valorMax)
      );
    case "origem":
      return regra.origens.includes(lead.canal);
    case "desempenho":
      return true;
  }
}

/** A ordem do banco: `ordem`, depois a mais antiga, depois o id. */
export function ordenarRegras(regras: readonly RegraDeDistribuicao[]): RegraDeDistribuicao[] {
  return [...regras].sort(
    (a, b) =>
      a.ordem - b.ordem ||
      (a.criadaEm ?? "").localeCompare(b.criadaEm ?? "") ||
      a.id.localeCompare(b.id),
  );
}

export type Decisao =
  | { pela: "regra"; regraId: string; corretorId: string }
  | { pela: "roleta" };

/**
 * A avaliação inteira, em ordem: a primeira regra ATIVA que casa com o lead
 * e tem alguém para receber decide. `escolherNaRegra` é a escolha dentro da
 * regra (no banco, a ordem da roleta entre os corretores da regra); `null`
 * quando ninguém da regra está disponível, e então a vez passa à seguinte.
 * Sem decisão, a roleta de sempre.
 */
export function decidirDistribuicao(
  regras: readonly RegraDeDistribuicao[],
  lead: FatosDoLead,
  escolherNaRegra: (regra: RegraDeDistribuicao) => string | null,
): Decisao {
  for (const regra of ordenarRegras(regras)) {
    if (!regra.ativa || !regraCasaComOLead(regra, lead)) continue;
    const corretorId = escolherNaRegra(regra);
    if (corretorId) return { pela: "regra", regraId: regra.id, corretorId };
  }
  return { pela: "roleta" };
}

/**
 * Quem a regra deixa concorrer, entre os disponíveis (já filtrados como na
 * roleta: ativo, do grupo, sem pausa...). `desempenho` é a equipe inteira
 * menos quem tem `maxLeadsParados` ou mais; as outras, só os da lista.
 */
export function candidatosDaRegra(
  regra: RegraDeDistribuicao,
  disponiveis: readonly { id: string; leadsParados: number }[],
): string[] {
  if (regra.criterio === "desempenho") {
    const teto = regra.maxLeadsParados ?? Infinity;
    return disponiveis.filter((c) => c.leadsParados < teto).map((c) => c.id);
  }
  const lista = new Set(regra.corretores);
  return disponiveis.filter((c) => lista.has(c.id)).map((c) => c.id);
}

/** O que o gestor manda da tela, antes de virar linha. */
export type RegraDigitada = {
  nome: string;
  criterio: string;
  regioes?: string;
  valorMin?: string | number | null;
  valorMax?: string | number | null;
  origens?: string[];
  maxLeadsParados?: string | number | null;
  corretores?: string[];
};

export type RegraValidada = Omit<RegraDeDistribuicao, "id" | "ordem" | "ativa" | "criadaEm">;

function numeroOuNulo(v: string | number | null | undefined): number | null | "invalido" {
  if (v === null || v === undefined) return null;
  const texto = String(v).trim();
  if (texto === "") return null;
  // "1.500.000" e "1500000,50" do jeito brasileiro.
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
}

/**
 * Confere a regra como o CHECK da 0246 confere, para o erro chegar em
 * português e antes do banco. Os ids de corretor são conferidos contra a
 * equipe pelo chamador (`equipe`): id de fora some da lista.
 */
export function validarRegra(
  digitada: RegraDigitada,
  equipe: ReadonlySet<string>,
): { regra: RegraValidada } | { erro: string } {
  const nome = digitada.nome.trim();
  if (!nome) return { erro: "Dê um nome à regra." };
  if (nome.length > 80) return { erro: "Nome longo demais (até 80 caracteres)." };
  if (!(CRITERIOS as readonly string[]).includes(digitada.criterio)) return { erro: "Escolha o critério da regra." };
  const criterio = digitada.criterio as Criterio;

  const corretores = [...new Set((digitada.corretores ?? []).filter((id) => equipe.has(id)))];
  const base: RegraValidada = {
    nome,
    criterio,
    regioes: [],
    valorMin: null,
    valorMax: null,
    origens: [],
    maxLeadsParados: null,
    corretores: criterio === "desempenho" ? [] : corretores,
  };
  if (criterio !== "desempenho" && corretores.length === 0) {
    return { erro: "Escolha quem recebe os leads desta regra." };
  }

  if (criterio === "regiao") {
    const regioes = [
      ...new Set(
        (digitada.regioes ?? "")
          .split(/[,;\n]/)
          .map((r) => r.trim())
          .filter(Boolean),
      ),
    ];
    if (regioes.length === 0) return { erro: "Escreva ao menos uma região ou bairro (separe por vírgula)." };
    if (regioes.length > 30) return { erro: "No máximo 30 regiões por regra." };
    return { regra: { ...base, regioes } };
  }

  if (criterio === "faixa_valor") {
    const min = numeroOuNulo(digitada.valorMin);
    const max = numeroOuNulo(digitada.valorMax);
    if (min === "invalido" || max === "invalido") return { erro: "Valor inválido: use só números." };
    if (min === null && max === null) return { erro: "Diga o valor mínimo, o máximo ou os dois." };
    if (min !== null && max !== null && min > max) return { erro: "O mínimo é maior que o máximo." };
    return { regra: { ...base, valorMin: min, valorMax: max } };
  }

  if (criterio === "origem") {
    const origens = [...new Set((digitada.origens ?? []).filter((o): o is Canal => (CANAIS as readonly string[]).includes(o)))];
    if (origens.length === 0) return { erro: "Escolha ao menos uma origem." };
    return { regra: { ...base, origens } };
  }

  // Contagem: só dígitos ("2.5" não vira 25 pelo jeito brasileiro de milhar).
  const textoDoTeto = String(digitada.maxLeadsParados ?? "").trim();
  const teto = /^\d{1,3}$/.test(textoDoTeto) ? Number(textoDoTeto) : null;
  if (teto === null || teto < 1 || teto > 500) {
    return { erro: "Diga a partir de quantos leads parados o corretor é pulado (1 a 500)." };
  }
  return { regra: { ...base, maxLeadsParados: teto } };
}

/** A regra numa frase, para a lista do gestor. */
export function descreverRegra(regra: RegraDeDistribuicao, nomes: ReadonlyMap<string, string>): string {
  const quem = regra.corretores.map((id) => nomes.get(id)).filter(Boolean).join(", ") || "ninguém da equipe";
  const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  switch (regra.criterio) {
    case "regiao":
      return `Lead de ${regra.regioes.join(", ")} vai para ${quem}.`;
    case "faixa_valor": {
      const faixa =
        regra.valorMin !== null && regra.valorMax !== null
          ? `entre ${reais(regra.valorMin)} e ${reais(regra.valorMax)}`
          : regra.valorMin !== null
            ? `a partir de ${reais(regra.valorMin)}`
            : `até ${reais(regra.valorMax ?? 0)}`;
      return `Lead com valor ${faixa} vai para ${quem}.`;
    }
    case "origem":
      return `Lead de ${regra.origens.map((o) => ROTULO_DO_CANAL[o].toLowerCase()).join(", ")} vai para ${quem}.`;
    case "desempenho":
      return `Quem tem ${regra.maxLeadsParados} ou mais leads parados não recebe; o resto segue a roleta.`;
  }
}
