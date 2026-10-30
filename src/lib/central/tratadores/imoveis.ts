import "server-only";

import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { perfilDoLead } from "@/lib/crm/compatibilidade";
import { imoveisQueCombinam, leadsQueCombinam, temPressaDeMudar, type ImovelParaMatch } from "@/lib/crm/matchDeImoveis";
import { simularFinanciamento } from "@/lib/consultor/financiamento";
import { getParametrosCredito } from "@/lib/credito/parametros";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import {
  desfazerPrecoPeloCentral,
  desfazerUnidadePeloCentral,
  mudarPrecoPeloCentral,
  mudarUnidadePeloCentral,
  type AlvoDoPreco,
  type RegistroDaUnidade,
  type RegistroDoPreco,
} from "@/lib/imoveis/imovelPeloCentral";
import { chaveDaUnidade } from "@/lib/imoveis/tabelaDeDisponibilidade";
import { STATUS_UNIDADE_LABEL, type StatusUnidade } from "@/lib/imoveis/unidades";
import { linkPublicoDoImovel } from "@/lib/imovelPublico/ler";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { formatarMoedaBRL, normalizarPrecoBRL } from "@/lib/precos/moneyUtils";
import { revalidarSitePublico } from "@/lib/sites/revalidar";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPA_LABEL, STATUS_LABEL, type Empreendimento, type EtapaFunil, type StatusObra } from "@/lib/types";
import { imoveisCitados } from "@/lib/whatsapp/focoDaConversa";
import type { Acao, Consulta, ContextoDoCentral, Preparo, ResultadoDaAcao } from "../executar";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente F — imóveis da onda 2: informacao_de_imovel (10), imoveis_para_o_lead
 * (11), simular_financiamento (22), leads_para_o_imovel (23) e
 * atualizar_imovel (28, só gestor).
 *
 * Contrato em `../executar.ts`: consulta só lê e devolve um objeto curto
 * (rótulos prontos, "R$ 450.000", nunca chave de banco), e quem escreve a
 * resposta é o cérebro. A ação `preparar` resolve no banco e NUNCA grava; a
 * escrita do catálogo mora em `@/lib/imoveis/imovelPeloCentral` e só roda
 * depois do "sim".
 *
 * Nada aqui é conta ou régua nova, de propósito: o imóvel pelo texto usa o
 * reconhecimento de nomes da IA de atendimento (`imoveisCitados`, com os
 * apelidos da 0136), o casamento lead × imóvel é o da ficha e da tela do
 * imóvel (`matchDeImoveis`, sobre `compatibilidade`), e a simulação é a do
 * simulador do site e do consultor (`simularFinanciamento`, com as taxas do
 * grupo). Duas contas do mesmo financiamento divergiriam, e o corretor
 * ouviria do central um número que o site não confirma.
 *
 * Escopo pela identificação (`ctx`), nunca pelos argumentos, e o grupo
 * filtrado à mão em toda leitura (chave de serviço não tem RLS): o catálogo é
 * o do grupo; leads, os do corretor (gestor: o grupo).
 */

type Supa = ReturnType<typeof createServiceClient>;

const reais = (n: number) => formatarMoedaBRL(n).replace(/\s/g, " ");

/** Corretor só a carteira dele; gestor o grupo (`null`). */
const soDoCorretor = (ctx: ContextoDoCentral) => (ctx.papel === "gestor" ? null : ctx.corretorId);

function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

/** "450 mil", "R$ 450.000", 450000: o cérebro manda de qualquer jeito. */
function valorEmReais(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  return normalizarPrecoBRL(v);
}

/** `numeric` chega como string no supabase-js; vazio e zero viram `null`. */
function positivo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Tira as chaves vazias: "planta: null" ensina o modelo a falar do que não existe. */
function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

function rotuloDaEtapa(etapa: string): string {
  if (etapa === "novo") return "Novo";
  return ETAPA_LABEL[etapa as EtapaFunil] ?? etapa;
}

const dorms = (n: number) => `${n} ${n === 1 ? "dormitório" : "dormitórios"}`;

// ── O catálogo do grupo ──────────────────────────────────────────────────

export type PlantaDoCatalogo = {
  id: string;
  nome: string;
  dormitorios: number;
  suites: number;
  vagas: number;
  area: number | null;
  preco: number | null;
  /** O contador manual da planta (sem unidades cadastradas, é o que vale). */
  disponiveisNaMao: number | null;
  temImagem: boolean;
};

export type ImovelDoCatalogo = {
  id: string;
  nome: string;
  slug: string;
  nomesAlternativos: string[];
  cidade: string;
  bairro: string;
  endereco: string | null;
  construtora: string | null;
  precoAPartir: number | null;
  status: string;
  publicado: boolean;
  entregaPrevista: string | null;
  plantas: PlantaDoCatalogo[];
};

type LinhaDaPlanta = {
  id: string;
  nome: string;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  area_privativa: number | string | null;
  preco: number | string | null;
  unidades_disponiveis: number | null;
  planta_url: string | null;
  ordem: number | null;
};

type LinhaDoImovel = {
  id: string;
  nome: string;
  slug: string;
  nomes_alternativos: string[] | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  construtora: string | null;
  preco_a_partir: number | string | null;
  status: string;
  publicado: boolean | null;
  entrega_prevista: string | null;
  tipologias: LinhaDaPlanta[] | null;
};

