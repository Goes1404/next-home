import "server-only";

import { perfilDoLead } from "@/lib/crm/compatibilidade";
import { desativarLinkNaoAberto, enviarAoClientePeloCentral, podeFalarComOCliente, type MidiaAoCliente } from "@/lib/crm/envioAoClientePeloCentral";
import { gravarLinkDoCliente } from "@/lib/crm/gravarLinkDoCliente";
import { caminhoDoLink, IMOVEIS_NA_SELECAO, mensagemParaCliente } from "@/lib/crm/linksDoCliente";
import { imoveisQueCombinam, temPressaDeMudar, type ImovelParaMatch } from "@/lib/crm/matchDeImoveis";
import { lerProposta, propostaVencida } from "@/lib/crm/proposta";
import { getParametrosCredito } from "@/lib/credito/parametros";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { caminhoDaFichaPublica } from "@/lib/imovelPublico/link";
import { linkDoPortfolio, linkPessoalDoImovel, mensagemDoLinkDoImovel } from "@/lib/imovelPublico/linkPessoal";
import { lerBaseDoLinkDoImovel } from "@/lib/imovelPublico/ler";
import { primeiroNomeUtil } from "@/lib/leads/nomeExibido";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { preencherTemplate } from "@/lib/mensagem";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { createServiceClient } from "@/lib/supabase/service";
import { trocarNome } from "@/lib/whatsapp/listaDeTransmissao";
import { MAXIMO_ANEXOS } from "@/lib/whatsapp/resolverMidia";
import type { Acao, Consulta, ContextoDoCentral, Preparo, ResultadoDaAcao } from "../executar";
import { acharImovel, lerCatalogoDoGrupo, respostaDeImovelIncerto, type ImovelDoCatalogo } from "./imoveis";
import { resolverLead, respostaDeLeadIncerto, type LeadResolvido } from "./resolverLead";

/**
 * Frente N — o que vai ao cliente, onda 3: mandar_material (17),
 * selecao_ou_proposta (31), meu_link_e_mensagens (33).
 *
 * Contrato em `../executar.ts`: `preparar` resolve no banco e NUNCA grava nem
 * envia; o "sim" roda `executar` só com os `dados`. Tudo que vai ao cliente é
 * ação com "sim" e sai por `crm/envioAoClientePeloCentral.ts`: do número do
 * PRÓPRIO corretor (spec 3.0), só para quem já conversa com ele (primeiro
 * contato fica no painel e nas listas, com o teto deles), com a cota do
 * número quando é iniciativa nossa, e nunca para quem pediu para sair. O
 * `preparar` confere as mesmas travas antes (a recusa vem antes do "sim"), e
 * o envio confere de novo.
 *
 * Nada de recado livre ao cliente (spec 6.1, fora do projeto): o texto que
 * sai é montado aqui por código, das peças que o painel já manda — a
 * mensagem do link do imóvel (tela Links), a da seleção e da proposta
 * (`mensagemParaCliente`), a mensagem pronta do corretor (Modelos de
 * mensagem) e as fotos e plantas do catálogo. O que o cérebro escreve só
 * escolhe entre elas; texto que não casa com nenhuma é recusado.
 *
 * O imóvel pelo texto é o de `imoveis.ts` (`acharImovel`, com os apelidos), o
 * casamento lead × imóvel da seleção é o da ficha (`matchDeImoveis`) e a
 * seleção é gravada por `gravarLinkDoCliente`, o mesmo dos botões da ficha.
 * Escopo pela identificação (`ctx`), nunca pelos argumentos; toda leitura
 * filtra o grupo (chave de serviço não tem RLS).
 */

type Supa = ReturnType<typeof createServiceClient>;

/** Onde abrem os links do grupo: o endereço do cliente e, sem site próprio, o slug da ficha pública. */
export type EnderecosDoGrupo = { enderecoDoCliente: string; fichaDoGrupo: string | null };

export type DependenciasDoCliente = {
  supabase: () => Supa;
  relogio: () => Date;
  parametros: (grupoId: string) => Promise<ParametrosCredito>;
  enderecos: (grupoId: string) => Promise<EnderecosDoGrupo>;
  podeFalar: typeof podeFalarComOCliente;
  enviar: typeof enviarAoClientePeloCentral;
  gravarLink: typeof gravarLinkDoCliente;
  desativarLink: typeof desativarLinkNaoAberto;
};

/** A mesma decisão da tela Links por imóvel: grupo sem site manda a ficha pública. */
async function enderecosPadrao(grupoId: string): Promise<EnderecosDoGrupo> {
  const enderecoDoCliente = await lerEnderecoDoCliente(grupoId);
  if (grupoId === GRUPO_NEXT_HOME_ID) return { enderecoDoCliente, fichaDoGrupo: null };
  const base = await lerBaseDoLinkDoImovel(grupoId);
  return { enderecoDoCliente, fichaDoGrupo: !base.hostPrincipal && base.grupoSlug ? base.grupoSlug : null };
}