function comoImovel(l: LinhaDoImovel): ImovelDoCatalogo {
  const plantas = [...(l.tipologias ?? [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      dormitorios: Number(t.dormitorios ?? 0),
      suites: Number(t.suites ?? 0),
      vagas: Number(t.vagas ?? 0),
      area: positivo(t.area_privativa),
      preco: positivo(t.preco),
      disponiveisNaMao: t.unidades_disponiveis ?? null,
      temImagem: Boolean(t.planta_url),
    }));
  return {
    id: l.id,
    nome: l.nome,
    slug: l.slug,
    nomesAlternativos: l.nomes_alternativos ?? [],
    cidade: l.cidade ?? "",
    bairro: l.bairro ?? "",
    endereco: l.endereco?.trim() || null,
    construtora: l.construtora,
    precoAPartir: positivo(l.preco_a_partir),
    status: l.status,
    publicado: l.publicado === true,
    entregaPrevista: l.entrega_prevista,
    plantas,
  };
}

/**
 * O catálogo inteiro do grupo, publicado ou não (o gestor atualiza o preço
 * de um imóvel que ainda vai ao ar). Quem sugere ao cliente filtra o
 * publicado.
 */
export async function lerCatalogoDoGrupo(supabase: Supa, grupoId: string): Promise<ImovelDoCatalogo[]> {
  const { data } = await supabase
    .from("empreendimentos")
    .select(
      "id, nome, slug, nomes_alternativos, cidade, bairro, endereco, construtora, preco_a_partir, status, publicado, entrega_prevista, tipologias(id, nome, dormitorios, suites, vagas, area_privativa, preco, unidades_disponiveis, planta_url, ordem)",
    )
    .eq("grupo_id", grupoId)
    .order("nome")
    .limit(500);
  return ((data ?? []) as unknown as LinhaDoImovel[]).map(comoImovel);
}

// ── Qual imóvel a pessoa quis dizer ──────────────────────────────────────

const DORMITORIOS_NO_TEXTO = /(\d{1,2})\s*(?:dorms?\b|dormit\w*|quartos?\b|qts?\b|q\b)/;

/** "2 dorms do Vitta" → 2. Sem número de dormitórios, `null`. */
export function dormitoriosDoPedido(pedido: string): number | null {
  const m = normalizar(pedido).match(DORMITORIOS_NO_TEXTO);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 10 ? n : null;
}

/** Palavras que não identificam imóvel nenhum na busca por pedaço do nome. */
const VAZIAS = new Set([
  "a", "as", "o", "os", "da", "das", "de", "do", "dos", "e", "em", "no", "na", "um", "uma",
  "imovel", "empreendimento", "apto", "apartamento", "predio", "residencial", "condominio", "lancamento",
  "planta", "unidade", "preco", "valor",
]);

export type ImovelAchado = { tipo: "um"; imovel: ImovelDoCatalogo } | { tipo: "varios"; opcoes: ImovelDoCatalogo[] } | { tipo: "nenhum" };

/**
 * O imóvel pelo texto do cérebro ("Vitta", "o 2 dorms do Vitta").
 *
 * 1. O reconhecimento da IA de atendimento (`imoveisCitados`): nome inteiro,
 *    apelidos do cadastro (0136: "vitta" é o Vitra) e a palavra marcante,
 *    com tolerância a erro de digitação. Um termo que aponta para DOIS
 *    imóveis não decide nada ali ("Royal" com o I e o II), e é o que se quer
 *    aqui também: na dúvida, pergunta.
 * 2. Sem citação, cada palavra do pedido como pedaço do nome ou de um
 *    apelido. Mais de um candidato vira pergunta numerada (spec 3.0).
 *
 * O nome da imobiliária sai do índice (`casa`): "o imóvel da Next Home" não
 * é o "Breeze Home Clube".
 */
export function acharImovel(pedido: string, catalogo: ImovelDoCatalogo[], casa: string | null): ImovelAchado {
  const semDorms = normalizar(pedido).replace(DORMITORIOS_NO_TEXTO, " ").trim();
  if (!semDorms || catalogo.length === 0) return { tipo: "nenhum" };

  // `imoveisCitados` lê o tipo do site; só nome, apelidos, slug, construtora
  // e bairro pesam no índice (e as contagens opcionais, no desempate de gêmeos).
  const comoDoSite = catalogo.map(
    (i) => ({ nome: i.nome, nomesAlternativos: i.nomesAlternativos, slug: i.slug, construtora: i.construtora, bairro: i.bairro }) as unknown as Empreendimento,
  );
  const porSlug = new Map(catalogo.map((i) => [i.slug, i]));
  const citados = imoveisCitados(semDorms, comoDoSite, casa ?? undefined)
    .map((s) => porSlug.get(s))
    .filter((i): i is ImovelDoCatalogo => Boolean(i));
  if (citados.length === 1) return { tipo: "um", imovel: citados[0] };
  if (citados.length > 1) return { tipo: "varios", opcoes: citados.slice(0, 5) };

  const palavras = semDorms.split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !VAZIAS.has(p));
  if (palavras.length === 0) return { tipo: "nenhum" };
  const candidatos = catalogo.filter((i) => {
    const alvo = normalizar([i.nome, ...i.nomesAlternativos].join(" "));
    return palavras.every((p) => alvo.includes(p));
  });
  if (candidatos.length === 1) return { tipo: "um", imovel: candidatos[0] };
  return candidatos.length > 1 ? { tipo: "varios", opcoes: candidatos.slice(0, 5) } : { tipo: "nenhum" };
}

const onde = (i: Pick<ImovelDoCatalogo, "bairro" | "cidade">) => [i.bairro, i.cidade].filter(Boolean).join(", ");

/** A resposta ao cérebro quando o imóvel não ficou claro: nada é feito, a pessoa escolhe e pede de novo. */
export function respostaDeImovelIncerto(r: Exclude<ImovelAchado, { tipo: "um" }>, pedido: string): unknown {
  if (r.tipo === "varios") {
    return {
      pergunta: `Achei mais de um imóvel para "${pedido}". Pergunte qual é.`,
      opcoes: r.opcoes.map((i) => `${i.nome}${onde(i) ? ` (${onde(i)})` : ""}`),
    };
  }
  return { erro: `Não achei "${pedido}" no catálogo da imobiliária. Peça o nome do imóvel como está no cadastro.` };
}

// ── As peças trocáveis (o teste passa as dele) ───────────────────────────

export type DependenciasDeImoveis = {
  /** A chave de serviço, uma por chamada. */
  banco: () => Supa;
  /** As taxas de crédito do grupo (as mesmas do simulador do site). */
  parametros: (grupoId: string) => Promise<ParametrosCredito>;
  /** O link público da página do imóvel; `null` se não der para montar. */
  link: (ctx: ContextoDoCentral, slug: string) => Promise<string | null>;
  /** Derruba o cache do site depois de uma escrita no catálogo. */
  revalidar: () => void;
  relogio: () => Date;
};

async function linkDoImovelPadrao(ctx: ContextoDoCentral, slug: string): Promise<string | null> {
  try {
    // O slug de quem pede vai no link da ficha do painel (grupo sem site): o
    // botão de WhatsApp da página cai nele, que é quem vai encaminhar.
    const { data } = await createServiceClient()
      .from("corretores")
      .select("slug")
      .eq("grupo_id", ctx.grupoId)
      .eq("id", ctx.corretorId)
      .maybeSingle();
    return await linkPublicoDoImovel({ grupoId: ctx.grupoId, slug, corretorSlug: (data?.slug as string | null) ?? null });
  } catch {
    return null;
  }
}

function revalidarPadrao(): void {
  // Os mesmos dois da tela do imóvel e da tabela de preços: a etiqueta do
  // catálogo e as páginas públicas de todo endereço. Falhar aqui não desfaz
  // a escrita: o site se acerta na validade do cache.
  try {
    revalidarCatalogo();
    revalidarSitePublico();
  } catch (erro) {
    console.warn("[central] cache do catálogo não derrubado:", erro);
  }
}

const PADRAO: DependenciasDeImoveis = {
  banco: () => createServiceClient(),
  parametros: (grupoId) => getParametrosCredito(grupoId),
  link: linkDoImovelPadrao,
  revalidar: revalidarPadrao,
  relogio: () => new Date(),
};

// ── informacao_de_imovel (capacidade 10) ─────────────────────────────────

function rotuloDaEntrega(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : null;
}

type LinhaDaUnidade = { id: string; identificacao: string; status: StatusUnidade; tipologia_id: string | null };

async function lerUnidades(supabase: Supa, grupoId: string, empreendimentoId: string): Promise<LinhaDaUnidade[]> {
  const { data } = await supabase
    .from("unidades")
    .select("id, identificacao, status, tipologia_id")
    .eq("grupo_id", grupoId)
    .eq("empreendimento_id", empreendimentoId)
    .limit(2000);
  return (data ?? []) as LinhaDaUnidade[];
}

/** Disponíveis da planta: as unidades cadastradas mandam; sem elas, o contador manual (o mesmo de `mappers.ts`). */
function disponiveisDaPlanta(p: PlantaDoCatalogo, unidades: LinhaDaUnidade[]): number | null {
  const daPlanta = unidades.filter((u) => u.tipologia_id === p.id);
  if (daPlanta.length === 0) return p.disponiveisNaMao;
  return daPlanta.filter((u) => u.status === "disponivel").length;
}

async function informacaoDeImovel(deps: DependenciasDeImoveis, ctx: ContextoDoCentral, a: Record<string, unknown>): Promise<unknown> {
  const pedido = texto(a.imovel, 160);
  if (!pedido) return { erro: "Qual imóvel? Peça o nome." };
  const supabase = deps.banco();
  const catalogo = await lerCatalogoDoGrupo(supabase, ctx.grupoId);
  const achado = acharImovel(pedido, catalogo, ctx.imobiliaria);
  if (achado.tipo !== "um") return respostaDeImovelIncerto(achado, pedido);
  const imovel = achado.imovel;

  const [unidades, fotos, link] = await Promise.all([
    lerUnidades(supabase, ctx.grupoId, imovel.id),
    supabase
      .from("midias")
      .select("tipo")
      .eq("grupo_id", ctx.grupoId)
      .eq("empreendimento_id", imovel.id)
      .limit(500)
      .then((r) => (r.data ?? []) as { tipo: string }[]),
    imovel.publicado ? deps.link(ctx, imovel.slug) : Promise.resolve(null),
  ]);

  // "O 2 dorms do Vitta": só as plantas pedidas, e o que existe quando a pedida não existe.
  const pedidos = dormitoriosDoPedido(pedido);
  const doPedido = pedidos ? imovel.plantas.filter((p) => p.dormitorios === pedidos) : imovel.plantas;
  const plantas = (doPedido.length > 0 ? doPedido : imovel.plantas).slice(0, 8).map((p) =>
    semVazios({
      planta: p.nome,
      dormitorios: p.dormitorios || null,
      suites: p.suites || null,
      vagas: p.vagas || null,
      metragem: p.area ? `${p.area.toLocaleString("pt-BR")} m²` : null,
      preco: p.preco ? reais(p.preco) : null,
      disponiveis: disponiveisDaPlanta(p, unidades),
      imagemDaPlanta: p.temImagem || null,
    }),
  );
  const contagem = (s: StatusUnidade) => unidades.filter((u) => u.status === s).length;
  const imagensDePlanta = fotos.filter((m) => m.tipo === "planta").length + imovel.plantas.filter((p) => p.temImagem).length;

  return semVazios({
    imovel: imovel.nome,
    onde: onde(imovel) || null,
    endereco: imovel.endereco,
    construtora: imovel.construtora,
    situacao: STATUS_LABEL[imovel.status as StatusObra] ?? imovel.status,
    entrega: rotuloDaEntrega(imovel.entregaPrevista),
    precoAPartir: imovel.precoAPartir ? reais(imovel.precoAPartir) : "sem preço cadastrado",
    semPlantaDe: pedidos && doPedido.length === 0 ? dorms(pedidos) : null,
    plantas,
    unidades: unidades.length
      ? { disponiveis: contagem("disponivel"), reservadas: contagem("reservada"), vendidas: contagem("vendida") }
      : null,
    fotos: fotos.filter((m) => m.tipo === "foto").length,
    temPlanta: imagensDePlanta > 0,
    link,
    naoPublicado: imovel.publicado ? null : "Este imóvel não está publicado no site: não há página para mandar ao cliente.",
    // A conversa do central só manda texto nesta rodada (spec 4.5 fica para depois).
    aviso: link ? "Fotos e planta como arquivo ainda não vão por aqui: mande o link da página, que tem as duas." : null,
  });
}