const PADRAO: DependenciasDoCliente = {
  supabase: () => createServiceClient(),
  relogio: () => new Date(),
  parametros: (grupoId) => getParametrosCredito(grupoId),
  enderecos: enderecosPadrao,
  podeFalar: podeFalarComOCliente,
  enviar: enviarAoClientePeloCentral,
  gravarLink: gravarLinkDoCliente,
  desativarLink: desativarLinkNaoAberto,
};

const FALHOU: ResultadoDaAcao = { ok: false, texto: "Não consegui fazer isso agora. Peça de novo." };

/**
 * O que o central manda ao cliente, para a recusa de texto livre e a ajuda
 * ao cérebro. Recado ditado não está aqui de propósito (spec 6.1).
 */
const SO_ISTO_VAI =
  "Pelo central, ao cliente só vão: material do imóvel (apresentação, fotos, planta), seleção, proposta e as suas mensagens prontas do painel. Recado livre você manda do seu WhatsApp.";

function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

/** O texto que vai ao cliente, montado no `preparar`: as quebras de linha são do modelo, ficam. */
function mensagemDosDados(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null;
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });
const pergunta = (p: string): Preparo => resposta({ pergunta: p });
const recusa = (erro: string): Preparo => resposta({ erro });

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const reais = (n: number) => formatarMoedaBRL(n).replace(/\s/g, " ");
const primeiroNomeDoLink = (nome: string) => nome.trim().split(/\s+/)[0] || null;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];
}

/** `numeric` chega como string no supabase-js; vazio e zero viram `null`. */
function positivo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Qual material ──────────────────────────────────────────────────────────

export type PedidoDeMaterial = { apresentacao: boolean; fotos: boolean; planta: boolean };

/**
 * O material pela fala ("o book", "as fotos", "a planta"). "Book",
 * "apresentação" e "material" são o LINK da página do imóvel, como na IA de
 * atendimento (regra 17 de `aiAgent.ts`, `apresentacaoDigital.ts`): a página
 * tem fotos, plantas e o book. Vídeo e tour ficam de fora, como no anexo do
 * chat do painel (pesam demais para o WhatsApp). O que não é nenhum desses é
 * recado, e recado livre não sai pelo central.
 */
export function qualMaterial(fala: string | null): PedidoDeMaterial | { video: true } | { recado: true } {
  if (!fala) return { apresentacao: true, fotos: false, planta: false };
  const t = normalizar(fala);
  const pedido = {
    apresentacao: /\b(book|apresentac\w*|material|folder|link|pagina|site|informac\w*)\b/.test(t),
    fotos: /\b(fotos?|imagens?|imagem)\b/.test(t),
    planta: /\bplantas?\b/.test(t),
  };
  if (pedido.apresentacao || pedido.fotos || pedido.planta) return pedido;
  if (/\b(videos?|tour|360)\b/.test(t)) return { video: true };
  return { recado: true };
}

// ── O catálogo, o lead e o corretor ────────────────────────────────────────

/** Só o publicado: é o que tem página e mídia para ir ao cliente. */
async function publicados(supabase: Supa, grupoId: string): Promise<ImovelDoCatalogo[]> {
  return (await lerCatalogoDoGrupo(supabase, grupoId)).filter((i) => i.publicado);
}

type DoCorretor = { nome: string; whatsapp: string; slug: string | null };

async function lerCorretor(supabase: Supa, ctx: ContextoDoCentral): Promise<DoCorretor | null> {
  const { data } = await supabase.from("corretores").select("nome, whatsapp, slug").eq("grupo_id", ctx.grupoId).eq("id", ctx.corretorId).maybeSingle();
  if (!data) return null;
  const slug = typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : null;
  return { nome: String(data.nome ?? ctx.nome), whatsapp: String(data.whatsapp ?? ""), slug };
}

function linkDoImovel(e: EnderecosDoGrupo, slug: string, corretorSlug: string): string {
  return linkPessoalDoImovel({
    enderecoDoCliente: e.enderecoDoCliente,
    slug,
    corretorSlug,
    caminhoDaFicha: e.fichaDoGrupo ? caminhoDaFichaPublica(e.fichaDoGrupo, slug, corretorSlug) : null,
  });
}

const SEM_SLUG = "Seu perfil ainda não tem link pessoal (falta o endereço do perfil). Ajuste em Perfil, no painel.";

type Midia = { id: string; tipo: "foto" | "planta"; url: string; titulo: string };

async function lerMidias(supabase: Supa, grupoId: string, filtro: { empreendimentoId: string } | { ids: string[] }, nomeDoImovel: string): Promise<Midia[]> {
  let c = supabase.from("midias").select("id, tipo, url, alt, ordem").eq("grupo_id", grupoId).in("tipo", ["foto", "planta"]);
  c = "ids" in filtro ? c.in("id", filtro.ids) : c.eq("empreendimento_id", filtro.empreendimentoId);
  const { data } = await c.order("ordem").limit(60);
  return (data ?? [])
    .filter((m) => /^https:\/\//.test(String(m.url ?? "")))
    .map((m) => ({ id: m.id, tipo: m.tipo as "foto" | "planta", url: m.url, titulo: m.alt || nomeDoImovel }));
}

// ── A seleção: quais imóveis ───────────────────────────────────────────────

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };
const DORMS = /\b\d{1,2}\s*(?:dorms?\b|dormit\w*|quartos?\b|suites?\b|qts?\b)/g;
/** Palavras que contam ("3 imóveis") ou ligam, e não nomeiam imóvel nenhum. */
const SO_CONTAGEM = new Set([
  "imovel", "imoveis", "opcao", "opcoes", "selecao", "empreendimento", "empreendimentos", "apartamento", "apartamentos",
  "apto", "aptos", "mais", "outros", "outras", "que", "combinam", "combinem", "com", "ele", "ela", "dele", "dela",
  "o", "a", "os", "as", "do", "da", "dos", "das", "de", "e", "um", "uma", "pra", "para", "melhores",
]);

/** "3 imóveis" → 3; "seleção com Vitta e mais 2" → 2. O "2 dorms" não é contagem. */
export function quantosNaSelecao(pedido: string): number | null {
  const t = normalizar(pedido).replace(DORMS, " ");
  const m = t.match(/\b(\d{1,2})\b/) ?? t.match(/\b(uma|um|duas|dois|tres|quatro|cinco|seis)\b/);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
  return n >= 1 ? n : null;
}

/** Os pedaços do pedido que nomeiam imóvel ("Vitta, Breeze e Royal"). */
export function pedacosComNome(pedido: string): string[] {
  return pedido
    .split(/,|;|\+|\s+e\s+/i)
    .map((p) => p.trim())
    .filter((p) => {
      const palavras = normalizar(p)
        .replace(DORMS, " ")
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      return palavras.some((w) => !SO_CONTAGEM.has(w) && !/^\d+$/.test(w) && !(w in NUMEROS));
    });
}

const paraMatch = (i: ImovelDoCatalogo): ImovelParaMatch => ({
  id: i.id,
  cidade: i.cidade,
  bairro: i.bairro,
  precoAPartir: i.precoAPartir,
  dormitorios: i.plantas.map((p) => p.dormitorios),
  status: i.status,
});

/** A régua de `imoveis_para_o_lead` (Frente F): ficha manda, dossiê preenche, renda vira teto pelo simulador. */
async function preferenciasDoLead(supabase: Supa, ctx: ContextoDoCentral, leadId: string, credito: ParametrosCredito) {
  const [{ data: ficha }, { data: dossie }] = await Promise.all([
    supabase
      .from("leads")
      .select("regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id")
      .eq("grupo_id", ctx.grupoId)
      .eq("id", leadId)
      .maybeSingle(),
    supabase.from("lead_observacoes_ia").select("orcamento_max, orcamento_min, urgencia_mudanca").eq("grupo_id", ctx.grupoId).eq("lead_id", leadId).maybeSingle(),
  ]);
  if (!ficha) return null;
  const pref = {
    ...perfilDoLead(ficha, dossie, credito),
    orcamentoMin: positivo(ficha.orcamento_min) ?? positivo(dossie?.orcamento_min),
    temPressa: temPressaDeMudar(dossie?.urgencia_mudanca),
    pediu: [ficha.imovel_interesse_id, ficha.empreendimento_id].filter((x): x is string => Boolean(x)),
  };
  const temCriterio = Boolean(pref.regiaoInteresse?.trim() || pref.dormitoriosMin || pref.orcamentoMax || pref.tetoPelaRenda || pref.pediu.length);
  return { pref, temCriterio };
}

// ── As ações ───────────────────────────────────────────────────────────────