// ── imoveis_para_o_lead (capacidade 11) ──────────────────────────────────

/** O imóvel do catálogo no formato da régua de `matchDeImoveis`. */
function paraMatch(i: ImovelDoCatalogo): ImovelParaMatch {
  return { id: i.id, cidade: i.cidade, bairro: i.bairro, precoAPartir: i.precoAPartir, dormitorios: i.plantas.map((p) => p.dormitorios), status: i.status };
}

type LinhaDoPerfil = {
  id: string;
  nome: string;
  telefone: string | null;
  etapa: string;
  corretor_id: string | null;
  regiao_interesse: string | null;
  dormitorios_min: number | null;
  orcamento_max: number | string | null;
  orcamento_min: number | string | null;
  renda_mensal: number | string | null;
  empreendimento_id: string | null;
  imovel_interesse_id: string | null;
};

const COLUNAS_DO_PERFIL =
  "id, nome, telefone, etapa, corretor_id, regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id";

type Dossie = { lead_id: string; orcamento_max: number | string | null; orcamento_min: number | string | null; urgencia_mudanca: string | null };

/** As preferências da régua: ficha manda, dossiê da IA preenche o vazio, renda vira teto pela conta do simulador. */
function preferencias(l: LinhaDoPerfil, dossie: Dossie | undefined, credito: ParametrosCredito) {
  return {
    ...perfilDoLead(l, dossie, credito),
    orcamentoMin: positivo(l.orcamento_min) ?? positivo(dossie?.orcamento_min),
    temPressa: temPressaDeMudar(dossie?.urgencia_mudanca),
    pediu: [l.imovel_interesse_id, l.empreendimento_id].filter((x): x is string => Boolean(x)),
  };
}

export const TETO_DE_SUGESTOES = 3;

async function imoveisParaOLead(deps: DependenciasDeImoveis, ctx: ContextoDoCentral, a: Record<string, unknown>): Promise<unknown> {
  const pedido = texto(a.lead, 120);
  if (!pedido) return { erro: "Qual cliente? Peça o nome ou o telefone." };
  const supabase = deps.banco();
  const achado = await resolverLead(ctx, pedido, supabase);
  if (achado.tipo !== "um") return respostaDeLeadIncerto(achado, pedido);

  // De novo pelo escopo, e não só pelo id.
  let consulta = supabase
    .from("leads")
    .select(COLUNAS_DO_PERFIL)
    .eq("grupo_id", ctx.grupoId)
    .eq("id", achado.lead.id)
    .is("arquivado_em", null);
  const dono = soDoCorretor(ctx);
  if (dono) consulta = consulta.eq("corretor_id", dono);
  const [{ data: ficha }, { data: dossie }, catalogo, credito] = await Promise.all([
    consulta.maybeSingle(),
    supabase
      .from("lead_observacoes_ia")
      .select("lead_id, orcamento_max, orcamento_min, urgencia_mudanca")
      .eq("grupo_id", ctx.grupoId)
      .eq("lead_id", achado.lead.id)
      .maybeSingle(),
    lerCatalogoDoGrupo(supabase, ctx.grupoId),
    deps.parametros(ctx.grupoId),
  ]);
  if (!ficha) return respostaDeLeadIncerto({ tipo: "nenhum" }, pedido);
  const lead = ficha as unknown as LinhaDoPerfil;
  const pref = preferencias(lead, (dossie as Dossie | null) ?? undefined, credito);
  const nome = nomeParaExibir(lead);

  const procura = semVazios({
    regiao: pref.regiaoInteresse?.trim() || null,
    dormitorios: pref.dormitoriosMin ? `${pref.dormitoriosMin}+` : null,
    orcamento: pref.orcamentoMax ? `até ${reais(pref.orcamentoMax)}` : null,
    rendaFinancia: !pref.orcamentoMax && pref.tetoPelaRenda ? `até ${reais(pref.tetoPelaRenda)} pela renda (estimativa)` : null,
  });
  if (Object.keys(procura).length === 0 && pref.pediu.length === 0) {
    return {
      cliente: nome,
      semCriterio: "A ficha não diz o que ele procura (região, dormitórios, orçamento ou renda). Sem isso não dá para sugerir: pergunte ao cliente ou atualize a ficha.",
    };
  }

  // Só o publicado: é o que tem página para mandar.
  const publicados = catalogo.filter((i) => i.publicado);
  const porId = new Map(publicados.map((i) => [i.id, i]));
  const combinam = imoveisQueCombinam(pref, publicados.map(paraMatch), TETO_DE_SUGESTOES);
  const sugestoes = await Promise.all(
    combinam.map(async (m) => {
      const i = porId.get(m.id)!;
      return semVazios({
        imovel: i.nome,
        onde: onde(i) || null,
        precoAPartir: i.precoAPartir ? reais(i.precoAPartir) : null,
        porque: m.match.motivos.join(", "),
        link: await deps.link(ctx, i.slug),
      });
    }),
  );
  if (sugestoes.length === 0) {
    return { cliente: nome, procura, nenhum: "Nenhum imóvel publicado atende ao que ele pediu. Vale conversar sobre região ou orçamento." };
  }
  return { cliente: nome, procura, sugestoes };
}

// ── leads_para_o_imovel (capacidade 23) ──────────────────────────────────

export const TETO_DE_LEADS = 10;

async function leadsParaOImovel(deps: DependenciasDeImoveis, ctx: ContextoDoCentral, a: Record<string, unknown>): Promise<unknown> {
  const pedido = texto(a.imovel, 160);
  if (!pedido) return { erro: "Qual imóvel? Peça o nome." };
  const supabase = deps.banco();
  const catalogo = await lerCatalogoDoGrupo(supabase, ctx.grupoId);
  const achado = acharImovel(pedido, catalogo, ctx.imobiliaria);
  if (achado.tipo !== "um") return respostaDeImovelIncerto(achado, pedido);
  const imovel = achado.imovel;

  // Só quem ainda pede trabalho e aceita contato: a mesma porta da campanha
  // e da tela "Leads que combinam". Corretor: a carteira dele; gestor: o grupo.
  let consulta = supabase
    .from("leads")
    .select(COLUNAS_DO_PERFIL)
    .eq("grupo_id", ctx.grupoId)
    .is("arquivado_em", null)
    .is("nao_contatar_em", null)
    .neq("etapa", "fechado");
  const dono = soDoCorretor(ctx);
  if (dono) consulta = consulta.eq("corretor_id", dono);
  const [{ data: leads }, { data: dossies }, credito, equipe] = await Promise.all([
    consulta.limit(3000),
    supabase.from("lead_observacoes_ia").select("lead_id, orcamento_max, orcamento_min, urgencia_mudanca").eq("grupo_id", ctx.grupoId).limit(5000),
    deps.parametros(ctx.grupoId),
    // O gestor vê de quem é cada cliente; o corretor só tem os dele.
    dono
      ? Promise.resolve([] as { id: string; nome: string }[])
      : supabase
          .from("corretores")
          .select("id, nome")
          .eq("grupo_id", ctx.grupoId)
          .then((r) => (r.data ?? []) as { id: string; nome: string }[]),
  ]);
  const dossie = new Map(((dossies ?? []) as Dossie[]).map((d) => [d.lead_id, d]));
  const nomeDoCorretor = new Map(equipe.map((c) => [c.id, c.nome]));
  const abertos = ((leads ?? []) as unknown as LinhaDoPerfil[]).filter((l) => l.etapa !== "perdido" && (!dono || l.corretor_id === dono));
  const combinam = leadsQueCombinam(paraMatch(imovel), abertos, (l) => preferencias(l, dossie.get(l.id), credito));

  // Nome e etapa, e o porquê pela régua; telefone, renda e conversa ficam no painel.
  const lista = combinam.slice(0, TETO_DE_LEADS).map((l) =>
    semVazios({
      nome: nomeParaExibir(l),
      etapa: rotuloDaEtapa(l.etapa),
      porque: l.match.motivos.join(", "),
      corretor: dono ? null : l.corretor_id ? (nomeDoCorretor.get(l.corretor_id) ?? null) : "sem corretor",
    }),
  );
  return semVazios({
    imovel: imovel.nome,
    escopo: dono ? "seus clientes" : "clientes da equipe",
    total: combinam.length,
    leads: lista,
    maisQueNaoCouberam: combinam.length > TETO_DE_LEADS ? combinam.length - TETO_DE_LEADS : null,
    nenhum: combinam.length === 0 ? "Nenhum cliente com perfil declarado para este imóvel (região, dormitórios ou orçamento)." : null,
    // A lista de transmissão é a capacidade 14, da onda 3: aqui só se oferece.
    lista: combinam.length
      ? "Montar uma lista de envio com eles ainda não dá por aqui (chega numa próxima etapa); hoje é pelo painel, na tela do imóvel."
      : null,
  });
}

// ── simular_financiamento (capacidade 22) ────────────────────────────────

/** Prazo como o cérebro manda: "420" meses, ou "35" quando a pessoa falou em anos. */
export function prazoEmMeses(v: unknown): number | null {
  const n = Math.round(Number(typeof v === "string" ? v.replace(/[^\d]/g, "") : v));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Ninguém financia imóvel em 35 meses: até 50 é o número de anos que a
  // pessoa disse ("em 30 anos") e o cérebro passou sem converter.
  return n <= 50 ? n * 12 : n;
}