export function criarTratadoresDoCliente(dependencias: Partial<DependenciasDoCliente> = {}): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const deps: DependenciasDoCliente = { ...PADRAO, ...dependencias };

  /**
   * O cliente a quem vai, já conferido: dele (o gestor não fala pelo número
   * de outro corretor) e com canal agora. `Preparo` quando não dá.
   */
  async function clienteQueRecebe(ctx: ContextoDoCentral, pedido: string, supabase: Supa): Promise<LeadResolvido | Preparo> {
    const achado = await resolverLead(ctx, pedido, supabase);
    if (achado.tipo !== "um") return resposta(respostaDeLeadIncerto(achado, pedido));
    const lead = achado.lead;
    if (lead.corretorId !== ctx.corretorId) {
      return recusa(`${lead.nome} é cliente de outro corretor: o que vai ao cliente sai do número do corretor dele, e só ele manda.`);
    }
    const pode = await deps.podeFalar(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadId: lead.id }, deps.relogio());
    return pode.ok ? lead : recusa(pode.erro);
  }

  async function imovelPublicado(ctx: ContextoDoCentral, pedido: string, supabase: Supa): Promise<ImovelDoCatalogo | Preparo> {
    const achado = acharImovel(pedido, await publicados(supabase, ctx.grupoId), ctx.imobiliaria);
    return achado.tipo === "um" ? achado.imovel : resposta(respostaDeImovelIncerto(achado, pedido));
  }

  /** O envio do "sim", com a resposta em português de quem pediu. */
  async function mandar(ctx: ContextoDoCentral, dados: Record<string, unknown>, registro: string, montar: Parameters<typeof enviarAoClientePeloCentral>[1]["montar"]) {
    const leadId = typeof dados.leadId === "string" ? dados.leadId : null;
    if (!leadId) return null;
    return deps.enviar(deps.supabase(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadId, registro, montar }, deps.relogio());
  }

  const parcial = (enviados: number, total: number) =>
    enviados < total ? ` Saíram ${enviados} de ${total}: o resto falhou no envio; confira a conversa no painel.` : "";

  // ── mandar_material (17) ─────────────────────────────────────────────────

  async function prepararMaterial(ctx: ContextoDoCentral, a: Record<string, unknown>): Promise<Preparo> {
    const pedidoLead = texto(a.lead, 120);
    if (!pedidoLead) return pergunta("Para qual cliente vai o material?");
    const pedidoImovel = texto(a.imovel, 160);
    if (!pedidoImovel) return pergunta("De qual imóvel é o material?");
    const qual = qualMaterial(texto(a.material, 200));
    if ("video" in qual) {
      return recusa("Vídeo e tour pesam demais para mandar pelo WhatsApp. A apresentação do imóvel (o seu link da página) tem tudo: peça \"manda a apresentação\".");
    }
    if ("recado" in qual) return recusa(SO_ISTO_VAI);

    const supabase = deps.supabase();
    const lead = await clienteQueRecebe(ctx, pedidoLead, supabase);
    if ("tipo" in lead) return lead;
    const imovel = await imovelPublicado(ctx, pedidoImovel, supabase);
    if ("tipo" in imovel) return imovel;

    const partes: string[] = [];
    let mensagem: string | null = null;
    if (qual.apresentacao) {
      const corretor = await lerCorretor(supabase, ctx);
      if (!corretor?.slug) return recusa(SEM_SLUG);
      const link = linkDoImovel(await deps.enderecos(ctx.grupoId), imovel.slug, corretor.slug);
      mensagem = mensagemDoLinkDoImovel({ nome: imovel.nome, bairro: imovel.bairro, cidade: imovel.cidade, link });
      partes.push(`a apresentação do ${imovel.nome} (o seu link da página do imóvel)`);
    }

    let escolhidas: Midia[] = [];
    if (qual.fotos || qual.planta) {
      const midias = await lerMidias(supabase, ctx.grupoId, { empreendimentoId: imovel.id }, imovel.nome);
      // O teto de anexos da IA de atendimento: mais que isso vira álbum.
      const plantas = qual.planta ? midias.filter((m) => m.tipo === "planta").slice(0, MAXIMO_ANEXOS) : [];
      const fotos = qual.fotos ? midias.filter((m) => m.tipo === "foto").slice(0, MAXIMO_ANEXOS - plantas.length) : [];
      if (qual.planta && plantas.length === 0 && !qual.fotos && !mensagem) return recusa(`O ${imovel.nome} não tem planta no cadastro.`);
      if (qual.fotos && fotos.length === 0 && !qual.planta && !mensagem) return recusa(`O ${imovel.nome} não tem foto no cadastro.`);
      escolhidas = [...fotos, ...plantas];
      if (fotos.length) partes.push(`${plural(fotos.length, "foto", "fotos")} do ${imovel.nome}`);
      if (plantas.length) partes.push(`${plantas.length === 1 ? "a planta" : `${plantas.length} plantas`} do ${imovel.nome}`);
    }
    if (!mensagem && escolhidas.length === 0) return recusa(`O ${imovel.nome} não tem esse material no cadastro.`);

    const descricao = partes.join(" e ");
    return {
      tipo: "proposta",
      resumo: `Mandar a ${lead.nome}, pelo seu WhatsApp, ${descricao}${mensagem ? `, com a mensagem: "${mensagem}"` : ""}`,
      dados: { o_que: "material", leadId: lead.id, nome: lead.nome, imovel: imovel.nome, descricao, texto: mensagem, midias: escolhidas.map((m) => m.id) },
    };
  }

  const mandarMaterial: Acao = {
    preparar: prepararMaterial,

    async executar(ctx, dados) {
      const nome = String(dados.nome ?? "o cliente");
      const descricao = String(dados.descricao ?? "o material");
      const mensagem = mensagemDosDados(dados.texto);
      const midiaIds = ids(dados.midias);
      const r = await mandar(ctx, dados, `Material do imóvel (${descricao}) enviado ao cliente`, async () => {
        // A mídia de novo pelo id, no grupo: foto tirada do catálogo entre o
        // resumo e o "sim" não vai.
        const lidas = midiaIds.length ? await lerMidias(deps.supabase(), ctx.grupoId, { ids: midiaIds }, String(dados.imovel ?? "Imóvel")) : [];
        const porId = new Map(lidas.map((m) => [m.id, m]));
        const midias: MidiaAoCliente[] = midiaIds.flatMap((id) => {
          const m = porId.get(id);
          return m ? [{ tipo: m.tipo, url: m.url, titulo: m.titulo }] : [];
        });
        if (!mensagem && midias.length === 0) return { erro: "Esse material saiu do catálogo do imóvel. Peça de novo." };
        return { texto: mensagem ?? undefined, midias };
      });
      if (!r) return FALHOU;
      // Mensagem que saiu não volta: sem `desfazer` (spec 4.6).
      return r.ok ? { ok: true, texto: `Mandei a ${nome}, pelo seu WhatsApp, ${descricao}.${parcial(r.enviados, r.total)}` } : { ok: false, texto: r.erro };
    },
  };

  // ── selecao_ou_proposta (31) ─────────────────────────────────────────────

  async function prepararSelecao(ctx: ContextoDoCentral, lead: LeadResolvido, pedido: string | null, supabase: Supa): Promise<Preparo> {
    const catalogo = await publicados(supabase, ctx.grupoId);
    if (catalogo.length === 0) return recusa("Não há imóvel publicado no catálogo para montar a seleção.");

    const nomeados: ImovelDoCatalogo[] = [];
    for (const pedaco of pedido ? pedacosComNome(pedido) : []) {
      const achado = acharImovel(pedaco, catalogo, ctx.imobiliaria);
      if (achado.tipo !== "um") return resposta(respostaDeImovelIncerto(achado, pedaco));
      if (!nomeados.some((i) => i.id === achado.imovel.id)) nomeados.push(achado.imovel);
    }
    if (nomeados.length > IMOVEIS_NA_SELECAO) return recusa(`Cabem até ${IMOVEIS_NA_SELECAO} imóveis numa seleção.`);

    // Pediu "3" sem nomes, ou "o Vitta e mais 2": o resto vem dos que mais
    // combinam com a ficha, os mesmos de "quais imóveis pro João?".
    // "3 imóveis: Vitta, Breeze e Royal" é o total; "o Vitta e mais 2", o que falta.
    const quantos = pedido ? quantosNaSelecao(pedido) : null;
    const mais = pedido ? /\bmais\b/.test(normalizar(pedido)) : false;
    const alvo = Math.min(
      IMOVEIS_NA_SELECAO,
      nomeados.length === 0 ? (quantos ?? 3) : mais ? nomeados.length + (quantos ?? 0) : Math.max(nomeados.length, quantos ?? 0),
    );
    const escolhidos = [...nomeados];
    if (escolhidos.length < alvo) {
      const perfil = await preferenciasDoLead(supabase, ctx, lead.id, await deps.parametros(ctx.grupoId));
      if (!perfil?.temCriterio && escolhidos.length === 0) {
        return pergunta(`Quais imóveis vão na seleção de ${lead.nome}? A ficha não diz o que ele procura (região, dormitórios, orçamento ou renda).`);
      }
      if (perfil) {
        const ja = new Set(escolhidos.map((i) => i.id));
        const porId = new Map(catalogo.map((i) => [i.id, i]));
        const combinam = imoveisQueCombinam(perfil.pref, catalogo.filter((i) => !ja.has(i.id)).map(paraMatch), alvo - escolhidos.length);
        escolhidos.push(...combinam.map((m) => porId.get(m.id)!));
      }
    }
    if (escolhidos.length === 0) {
      return recusa(`Nenhum imóvel publicado combina com o que ${lead.nome} procura. Diga quais imóveis vão na seleção.`);
    }

    const nomes = escolhidos.map((i) => i.nome);
    const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : nomes[0];
    // Pediu 3 e só 2 combinam: o resumo diz, em vez de completar com o que não combina.
    const faltou = escolhidos.length < alvo ? ` (só ${escolhidos.length} combinam com a ficha)` : "";
    const mensagem = mensagemParaCliente({ tipo: "selecao", primeiroNome: primeiroNomeDoLink(lead.nome), url: "(link da seleção)" });
    return {
      tipo: "proposta",
      resumo: `Criar a seleção de ${lead.nome} com ${lista}${faltou}, e mandar a ele, pelo seu WhatsApp, o link com a mensagem: "${mensagem}"`,
      dados: { o_que: "selecao", leadId: lead.id, nome: lead.nome, empreendimentos: escolhidos.map((i) => i.id), imoveis: nomes },
    };
  }

  type PropostaAberta = { token: string; imovel: string; empreendimentoId: string | null; unidade: string | null; valor: number; validaAte: string };

  async function propostasAbertas(supabase: Supa, ctx: ContextoDoCentral, leadId: string, agora: Date): Promise<PropostaAberta[]> {
    const { data } = await supabase
      .from("links_do_cliente")
      .select("token, dados, expira_em, created_at")
      .eq("grupo_id", ctx.grupoId)
      .eq("lead_id", leadId)
      .eq("corretor_id", ctx.corretorId)
      .eq("tipo", "proposta")
      .gt("expira_em", agora.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    return (data ?? []).flatMap((l) => {
      const p = lerProposta((l.dados ?? {}) as Record<string, unknown>);
      return p && !propostaVencida(p, agora) ? [{ token: l.token, ...p }] : [];
    });
  }

  const rotuloDaProposta = (p: PropostaAberta) =>
    `${p.imovel}${p.unidade ? `, unidade ${p.unidade}` : ""} (${reais(p.valor)}, válida até ${new Date(p.validaAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })})`;

  /**
   * A proposta leva valor e condição escritos pelo CORRETOR, nunca pela IA
   * (`crm/proposta.ts`), e a ferramenta não tem esses campos: o central manda
   * a proposta que ele montou na ficha, ainda aberta. Sem proposta aberta, o
   * caminho é o painel.
   */
  async function prepararProposta(ctx: ContextoDoCentral, lead: LeadResolvido, pedido: string | null, supabase: Supa): Promise<Preparo> {
    const abertas = await propostasAbertas(supabase, ctx, lead.id, deps.relogio());
    let candidatas = abertas;
    let doImovel = "";
    if (pedido) {
      const achado = acharImovel(pedido, await lerCatalogoDoGrupo(supabase, ctx.grupoId), ctx.imobiliaria);
      const alvo = achado.tipo === "um" ? achado.imovel : null;
      const trecho = normalizar(alvo?.nome ?? pedido);
      candidatas = abertas.filter((p) => (alvo && p.empreendimentoId === alvo.id) || normalizar(p.imovel).includes(trecho));
      doImovel = ` do ${alvo?.nome ?? pedido}`;
    }
    if (candidatas.length === 0) {
      return recusa(
        `${lead.nome} não tem proposta${doImovel} aberta. A proposta leva valor e condição escritos por você: monte na ficha dele (Links do cliente → Proposta) e depois me peça para mandar.`,
      );
    }
    if (candidatas.length > 1) return resposta({ pergunta: `${lead.nome} tem mais de uma proposta aberta. Qual vai?`, opcoes: candidatas.map(rotuloDaProposta) });
    const p = candidatas[0];
    const mensagem = mensagemParaCliente({ tipo: "proposta", primeiroNome: primeiroNomeDoLink(lead.nome), url: "(link da proposta)" });
    return {
      tipo: "proposta",
      resumo: `Mandar a ${lead.nome}, pelo seu WhatsApp, a proposta que você montou na ficha: ${rotuloDaProposta(p)}, com a mensagem: "${mensagem}"`,
      dados: { o_que: "proposta", leadId: lead.id, nome: lead.nome, token: p.token, imovel: p.imovel },
    };
  }

  const selecaoOuProposta: Acao = {
    async preparar(ctx, a) {
      const tipo = a.tipo;
      if (tipo !== "selecao" && tipo !== "proposta") return pergunta("Montar uma seleção de imóveis ou mandar uma proposta?");
      const pedidoLead = texto(a.lead, 120);
      if (!pedidoLead) return pergunta(tipo === "selecao" ? "A seleção é para qual cliente?" : "A proposta é para qual cliente?");
      const supabase = deps.supabase();
      const lead = await clienteQueRecebe(ctx, pedidoLead, supabase);
      if ("tipo" in lead) return lead;
      const pedido = texto(a.imoveis, 200);
      return tipo === "selecao" ? prepararSelecao(ctx, lead, pedido, supabase) : prepararProposta(ctx, lead, pedido, supabase);
    },

    async executar(ctx, dados) {
      const nome = String(dados.nome ?? "o cliente");
      const leadId = typeof dados.leadId === "string" ? dados.leadId : null;
      if (!leadId) return FALHOU;
      const supabase = deps.supabase();

      if (dados.o_que === "selecao") {
        const escolhidos = ids(dados.empreendimentos);
        if (escolhidos.length === 0 || escolhidos.length > IMOVEIS_NA_SELECAO) return FALHOU;
        // Como `criarSelecao` do painel: só imóvel ainda PUBLICADO vira página.
        const vivos = new Set((await publicados(supabase, ctx.grupoId)).map((i) => i.id));
        if (!escolhidos.every((id) => vivos.has(id))) return { ok: false, texto: "Algum imóvel saiu do catálogo. Peça a seleção de novo." };

        let criada: { token: string; url: string } | null = null;
        const r = await mandar(ctx, dados, "Seleção de imóveis enviada ao cliente", async (lead) => {
          const link = await deps.gravarLink(supabase, {
            tipo: "selecao",
            leadId,
            corretorId: ctx.corretorId,
            grupoId: ctx.grupoId,
            nome: lead.nome,
            // Só os imóveis: a renda do cliente não viaja num link compartilhável.
            dados: { empreendimentos: escolhidos },
            comCodigoCurto: true,
          });
          if ("erro" in link) return { erro: link.erro };
          criada = { token: link.token, url: link.url };
          return { texto: link.mensagem };
        });
        if (!r) return FALHOU;
        const feita = criada as { token: string; url: string } | null;
        if (!r.ok) {
          // A página que não chegou ao cliente não fica aberta à toa.
          if (feita) await deps.desativarLink(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, token: feita.token }, deps.relogio());
          return { ok: false, texto: r.erro };
        }
        const imoveis = ids(dados.imoveis);
        return {
          ok: true,
          texto: `Criei a seleção${imoveis.length ? ` (${imoveis.join(", ")})` : ""} e mandei a ${nome}, pelo seu WhatsApp: ${feita?.url ?? ""}`.trim(),
          ...(feita ? { desfazer: { o_que: "selecao", token: feita.token, nome } } : {}),
        };
      }

      if (dados.o_que === "proposta") {
        const token = typeof dados.token === "string" ? dados.token : null;
        if (!token) return FALHOU;
        const r = await mandar(ctx, dados, "Proposta enviada ao cliente", async (lead) => {
          const agora = deps.relogio();
          const aberta = (await propostasAbertas(supabase, ctx, lead.id, agora)).find((p) => p.token === token);
          if (!aberta) return { erro: "Essa proposta venceu ou saiu da ficha. Monte de novo no painel." };
          const url = `${(await deps.enderecos(ctx.grupoId)).enderecoDoCliente}${caminhoDoLink("proposta", token)}`;
          return { texto: mensagemParaCliente({ tipo: "proposta", primeiroNome: primeiroNomeDoLink(lead.nome), url }) };
        });
        if (!r) return FALHOU;
        // A página já existia (foi o corretor quem a montou): nada a desfazer, e
        // a mensagem que saiu não volta.
        return r.ok ? { ok: true, texto: `Mandei a ${nome}, pelo seu WhatsApp, a proposta do ${String(dados.imovel ?? "imóvel")}.` } : { ok: false, texto: r.erro };
      }
      return FALHOU;
    },

    async desfazer(ctx, d) {
      if (d.o_que !== "selecao" || typeof d.token !== "string") return { ok: false, texto: "Não consigo desfazer isso: a mensagem que saiu não volta." };
      const nome = String(d.nome ?? "o cliente");
      const r = await deps.desativarLink(deps.supabase(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, token: d.token }, deps.relogio());
      if (!r.ok) return { ok: false, texto: `${r.erro} A mensagem que saiu continua no WhatsApp de ${nome}: mensagem enviada não volta.` };
      return { ok: true, texto: `Desativei a seleção de ${nome}: o link não abre mais. A mensagem que saiu continua no WhatsApp dele (mensagem enviada não volta).` };
    },
  };

  // ── meu_link_e_mensagens (33) ────────────────────────────────────────────

  type Modelo = { id: string; titulo: string; conteudo: string; padrao: boolean };
  const PALAVRAS_DO_PEDIDO = new Set(["mensagem", "mensagens", "pronta", "prontas", "modelo", "modelos", "template", "a", "o", "de", "da", "do"]);

  /** O modelo pelo título ("boas-vindas"), nunca pelo conteúdo: conteúdo ditado seria recado livre. */
  function acharModelo(pedido: string, modelos: Modelo[]): Modelo[] {
    const alvo = normalizar(pedido).replace(/[^a-z0-9]+/g, " ").trim();
    const exatos = modelos.filter((m) => normalizar(m.titulo).replace(/[^a-z0-9]+/g, " ").trim() === alvo);
    if (exatos.length) return exatos;
    const palavras = alvo.split(" ").filter((p) => p.length >= 2 && !PALAVRAS_DO_PEDIDO.has(p));
    if (palavras.length === 0) return [];
    if (palavras.every((p) => p === "padrao")) return modelos.filter((m) => m.padrao);
    return modelos.filter((m) => {
      const titulo = normalizar(m.titulo).replace(/[^a-z0-9]+/g, " ");
      return palavras.every((p) => titulo.includes(p));
    });
  }

  async function prepararMensagemPronta(ctx: ContextoDoCentral, pedidoModelo: string, pedidoLead: string | null): Promise<Preparo> {
    const supabase = deps.supabase();
    const { data } = await supabase
      .from("templates_mensagens")
      .select("id, titulo, conteudo, padrao")
      .eq("grupo_id", ctx.grupoId)
      .eq("corretor_id", ctx.corretorId)
      .order("created_at", { ascending: false })
      .limit(100);
    const modelos = (data ?? []) as Modelo[];
    if (modelos.length === 0) {
      return recusa("Você ainda não tem mensagens prontas. Crie em Marketing → Modelos de mensagem, no painel; depois é só pedir aqui.");
    }
    const achados = acharModelo(pedidoModelo, modelos);
    if (achados.length === 0) {
      return resposta({ erro: `Não achei a mensagem pronta "${pedidoModelo}". ${SO_ISTO_VAI}`, suasMensagensProntas: modelos.slice(0, 10).map((m) => m.titulo) });
    }
    if (achados.length > 1) return resposta({ pergunta: "Qual mensagem pronta?", opcoes: achados.slice(0, 5).map((m) => m.titulo) });
    const modelo = achados[0];
    if (!pedidoLead) return pergunta(`Para qual cliente vai a mensagem pronta "${modelo.titulo}"?`);

    const lead = await clienteQueRecebe(ctx, pedidoLead, supabase);
    if ("tipo" in lead) return lead;
    const corretor = await lerCorretor(supabase, ctx);
    if (!corretor) return recusa("Não achei o seu perfil agora. Tente de novo.");
    // As variáveis do painel; o nome do cliente como a lista põe (primeiro
    // nome útil, e sem nome o marcador some sem deixar buraco).
    const preenchida = trocarNome(
      preencherTemplate(modelo.conteudo, { nomeLead: "{nome}", nomeCorretor: corretor.nome, telefoneCorretor: corretor.whatsapp }),
      primeiroNomeUtil(lead.nome),
    ).trim();
    const sobrou = preenchida.match(/\{\{?\s*[\w]+\s*\}?\}/g);
    if (sobrou) {
      return recusa(
        `A mensagem pronta "${modelo.titulo}" tem campo que só a lista de transmissão preenche (${[...new Set(sobrou)].join(", ")}). Mande por uma lista, ou ajuste o modelo no painel.`,
      );
    }
    return {
      tipo: "proposta",
      resumo: `Mandar a ${lead.nome}, pelo seu WhatsApp, a mensagem pronta "${modelo.titulo}": "${preenchida}"`,
      dados: { o_que: "mensagem_pronta", leadId: lead.id, nome: lead.nome, titulo: modelo.titulo, texto: preenchida },
    };
  }

  const meuLinkEMensagens: Acao = {
    async preparar(ctx, a) {
      const pedidoModelo = texto(a.mensagem_pronta, 120);
      const pedidoLead = texto(a.lead, 120);
      const pedidoImovel = texto(a.imovel, 160);
      if (pedidoModelo) return prepararMensagemPronta(ctx, pedidoModelo, pedidoLead);
      // "Manda meu link do Vitta pro João" é a apresentação do imóvel ao cliente.
      if (pedidoLead && pedidoImovel) return prepararMaterial(ctx, { lead: pedidoLead, imovel: pedidoImovel, material: "apresentação" });
      if (pedidoLead) return pergunta(`O que vai para ${pedidoLead}: uma mensagem pronta (qual?) ou o seu link de um imóvel (qual?)?`);

      // Daqui em diante é leitura: o link é DA PESSOA, para ela encaminhar.
      const supabase = deps.supabase();
      const corretor = await lerCorretor(supabase, ctx);
      if (!corretor?.slug) return recusa(SEM_SLUG);
      const enderecos = await deps.enderecos(ctx.grupoId);
      const aviso = "É o seu link: quem abre e chama no WhatsApp cai com você. Não mandei a ninguém.";
      if (!pedidoImovel) {
        if (enderecos.fichaDoGrupo) {
          return resposta({ mensagem: "A imobiliária ainda não tem site próprio, então o link pessoal é por imóvel. De qual imóvel?" });
        }
        return resposta({ portfolio: linkDoPortfolio({ enderecoDoCliente: enderecos.enderecoDoCliente, corretorSlug: corretor.slug }), oQueE: "o seu portfólio completo, para quem ainda não sabe o que procura", aviso });
      }
      const imovel = await imovelPublicado(ctx, pedidoImovel, supabase);
      if ("tipo" in imovel) return imovel;
      const link = linkDoImovel(enderecos, imovel.slug, corretor.slug);
      return resposta({
        imovel: imovel.nome,
        link,
        mensagemPronta: mensagemDoLinkDoImovel({ nome: imovel.nome, bairro: imovel.bairro, cidade: imovel.cidade, link }),
        aviso,
      });
    },

    async executar(ctx, dados) {
      // Só a mensagem pronta chega aqui; a apresentação vai por `mandar_material`.
      if (dados.o_que === "material") return mandarMaterial.executar(ctx, dados);
      if (dados.o_que !== "mensagem_pronta") return FALHOU;
      const mensagem = mensagemDosDados(dados.texto);
      if (!mensagem) return FALHOU;
      const nome = String(dados.nome ?? "o cliente");
      const titulo = String(dados.titulo ?? "mensagem pronta");
      const r = await mandar(ctx, dados, `Mensagem pronta "${titulo}" enviada ao cliente`, async () => ({ texto: mensagem }));
      if (!r) return FALHOU;
      return r.ok ? { ok: true, texto: `Mandei a ${nome}, pelo seu WhatsApp, a mensagem pronta "${titulo}".` } : { ok: false, texto: r.erro };
    },
  };

  return {
    consultas: {},
    acoes: { mandar_material: mandarMaterial, selecao_ou_proposta: selecaoOuProposta, meu_link_e_mensagens: meuLinkEMensagens },
  };
}

const TRATADORES_DO_CLIENTE = criarTratadoresDoCliente();
export const CONSULTAS_CLIENTE: Record<string, Consulta> = TRATADORES_DO_CLIENTE.consultas;
export const ACOES_CLIENTE: Record<string, Acao> = TRATADORES_DO_CLIENTE.acoes;