const porcento = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao ano`;

/**
 * "Quanto fica a parcela de 450 mil com renda de 8 mil?" — a conta do
 * simulador do site (`simularFinanciamento`), com as taxas do grupo. Pura:
 * não grava nada, nem na ficha.
 *
 * Sem renda não há faixa do MCMV a escolher: a conta sai pela taxa do SBPE
 * (a renda vai acima de qualquer teto de faixa) e diz que é isso, junto da
 * renda que a parcela exige.
 */
export async function simular(deps: Pick<DependenciasDeImoveis, "parametros">, ctx: ContextoDoCentral, a: Record<string, unknown>): Promise<unknown> {
  const valor = valorEmReais(a.valor);
  if (!valor || valor < 10_000) return { erro: "Qual o valor do imóvel? (ex.: 450 mil)" };
  const renda = valorEmReais(a.renda);
  const entrada = valorEmReais(a.entrada) ?? 0;
  if (entrada >= valor) return { erro: "A entrada cobre o valor inteiro: não há o que financiar." };
  const params = await deps.parametros(ctx.grupoId);
  const prazo = prazoEmMeses(a.prazo_meses);

  const s = simularFinanciamento(
    { rendaMensal: renda ?? Number.MAX_SAFE_INTEGER, entrada, valorImovel: valor, prazoMeses: prazo ?? undefined },
    params,
  );
  const prazoTexto = `${s.prazoMeses} meses${s.prazoMeses % 12 === 0 ? ` (${s.prazoMeses / 12} anos)` : ""}`;
  const base = {
    estimativa:
      "É uma estimativa do simulador da plataforma, não aprovação: o banco decide na análise de crédito, com seguro e taxas que a conta não inclui.",
    valor: reais(valor),
    entrada: entrada > 0 ? reais(entrada) : null,
    financiado: reais(Math.max(0, valor - s.recursosProprios)),
    taxa: `${porcento(s.taxaAnual)}${s.faixa ? ` (${s.faixa} do MCMV)` : " (SBPE)"}`,
    prazo: prazoTexto,
    subsidio: s.subsidio > 0 ? reais(s.subsidio) : null,
  };
  if (!renda) {
    return semVazios({
      ...base,
      parcela: reais(Math.round(s.parcelaEstimada)),
      rendaNecessaria: reais(s.rendaNecessaria),
      semRenda: "Sem a renda, contei pela taxa do SBPE. Com a renda, a conta confere se cabe e se entra numa faixa do MCMV, com taxa menor.",
    });
  }
  return semVazios({
    ...base,
    renda: reais(renda),
    fecha: s.fecha,
    parcela: s.fecha ? reais(Math.round(s.parcelaEstimada)) : null,
    parcelaMaximaPelaRenda: reais(Math.round(s.parcelaMaxima)),
    falta: s.fecha ? null : reais(s.faltam),
    rendaNecessaria: s.fecha ? null : reais(s.rendaNecessaria),
    imovelQueARendaSustenta: reais(s.precoMaximo),
    premissas: s.premissas,
    avisos: s.avisos,
  });
}

// ── atualizar_imovel (capacidade 28, só gestor) ──────────────────────────

const SO_GESTOR = "Atualizar o catálogo é só para o gestor da imobiliária.";

/** "vendida", false, "disponível", true: o cérebro manda de qualquer jeito. */
function statusPedido(v: unknown): StatusUnidade | null {
  if (v === true) return "disponivel";
  if (v === false) return "vendida";
  const t = typeof v === "string" ? normalizar(v.trim()) : "";
  if (["true", "sim", "disponivel", "livre"].includes(t)) return "disponivel";
  if (["false", "nao", "vendida", "vendido"].includes(t)) return "vendida";
  return null;
}

type PrecoProposto = { alvo: AlvoDoPreco; rotulo: string; antes: number | null; depois: number };
type UnidadeProposta = { unidadeId: string; identificacao: string; antes: StatusUnidade; depois: StatusUnidade };

const rotuloDoStatus = (s: StatusUnidade) => STATUS_UNIDADE_LABEL[s].toLowerCase();

function lerAlvo(v: unknown): AlvoDoPreco | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.empreendimentoId !== "string") return null;
  if (a.tipo === "imovel") return { tipo: "imovel", empreendimentoId: a.empreendimentoId };
  if (a.tipo === "planta" && typeof a.tipologiaId === "string") return { tipo: "planta", empreendimentoId: a.empreendimentoId, tipologiaId: a.tipologiaId };
  return null;
}

const numeroOuNulo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STATUS: readonly string[] = ["disponivel", "reservada", "vendida"];
const ehStatus = (v: unknown): v is StatusUnidade => typeof v === "string" && STATUS.includes(v);

/** Os `dados` da proposta, de volta do JSON: só o que tem a forma certa passa. */
function lerDados(d: Record<string, unknown>): { nome: string; preco: PrecoProposto | null; unidade: UnidadeProposta | null } {
  const nome = texto(d.nome, 160) ?? "o imóvel";
  const p = d.preco as Record<string, unknown> | undefined;
  const alvo = p ? lerAlvo(p.alvo) : null;
  const depois = p ? numeroOuNulo(p.depois) : null;
  const preco =
    p && alvo && depois !== null && depois > 0
      ? { alvo, rotulo: texto(p.rotulo, 160) ?? "preço", antes: numeroOuNulo(p.antes), depois }
      : null;
  const u = d.unidade as Record<string, unknown> | undefined;
  const unidade =
    u && typeof u.unidadeId === "string" && ehStatus(u.antes) && ehStatus(u.depois)
      ? { unidadeId: u.unidadeId, identificacao: texto(u.identificacao, 40) ?? "unidade", antes: u.antes, depois: u.depois }
      : null;
  return { nome, preco, unidade };
}

function descreverPreco(p: Pick<PrecoProposto, "rotulo" | "antes" | "depois">): string {
  return p.antes !== null ? `${p.rotulo} ${reais(p.antes)} → ${reais(p.depois)}` : `${p.rotulo} ${reais(p.depois)} (estava sem preço)`;
}

function descreverUnidade(u: Pick<UnidadeProposta, "identificacao" | "antes" | "depois">): string {
  return `unidade ${u.identificacao} ${rotuloDoStatus(u.antes)} → ${rotuloDoStatus(u.depois)}`;
}

function resposta(resultado: unknown): Preparo {
  return { tipo: "resposta", resultado };
}

/** O preço pedido: da planta quando o pedido diz os dormitórios ("o 2 dorms do Vitta"), senão o "a partir de". */
function prepararPreco(imovel: ImovelDoCatalogo, pedido: string, novo: number): PrecoProposto | { erro: unknown } {
  const n = dormitoriosDoPedido(pedido);
  if (n === null) {
    if (imovel.precoAPartir === novo) return { erro: { mensagem: `O ${imovel.nome} já está a partir de ${reais(novo)}; nada a mudar.` } };
    return { alvo: { tipo: "imovel", empreendimentoId: imovel.id }, rotulo: "preço a partir de", antes: imovel.precoAPartir, depois: novo };
  }
  const plantas = imovel.plantas.filter((p) => p.dormitorios === n);
  if (plantas.length === 0) {
    const tem = [...new Set(imovel.plantas.map((p) => p.dormitorios).filter((d) => d > 0))].sort((a, b) => a - b);
    return {
      erro: {
        erro: `O ${imovel.nome} não tem planta de ${dorms(n)} cadastrada${tem.length ? ` (tem de ${tem.join(", ")})` : ""}. Confira com o gestor qual é.`,
      },
    };
  }
  if (plantas.length > 1) {
    return {
      erro: {
        pergunta: `O ${imovel.nome} tem mais de uma planta de ${dorms(n)}. Pergunte qual é.`,
        opcoes: plantas.map((p) => `${p.nome}${p.area ? ` (${p.area.toLocaleString("pt-BR")} m²)` : ""}`),
      },
    };
  }
  const planta = plantas[0];
  if (planta.preco === novo) return { erro: { mensagem: `A planta ${planta.nome} do ${imovel.nome} já está em ${reais(novo)}; nada a mudar.` } };
  return {
    alvo: { tipo: "planta", empreendimentoId: imovel.id, tipologiaId: planta.id },
    rotulo: `preço da planta ${planta.nome}${planta.area ? ` (${planta.area.toLocaleString("pt-BR")} m²)` : ""}`,
    antes: planta.preco,
    depois: novo,
  };
}

function criarAtualizarImovel(deps: DependenciasDeImoveis): Acao {
  return {
    async preparar(ctx, a) {
      // O executor já barra `soGestor`; aqui de novo, porque a ação pode ser
      // chamada por outro caminho (e o executor não é a única porta).
      if (ctx.papel !== "gestor") return resposta({ erro: SO_GESTOR });
      const pedido = texto(a.imovel, 160);
      if (!pedido) return resposta({ erro: "Qual imóvel? Peça o nome." });
      const novoPreco = a.preco === undefined || a.preco === null || a.preco === "" ? null : valorEmReais(a.preco);
      const pediuUnidade = texto(a.unidade, 40);
      const pediuStatus = a.disponivel === undefined || a.disponivel === null ? null : statusPedido(a.disponivel);
      if (a.preco !== undefined && a.preco !== null && a.preco !== "" && novoPreco === null) {
        return resposta({ erro: "Não entendi o preço novo. Peça o valor (ex.: 480 mil)." });
      }
      if (novoPreco === null && !pediuUnidade && !pediuStatus) {
        return resposta({ erro: "O que muda no imóvel: o preço ou uma unidade vendida/disponível?" });
      }
      // Preço de imóvel abaixo de 10 mil é quase sempre "480" sem o "mil".
      if (novoPreco !== null && (novoPreco < 10_000 || novoPreco > 100_000_000)) {
        return resposta({ erro: `R$ ${novoPreco.toLocaleString("pt-BR")} não parece preço de imóvel. Confirme o valor inteiro (ex.: 480 mil).` });
      }

      const supabase = deps.banco();
      const achado = acharImovel(pedido, await lerCatalogoDoGrupo(supabase, ctx.grupoId), ctx.imobiliaria);
      if (achado.tipo !== "um") return resposta(respostaDeImovelIncerto(achado, pedido));
      const imovel = achado.imovel;

      const partes: string[] = [];
      const dados: Record<string, unknown> = { empreendimentoId: imovel.id, nome: imovel.nome };

      if (novoPreco !== null) {
        const p = prepararPreco(imovel, pedido, novoPreco);
        if ("erro" in p) return resposta(p.erro);
        dados.preco = p;
        const salto = p.antes ? Math.abs(p.depois - p.antes) / p.antes : 0;
        partes.push(`${descreverPreco(p)}${salto > 0.3 ? ` (atenção: muda ${Math.round(salto * 100)}%)` : ""}`);
      }

      if (pediuUnidade || pediuStatus) {
        if (!pediuUnidade) return resposta({ erro: `Qual unidade do ${imovel.nome}? (ex.: 32, A-101)` });
        if (!pediuStatus) return resposta({ erro: `A unidade ${pediuUnidade} foi vendida ou voltou a ficar disponível?` });
        const chave = chaveDaUnidade(pediuUnidade);
        const unidade = (await lerUnidades(supabase, ctx.grupoId, imovel.id)).find((u) => chaveDaUnidade(u.identificacao) === chave);
        if (!unidade) {
          return resposta({
            erro: `A unidade ${pediuUnidade} não está cadastrada no ${imovel.nome}. As unidades se cadastram no painel, na tela do imóvel.`,
          });
        }
        if (unidade.status === pediuStatus) {
          const jaEsta = `a unidade ${unidade.identificacao} já está ${rotuloDoStatus(pediuStatus)}`;
          if (partes.length === 0) return resposta({ mensagem: `No ${imovel.nome}, ${jaEsta}; nada a mudar.` });
          partes.push(`(${jaEsta})`);
        } else {
          const u: UnidadeProposta = { unidadeId: unidade.id, identificacao: unidade.identificacao, antes: unidade.status, depois: pediuStatus };
          dados.unidade = u;
          partes.push(descreverUnidade(u));
        }
      }

      return { tipo: "proposta", resumo: `${imovel.nome}: ${partes.join("; ")}`, dados };
    },

    async executar(ctx, d) {
      // A proposta não vale como permissão: o papel é conferido de novo no "sim".
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const { nome, preco, unidade } = lerDados(d);
      if (!preco && !unidade) return { ok: false, texto: `Não sei o que mudar no ${nome}.` };
      const supabase = deps.banco();
      const agora = deps.relogio();
      const feitos: string[] = [];
      const problemas: string[] = [];
      const desfazer: Record<string, unknown> = { nome };

      if (preco) {
        const r = await mudarPrecoPeloCentral(supabase, {
          grupoId: ctx.grupoId,
          gestorId: ctx.corretorId,
          alvo: preco.alvo,
          antes: preco.antes,
          depois: preco.depois,
          nomeDoImovel: nome,
          agora,
        });
        if (r.desfecho === "ok") {
          feitos.push(descreverPreco(preco));
          desfazer.preco = { ...r.registro, rotulo: preco.rotulo };
        } else if (r.desfecho === "mudou_antes") {
          problemas.push(
            `o ${preco.rotulo} mudou desde a proposta (agora ${r.atual !== null ? reais(r.atual) : "sem preço"}); não mexi. Peça de novo se ainda quiser mudar.`,
          );
        } else if (r.desfecho === "nao_achou") {
          problemas.push(`não achei mais o ${preco.rotulo} no catálogo`);
        } else {
          problemas.push(`não consegui gravar o ${preco.rotulo}`);
        }
      }

      if (unidade) {
        const r = await mudarUnidadePeloCentral(supabase, {
          grupoId: ctx.grupoId,
          unidadeId: unidade.unidadeId,
          antes: unidade.antes,
          depois: unidade.depois,
          agora,
        });
        if (r.desfecho === "ok") {
          feitos.push(descreverUnidade(unidade));
          desfazer.unidade = { ...r.registro, identificacao: unidade.identificacao };
        } else if (r.desfecho === "mudou_antes") {
          problemas.push(`a unidade ${unidade.identificacao} mudou desde a proposta (agora ${rotuloDoStatus(r.atual)}); não mexi`);
        } else if (r.desfecho === "nao_achou") {
          problemas.push(`não achei mais a unidade ${unidade.identificacao}`);
        } else {
          problemas.push(`não consegui gravar a unidade ${unidade.identificacao}`);
        }
      }

      if (feitos.length) deps.revalidar();
      const resultado: ResultadoDaAcao = {
        ok: feitos.length > 0,
        texto: [
          feitos.length ? `${nome} atualizado: ${feitos.join("; ")}.` : `Nada mudou no ${nome}.`,
          problemas.length ? `Atenção: ${problemas.join("; ")}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
      if (feitos.length) resultado.desfazer = desfazer;
      return resultado;
    },

    async desfazer(ctx, d) {
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const nome = texto(d.nome, 160) ?? "o imóvel";
      const supabase = deps.banco();
      const agora = deps.relogio();
      const voltou: string[] = [];
      const ficou: string[] = [];

      const p = d.preco as Record<string, unknown> | undefined;
      const alvo = p ? lerAlvo(p.alvo) : null;
      if (p && alvo && typeof p.depois === "number") {
        const registro: RegistroDoPreco = {
          alvo,
          antes: numeroOuNulo(p.antes),
          depois: p.depois,
          loteId: typeof p.loteId === "string" ? p.loteId : null,
        };
        const rotulo = texto(p.rotulo, 160) ?? "preço";
        const r = await desfazerPrecoPeloCentral(supabase, { grupoId: ctx.grupoId, registro, agora });
        if (r.desfecho === "ok") voltou.push(`${rotulo} ${registro.antes !== null ? reais(registro.antes) : "sem preço"}`);
        else if (r.desfecho === "mudou_depois") {
          ficou.push(`o ${rotulo} mudou de novo depois (está ${r.atual !== null ? reais(r.atual) : "sem preço"})`);
        } else ficou.push(`não consegui voltar o ${rotulo}`);
      }

      const u = d.unidade as Record<string, unknown> | undefined;
      const antes = u?.antes as Record<string, unknown> | undefined;
      if (u && typeof u.unidadeId === "string" && antes && ehStatus(antes.status) && ehStatus(u.depois)) {
        const registro: RegistroDaUnidade = {
          unidadeId: u.unidadeId,
          antes: { status: antes.status, reservadaAte: typeof antes.reservadaAte === "string" ? antes.reservadaAte : null },
          depois: u.depois,
          atualizadoEm: typeof u.atualizadoEm === "string" ? u.atualizadoEm : null,
        };
        const id = texto(u.identificacao, 40) ?? "";
        const r = await desfazerUnidadePeloCentral(supabase, { grupoId: ctx.grupoId, registro, agora });
        if (r.desfecho === "ok") voltou.push(`unidade ${id} ${rotuloDoStatus(registro.antes.status)}`);
        else if (r.desfecho === "mudou_depois") ficou.push(`a unidade ${id} mudou de novo depois (está ${rotuloDoStatus(r.atual)})`);
        else ficou.push(`não consegui voltar a unidade ${id}`);
      }

      if (voltou.length) deps.revalidar();
      const resto = ficou.length ? ` Não mexi: ${ficou.join("; ")}.` : "";
      return voltou.length
        ? { ok: true, texto: `Desfeito: ${nome} voltou ao que era (${voltou.join("; ")}).${resto}` }
        : { ok: false, texto: `Nada a desfazer no ${nome}.${resto}` };
    },
  };
}

// ── Os tratadores ────────────────────────────────────────────────────────

/** As consultas e a ação com as peças trocáveis: o teste passa banco falso, taxas e relógio. */
export function criarTratadoresDeImoveis(parciais: Partial<DependenciasDeImoveis> = {}): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const deps: DependenciasDeImoveis = { ...PADRAO, ...parciais };
  return {
    consultas: {
      informacao_de_imovel: (ctx, a) => informacaoDeImovel(deps, ctx, a),
      imoveis_para_o_lead: (ctx, a) => imoveisParaOLead(deps, ctx, a),
      leads_para_o_imovel: (ctx, a) => leadsParaOImovel(deps, ctx, a),
      simular_financiamento: (ctx, a) => simular(deps, ctx, a),
    },
    acoes: { atualizar_imovel: criarAtualizarImovel(deps) },
  };
}

const PRONTOS = criarTratadoresDeImoveis();
export const CONSULTAS_IMOVEIS: Record<string, Consulta> = PRONTOS.consultas;
export const ACOES_IMOVEIS: Record<string, Acao> = PRONTOS.acoes;
