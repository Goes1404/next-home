import "server-only";

import { FOLGA_ORCAMENTO, perfilDoLead, regiaoCasa } from "@/lib/crm/compatibilidade";
import { leadsQueCombinam, temPressaDeMudar, type ImovelParaMatch, type PreferenciasDoLead } from "@/lib/crm/matchDeImoveis";
import type { FiltroLeadsCampanha } from "@/lib/crm/publicoDaCampanha";
import { getParametrosCredito } from "@/lib/credito/parametros";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { linkPublicoDoImovel } from "@/lib/imovelPublico/ler";
import { formatarMoedaBRL, normalizarPrecoBRL } from "@/lib/precos/moneyUtils";
import { createServiceClient } from "@/lib/supabase/service";
import { aplicarContexto, variaveisSemValor } from "@/lib/whatsapp/listaDeTransmissao";
import {
  contextoDoPedido,
  criarListaPeloCentral,
  desfazerListaPeloCentral,
  EXTERNOS_DA_LISTA,
  listasDoCorretor,
  numerosDaLista,
  pausarListaPeloCentral,
  publicoDaListaPeloCentral,
  quantosSaemHoje,
  quemNuncaFalou,
  retomarListaPeloCentral,
  situacaoDoNumero,
  type ExternosDaLista,
  type ImovelDaLista,
  type ListaDoCorretor,
  type PessoaDaLista,
  type StatusDaLista,
} from "@/lib/whatsapp/listaPeloCentral";
import { PRIMEIRO_CONTATO_POR_DIA, PRIMEIRO_CONTATO_POR_SEMANA } from "@/lib/whatsapp/primeiroContato";
import type { Acao, Consulta, ContextoDoCentral, Preparo } from "../executar";
import { acharImovel, lerCatalogoDoGrupo, respostaDeImovelIncerto, type ImovelDoCatalogo } from "./imoveis";

/**
 * Frente L — listas da onda 3: montar_lista (14) e acompanhar_lista (15).
 *
 * Contrato em `../executar.ts`: `preparar` resolve no banco e NUNCA grava;
 * depois do "sim", `executar` grava só com os `dados` resolvidos; `desfazer`
 * volta atrás (spec 4.6). Toda escrita passa por
 * `@/lib/whatsapp/listaPeloCentral`, que confere grupo e dono de novo.
 *
 * O que vai ao cliente sai do número de QUEM PEDIU (spec 3.0 e 3.5): o
 * número, a carteira e as listas são sempre os de `ctx.corretorId`, também
 * para o gestor. Ele não dispara pelo número de outro corretor nem para os
 * clientes de outro; nenhum argumento do cérebro escolhe isso.
 *
 * Nada aqui envia. O "sim" só põe a lista na fila da tela de listas, e quem
 * manda é o disparador, com todas as travas anti-bloqueio de hoje (primeiro
 * contato, cota, janela, texto conferido, o mesmo telefone uma vez só). As
 * contas que a proposta mostra são as da tela e as do disparador, nunca uma
 * conta paralela (spec 6.2): quantas pessoas pela régua da tela, quantas
 * nunca falaram pela régua do primeiro contato, quantas cabem hoje pelas
 * vagas de primeiro contato e pela cota do número.
 */

type Supa = ReturnType<typeof createServiceClient>;

export type DependenciasDeListas = {
  /** A chave de serviço, uma por chamada. */
  banco: () => Supa;
  /** Provedor, limites e disparador: o teste troca. */
  externos: ExternosDaLista;
  /** As taxas de crédito do grupo (o teto pela renda, o mesmo do simulador). */
  parametros: (grupoId: string) => Promise<ParametrosCredito>;
  /** O link público da página do imóvel (`{link}` do texto); `null` se não der. */
  link: (grupoId: string, slug: string, corretorSlug: string | null) => Promise<string | null>;
  relogio: () => Date;
};

const PADRAO: DependenciasDeListas = {
  banco: () => createServiceClient(),
  externos: EXTERNOS_DA_LISTA,
  parametros: (grupoId) => getParametrosCredito(grupoId),
  link: async (grupoId, slug, corretorSlug) => {
    try {
      return await linkPublicoDoImovel({ grupoId, slug, corretorSlug });
    } catch {
      return null;
    }
  },
  relogio: () => new Date(),
};

/**
 * O texto que a tela de listas já traz escrito (`MENSAGEM_PADRAO` de
 * `NovaCampanha.tsx`), usado quando a pessoa pede a lista de um imóvel sem
 * ditar o texto. A tela é componente de navegador e não exporta a constante;
 * `listas.test.ts` cobra que as duas continuem iguais.
 */
export const MENSAGEM_PADRAO_DA_LISTA =
  "Olá! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no {imovel}, em {bairro}. Quer que eu te mande os detalhes?";

const reais = (n: number) => formatarMoedaBRL(n).replace(/\s/g, " ");

function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

/** O texto da lista como a pessoa ditou: as quebras de linha são dela. */
function textoDaMensagem(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, 1000) : null;
}

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });

// ── Para quem: o filtro em palavras ──────────────────────────────────────

export type PedidoDePublico = {
  /** O público da tela (`publicoDaCampanha`); sem palavra de público, "todos". */
  filtro: FiltroLeadsCampanha;
  /** O lugar pedido ("barueri", "zona sul"), já sem acento e minúsculo. */
  regiao: string | null;
  /** "até 600 mil": o teto do orçamento de quem entra. */
  ate: number | null;
  /** "2 dorms": quem pediu até esse número de dormitórios. */
  dormitorios: number | null;
};

/** Os públicos da tela, pelo jeito de dizer. A ordem importa: o primeiro que casar vale. */
const PUBLICOS: [RegExp, FiltroLeadsCampanha][] = [
  [/\b(compradores|compraram|ja comprou)\b/, "compradores"],
  [/\b(nao|sem)\s+(respond\w*|resposta|retorn\w*)/, "sem_resposta"],
  [/\b(parad[oa]s?|esfri\w*)\b/, "parados_15d"],
  [/\b(novos?|recem\w*|acabaram de chegar|chegaram agora|sem contato)\b/, "novos_sem_contato"],
];

/** Palavras que não dizem lugar nenhum: o resto do "para quem" é a região. */
const NAO_E_LUGAR = new Set(
  (
    "quem que quer querem queria procura procuram procurando busca buscam buscando interessado interessados interessada interessadas " +
    "interesse pra para pro pros pras por os as um uns uma umas de do da dos das em no na nos nas com sem e ou ja " +
    "meu meus minha minhas seu seus sua suas cliente clientes lead leads pessoa pessoas gente galera todo todos toda todas mundo " +
    "carteira lista transmissao manda mandar envia enviar regiao bairro cidade zona imovel imoveis apartamento apartamentos apto aptos " +
    "lancamento lancamentos empreendimento ate mil reais valor preco orcamento renda faixa dorm dorms dormitorio dormitorios quarto quartos " +
    "dias mais menos acima abaixo entre perto proximo morar comprar compra compradores compraram comprou parado parados parada paradas " +
    "nao respondem responderam resposta retorno retornaram novo novos recem chegar chegaram agora contato esfriaram esfriou"
  ).split(" "),
);

const FAIXA = /\bate\s*(?:r\$\s*)?(\d+(?:[.,]\d+)*)\s*(mil|k|milhao|milhoes|mi)?\b/;
const DORMITORIOS = /(\d{1,2})\s*(?:dorms?\b|dormit\w*|quartos?\b|qts?\b)/;

/** "600 mil", "1,2 milhão", "600k", "600" (em imóvel, "até 600" é 600 mil). */
function valorDaFaixa(numero: string, unidade: string | undefined): number | null {
  if (!unidade) {
    const v = normalizarPrecoBRL(numero);
    return v === null ? null : v < 10_000 ? v * 1000 : v;
  }
  const n = Number(numero.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * (unidade === "mil" || unidade === "k" ? 1000 : 1_000_000));
}

/**
 * O "para quem" do cérebro, em critério: o público da tela, o lugar, o teto
 * do orçamento e os dormitórios. Palavra que não é público, faixa,
 * dormitório nem o nome do imóvel vira LUGAR, de propósito: na dúvida o
 * filtro estreita (no pior caso ninguém entra e a resposta mostra o que foi
 * entendido), em vez de alargar para a carteira inteira, que é a lista fria
 * que derruba o número.
 */
export function lerPublico(paraQuem: string, nomesDoImovel: string[] = []): PedidoDePublico {
  let resto = ` ${normalizar(paraQuem)} `;
  let ate: number | null = null;
  const faixa = resto.match(FAIXA);
  if (faixa) {
    ate = valorDaFaixa(faixa[1], faixa[2]);
    resto = resto.replace(faixa[0], " ");
  }
  let dormitorios: number | null = null;
  const dorms = resto.match(DORMITORIOS);
  if (dorms) {
    const n = Number(dorms[1]);
    dormitorios = n >= 1 && n <= 10 ? n : null;
    resto = resto.replace(dorms[0], " ");
  }
  const filtro = PUBLICOS.find(([re]) => re.test(resto))?.[1] ?? "todos";
  const doImovel = new Set(nomesDoImovel.flatMap((n) => normalizar(n).split(/[^a-z0-9]+/)));
  const lugar = resto
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !NAO_E_LUGAR.has(t) && !doImovel.has(t));
  return { filtro, regiao: lugar.length ? lugar.join(" ") : null, ate, dormitorios };
}

const ROTULO_DO_PUBLICO: Record<FiltroLeadsCampanha, string> = {
  todos: "seus clientes",
  parados_15d: "quem esfriou (15+ dias parado)",
  novos_sem_contato: "quem acabou de chegar",
  sem_resposta: "quem foi abordado e não respondeu",
  compradores: "quem comprou",
  selecionados: "os escolhidos",
};

const capitalizar = (t: string) => t.replace(/\b\p{L}/gu, (l) => l.toUpperCase());

/** O público em palavras, para a proposta: é o que a pessoa confere antes do "sim". */
export function descreverPublico(p: PedidoDePublico, imovel: string | null): string {
  const partes = [p.filtro === "compradores" && imovel ? `quem comprou no ${imovel}` : ROTULO_DO_PUBLICO[p.filtro]];
  if (p.regiao) partes.push(`que querem ${capitalizar(p.regiao)}`);
  if (p.ate) partes.push(`com orçamento até ${reais(p.ate)}`);
  if (p.dormitorios) partes.push(`que pediram até ${p.dormitorios} ${p.dormitorios === 1 ? "dormitório" : "dormitórios"}`);
  if (imovel && p.filtro !== "compradores") partes.push(`que combinam com o ${imovel}`);
  return partes.join(", ");
}

/** O título que a tela de listas mostra: o imóvel e o recorte, curto. */
export function tituloDaLista(p: PedidoDePublico, imovel: string | null): string {
  const recorte = [
    p.filtro !== "todos" ? ROTULO_DO_PUBLICO[p.filtro] : null,
    p.regiao ? capitalizar(p.regiao) : null,
    p.ate ? `até ${reais(p.ate)}` : null,
    p.dormitorios ? `${p.dormitorios} dorms` : null,
  ].filter(Boolean);
  const titulo = `${imovel ?? "Lista"} · ${recorte.length ? recorte.join(", ") : imovel ? "quem combina" : "seus clientes"}`;
  return titulo.slice(0, 120);
}

/** O imóvel do catálogo no formato da régua de `matchDeImoveis`. */
function paraMatch(i: ImovelDoCatalogo): ImovelParaMatch {
  return { id: i.id, cidade: i.cidade, bairro: i.bairro, precoAPartir: i.precoAPartir, dormitorios: i.plantas.map((p) => p.dormitorios), status: i.status };
}

const positivo = (v: number | string | null | undefined) => (v != null && Number(v) > 0 ? Number(v) : null);

/** As preferências da régua, como a tela "Leads que combinam" monta: ficha manda, dossiê preenche o vazio. */
function preferencias(x: PessoaDaLista, credito: ParametrosCredito): PreferenciasDoLead {
  return {
    ...perfilDoLead(
      { regiao_interesse: x.regiaoInteresse, dormitorios_min: x.dormitoriosMin, orcamento_max: x.orcamentoMax, renda_mensal: x.rendaMensal },
      x.dossie,
      credito,
    ),
    orcamentoMin: positivo(x.orcamentoMin) ?? positivo(x.dossie?.orcamento_min),
    temPressa: temPressaDeMudar(x.dossie?.urgencia_mudanca),
    pediu: [x.imovelInteresseId, x.empreendimentoId].filter((v): v is string => Boolean(v)),
  };
}

/**
 * O público da tela recortado pelo que a pessoa pediu. Só o que o cliente
 * DISSE conta (a régua de `compatibilidade`): quem não declarou região não
 * entra em "quem quer Barueri"; quem não tem orçamento nem renda não entra
 * em "até 600 mil". Com imóvel, só vai para quem combina com ele
 * (`leadsQueCombinam`, a tela "Leads que combinam"), salvo os compradores
 * dele (o avanço da obra, a única exceção da tela).
 */
export function recortarPeloPedido(
  pessoas: PessoaDaLista[],
  pedido: PedidoDePublico,
  credito: ParametrosCredito,
  imovel: ImovelParaMatch | null,
): PessoaDaLista[] {
  let r = pessoas;
  if (pedido.regiao) {
    const lugar = pedido.regiao;
    r = r.filter((x) => Boolean(x.regiaoInteresse?.trim()) && regiaoCasa(x.regiaoInteresse as string, { cidade: lugar, bairro: "" }));
  }
  if (pedido.ate) {
    const ate = pedido.ate;
    r = r.filter((x) => {
      const pref = preferencias(x, credito);
      const teto = pref.orcamentoMax ?? pref.tetoPelaRenda ?? null;
      return teto !== null && teto <= ate * FOLGA_ORCAMENTO;
    });
  }
  if (pedido.dormitorios) {
    const n = pedido.dormitorios;
    r = r.filter((x) => Boolean(x.dormitoriosMin) && (x.dormitoriosMin as number) <= n);
  }
  if (imovel && pedido.filtro !== "compradores") r = leadsQueCombinam(imovel, r, (x) => preferencias(x, credito));
  return r;
}

function comoImovelDaLista(i: ImovelDoCatalogo): ImovelDaLista {
  return { id: i.id, nome: i.nome, slug: i.slug, bairro: i.bairro, cidade: i.cidade, precoAPartir: i.precoAPartir, dormitorios: i.plantas.map((p) => p.dormitorios) };
}

function imovelDosDados(v: unknown): ImovelDaLista | null {
  if (!v || typeof v !== "object") return null;
  const i = v as Record<string, unknown>;
  if (typeof i.id !== "string" || typeof i.nome !== "string" || typeof i.slug !== "string") return null;
  return {
    id: i.id,
    nome: i.nome,
    slug: i.slug,
    bairro: typeof i.bairro === "string" ? i.bairro : "",
    cidade: typeof i.cidade === "string" ? i.cidade : "",
    precoAPartir: typeof i.precoAPartir === "number" ? i.precoAPartir : null,
    dormitorios: Array.isArray(i.dormitorios) ? i.dormitorios.filter((d): d is number => typeof d === "number") : [],
  };
}

/** Nome e slug de quem pede, no grupo dele (o `{corretor}` do texto e o link com o slug dele). */
async function lerQuemPede(supabase: Supa, ctx: ContextoDoCentral): Promise<{ nome: string; slug: string | null }> {
  const { data } = await supabase.from("corretores").select("nome, slug").eq("grupo_id", ctx.grupoId).eq("id", ctx.corretorId).maybeSingle();
  return { nome: (data?.nome as string | null)?.trim() || ctx.nome, slug: (data?.slug as string | null) ?? null };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ── montar_lista (capacidade 14) ─────────────────────────────────────────

function criarMontarLista(deps: DependenciasDeListas): Acao {
  return {
    async preparar(ctx, a) {
      const paraQuem = texto(a.para_quem, 200) ?? "";
      const pedidoDoImovel = texto(a.imovel, 160);
      const ditado = textoDaMensagem(a.texto);
      const supabase = deps.banco();
      const agora = deps.relogio();

      // 1. O número de QUEM PEDIU. Desconectado: nada a propor.
      const numero = await situacaoDoNumero(supabase, deps.externos, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, agora });
      if (!numero.conectado) return resposta({ erro: numero.motivo });

      // 2. O imóvel, se a pessoa citou um: só o publicado (é o que tem página).
      let imovel: ImovelDoCatalogo | null = null;
      if (pedidoDoImovel) {
        const catalogo = (await lerCatalogoDoGrupo(supabase, ctx.grupoId)).filter((i) => i.publicado);
        const achado = acharImovel(pedidoDoImovel, catalogo, ctx.imobiliaria);
        if (achado.tipo !== "um") return resposta(respostaDeImovelIncerto(achado, pedidoDoImovel));
        imovel = achado.imovel;
      }

      const pedido = lerPublico(paraQuem, imovel ? [imovel.nome, ...imovel.nomesAlternativos] : []);
      if (pedido.filtro === "compradores" && !imovel) return resposta({ pergunta: "Compradores de qual imóvel? Peça o nome." });
      const descricao = descreverPublico(pedido, imovel?.nome ?? null);

      // 3. O texto: o que a pessoa ditou, ou o padrão da tela para o imóvel.
      const quem = await lerQuemPede(supabase, ctx);
      const link = imovel ? await deps.link(ctx.grupoId, imovel.slug, quem.slug) : null;
      const daLista = imovel ? comoImovelDaLista(imovel) : null;
      const contexto = contextoDoPedido({ imovel: daLista, link, corretorNome: quem.nome });
      const mensagemBase = ditado ?? (imovel ? MENSAGEM_PADRAO_DA_LISTA : null);
      if (!mensagemBase) {
        return resposta({ pergunta: "Qual texto vai na lista? Peça a mensagem (ou o imóvel, para usar o texto padrão da tela de listas)." });
      }
      const faltando = variaveisSemValor(mensagemBase, contexto);
      if (faltando.length > 0) {
        return resposta({
          erro: ditado
            ? `O texto usa ${faltando.map((v) => `{${v}}`).join(", ")}, mas ${imovel ? `o cadastro do ${imovel.nome} não tem esse dado` : "a lista não tem imóvel"}. Peça o texto sem isso.`
            : `O cadastro do ${imovel?.nome} não tem ${faltando.join(", ")}, que o texto padrão usa. Peça o texto da lista.`,
        });
      }

      // 4. Quem recebe: a régua da tela, recortada pelo pedido.
      let publico: Awaited<ReturnType<typeof publicoDaListaPeloCentral>>;
      try {
        publico = await publicoDaListaPeloCentral(supabase, {
          grupoId: ctx.grupoId,
          corretorId: ctx.corretorId,
          filtro: pedido.filtro,
          imovelSlug: pedido.filtro === "compradores" && imovel ? imovel.slug : null,
        });
      } catch {
        return resposta({ erro: "Não consegui conferir quem recebeu lista nos últimos dias. Tente de novo daqui a pouco." });
      }
      const credito = await deps.parametros(ctx.grupoId);
      const pessoas = recortarPeloPedido(publico.pessoas, pedido, credito, imovel ? paraMatch(imovel) : null);
      if (pessoas.length === 0) {
        return resposta({
          nenhum: `Ninguém da sua carteira entra em "${descricao}" agora.`,
          protegidos: publico.protegidos
            ? `${plural(publico.protegidos, "cliente ficou", "clientes ficaram")} de fora por já estar em outra lista ou ter recebido lista nos últimos 7 dias.`
            : undefined,
        });
      }

      const plano = await deps.externos.limiteDoPlano(ctx.grupoId, pessoas.length);
      if (!plano.ok) return resposta({ erro: plano.erro });

      // 5. As contas: quantas nunca falaram e quantas saem hoje.
      const nunca = await quemNuncaFalou(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, pessoas });
      const nuncaFalaram = pessoas.filter((x) => nunca.has(x.id)).length;
      const primeiroContatoHoje = Math.min(nuncaFalaram, numero.vagasDePrimeiroContato);
      const saemHoje = quantosSaemHoje({
        pessoas: pessoas.length,
        nuncaFalaram,
        vagasDePrimeiroContato: numero.vagasDePrimeiroContato,
        saldoDaCota: numero.saldoDaCota,
        naFilaHoje: numero.naFilaHoje,
        expediente: numero.expediente,
        agora,
      });

      const titulo = tituloDaLista(pedido, imovel?.nome ?? null);
      const linhas = [
        `Lista de transmissão pelo SEU WhatsApp${numero.telefone ? ` (${numero.telefone})` : ""}: ${descricao}.`,
        `${plural(pessoas.length, "pessoa", "pessoas")}; ${plural(nuncaFalaram, "nunca falou", "nunca falaram")} com você.`,
        nuncaFalaram > 0
          ? `Primeiro contato tem limite (${PRIMEIRO_CONTATO_POR_DIA} por dia, ${PRIMEIRO_CONTATO_POR_SEMANA} por semana): hoje cabem ${primeiroContatoHoje} de ${nuncaFalaram}.${numero.motivoSemPrimeiroContato ? ` ${numero.motivoSemPrimeiroContato.replace(/^Esta pessoa nunca falou com você\. /, "")}` : ""}`
          : null,
        `Hoje devem sair cerca de ${saemHoje}; o resto fica na fila para os próximos dias, no ritmo seguro do número (${numero.saldoDaCota} na cota de hoje).`,
        numero.bloqueadoAte ? "Os envios do seu número estão pausados por falhas seguidas do WhatsApp; voltam sozinhos." : null,
        `Texto: "${aplicarContexto(mensagemBase, contexto)}"`,
        "Cada mensagem é reescrita e conferida antes de sair (não sai texto repetido), primeiro contato vai sem foto, e quem já recebeu lista nesta semana fica de fora.",
      ].filter(Boolean);
      return {
        tipo: "proposta",
        resumo: linhas.join("\n"),
        dados: {
          titulo,
          imovel: daLista,
          link,
          corretorNome: quem.nome,
          filtro: pedido.filtro === "compradores" ? "compradores" : "selecionados",
          mensagemBase,
          pessoas: pessoas.length,
          nuncaFalaram,
          saemHoje,
          // Os ids confirmados: grandes e sem valor para análise, ficam fora do registro.
          _leadIds: pessoas.map((x) => x.id),
        },
      };
    },

    async executar(ctx, d) {
      const titulo = texto(d.titulo, 120);
      const mensagemBase = textoDaMensagem(d.mensagemBase);
      const leadIds = Array.isArray(d._leadIds) ? d._leadIds.filter((x): x is string => typeof x === "string") : [];
      if (!titulo || !mensagemBase || leadIds.length === 0) return { ok: false, texto: "Não consegui montar a lista: faltou o público ou o texto." };
      const r = await criarListaPeloCentral(deps.banco(), deps.externos, {
        grupoId: ctx.grupoId,
        corretorId: ctx.corretorId,
        corretorNome: texto(d.corretorNome, 120),
        titulo,
        imovel: imovelDosDados(d.imovel),
        link: texto(d.link, 500),
        filtro: d.filtro === "compradores" ? "compradores" : "selecionados",
        leadIds,
        mensagemBase,
      });
      if (!r.ok) return { ok: false, texto: r.erro };
      const fora = leadIds.length - r.total;
      const semWhats = r.semWhatsapp ? ` ${plural(r.semWhatsapp, "número não tem", "números não têm")} WhatsApp e ficou de fora.` : "";
      const outros = fora - r.semWhatsapp > 0 ? ` ${plural(fora - r.semWhatsapp, "pessoa saiu", "pessoas saíram")} desde a proposta (outra lista, pedido para sair).` : "";
      return {
        ok: true,
        texto:
          `Lista na fila do seu WhatsApp: ${plural(r.total, "pessoa", "pessoas")}.${semWhats}${outros} ` +
          `As mensagens saem sozinhas, no ritmo seguro do número; para ver como está, pergunte "como está a lista".`,
        desfazer: { campanhaId: r.campanhaId, titulo },
      };
    },

    async desfazer(ctx, d) {
      const campanhaId = texto(d.campanhaId, 64);
      const titulo = texto(d.titulo, 120) ?? "a lista";
      if (!campanhaId) return { ok: false, texto: "Não sei qual lista desfazer." };
      const r = await desfazerListaPeloCentral(deps.banco(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, campanhaId });
      if (r.desfecho === "cancelada") {
        return {
          ok: true,
          texto: r.enviados
            ? `Cancelei o resto da lista "${titulo}"; ${plural(r.enviados, "mensagem já tinha saído", "mensagens já tinham saído")} e não volta.`
            : `Desfeito: a lista "${titulo}" foi cancelada antes de sair qualquer mensagem.`,
        };
      }
      // Lista que já começou a sair só pausa (spec 4.6): mensagem entregue não volta.
      if (r.desfecho === "pausada") {
        return {
          ok: true,
          texto: `A lista "${titulo}" já começou a sair (${plural(r.enviados, "mensagem enviada", "mensagens enviadas")}): o que saiu não dá para desfazer. Pausei o resto; para continuar, peça para retomar a lista.`,
        };
      }
      if (r.desfecho === "ja_terminou") return { ok: false, texto: `A lista "${titulo}" já está ${ROTULO_DO_STATUS[r.status]}: não há o que desfazer.` };
      return { ok: false, texto: `Não achei mais a lista "${titulo}" entre as suas.` };
    },
  };
}

// ── acompanhar_lista (capacidade 15) ─────────────────────────────────────

const ROTULO_DO_STATUS: Record<StatusDaLista, string> = {
  rascunho: "em rascunho",
  em_andamento: "enviando",
  pausada: "pausada",
  concluida: "concluída",
  cancelada: "cancelada",
};

type OQue = "ver" | "pausar" | "retomar";

function lerOQue(v: unknown): OQue {
  const t = normalizar(String(v ?? "")).trim();
  if (t === "ver" || t === "pausar" || t === "retomar") return t;
  // "Despausar" contém "paus": o retomar é conferido antes.
  if (/retom|despaus|continu|volt|solt/.test(t)) return "retomar";
  if (/paus|parar|segura/.test(t)) return "pausar";
  return "ver";
}

/** Palavras que não distinguem uma lista da outra. */
const VAZIAS_DA_LISTA = new Set(["a", "o", "as", "os", "da", "do", "de", "das", "dos", "lista", "listas", "transmissao", "minha", "meu", "aquela", "essa", "esta", "que", "mandei"]);

export type ListaAchada = { tipo: "uma"; lista: ListaDoCorretor } | { tipo: "varias"; opcoes: ListaDoCorretor[] } | { tipo: "nenhuma" };

const ATIVA = new Set<StatusDaLista>(["em_andamento", "pausada"]);

/**
 * Qual lista a pessoa quis dizer, entre as DELA. Pelo texto: cada palavra
 * no título ou no nome do imóvel, ou o imóvel que o texto aponta pelo
 * catálogo (`imovelId`, com os apelidos: "a lista do Vitta" é a do Vitra).
 * Sem texto (ou empate), conta o que o pedido pode alcançar: pausar só uma
 * que está enviando, retomar só uma pausada, ver prefere as ativas. Mais de
 * uma vira pergunta numerada.
 */
export function escolherLista(listas: ListaDoCorretor[], pedido: string | null, oQue: OQue, imovelId: string | null = null): ListaAchada {
  const alcancavel = (l: ListaDoCorretor) =>
    oQue === "pausar" ? l.status === "em_andamento" : oQue === "retomar" ? l.status === "pausada" : ATIVA.has(l.status);
  const palavras = pedido
    ? normalizar(pedido)
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 2 && !VAZIAS_DA_LISTA.has(p))
    : [];
  const candidatas = palavras.length
    ? listas.filter((l) => {
        if (imovelId && l.imovelId === imovelId) return true;
        const alvo = normalizar(`${l.titulo} ${l.imovel ?? ""}`);
        return palavras.every((p) => alvo.includes(p));
      })
    : listas;
  if (candidatas.length === 0) return { tipo: "nenhuma" };
  const alcancaveis = candidatas.filter(alcancavel);
  if (alcancaveis.length === 1) return { tipo: "uma", lista: alcancaveis[0] };
  if (alcancaveis.length > 1) return { tipo: "varias", opcoes: alcancaveis.slice(0, 5) };
  // Nenhuma no estado que o pedido alcança: com nome, a mais recente que
  // casou (a resposta explica o estado dela); sem nome, "ver" mostra a última.
  if (palavras.length || oQue === "ver") return { tipo: "uma", lista: candidatas[0] };
  return { tipo: "nenhuma" };
}

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));

const rotuloDaOpcao = (l: ListaDoCorretor) => `${l.titulo} (${ROTULO_DO_STATUS[l.status]}, criada em ${dataCurta(l.criadaEm)})`;

function criarAcompanharLista(deps: DependenciasDeListas): Acao {
  return {
    async preparar(ctx, a) {
      const oQue = lerOQue(a.o_que);
      const pedido = texto(a.lista, 120);
      const supabase = deps.banco();
      // Sempre as listas de quem pede: a tela também só mostra as do próprio corretor.
      const listas = await listasDoCorretor(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId });
      // O imóvel pelo texto, com os apelidos do catálogo (o mesmo `acharImovel` da lista nova).
      let imovelId: string | null = null;
      if (pedido && listas.some((l) => l.imovelId)) {
        const achado = acharImovel(pedido, await lerCatalogoDoGrupo(supabase, ctx.grupoId), ctx.imobiliaria);
        if (achado.tipo === "um") imovelId = achado.imovel.id;
      }
      const achada = escolherLista(listas, pedido, oQue, imovelId);
      if (achada.tipo === "varias") {
        return resposta({ pergunta: "Você tem mais de uma lista assim. Pergunte qual é.", opcoes: achada.opcoes.map(rotuloDaOpcao) });
      }
      if (achada.tipo === "nenhuma") {
        if (pedido) return resposta({ erro: `Não achei lista sua com "${pedido}". As listas ficam em Listas, no painel.` });
        return resposta({
          mensagem:
            oQue === "pausar"
              ? "Nenhuma lista sua está enviando agora."
              : oQue === "retomar"
                ? "Nenhuma lista sua está pausada."
                : "Você ainda não tem lista de transmissão.",
        });
      }
      const lista = achada.lista;

      if (oQue === "ver") {
        const n = await numerosDaLista(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, campanhaId: lista.id, agora: deps.relogio() });
        if (!n) return resposta({ erro: "Não consegui ler essa lista agora." });
        // Só números: quem é cada um (e o que respondeu) fica no painel.
        return resposta({
          lista: lista.titulo,
          situacao: ROTULO_DO_STATUS[lista.status],
          pessoas: n.pessoas,
          enviadas: n.enviados,
          responderam: n.responderam,
          naFilaParaHoje: lista.status === "em_andamento" ? n.naFilaHoje : undefined,
          ficaramParaOsProximosDias: n.ficaramParaDepois || undefined,
          esperandoVagaDePrimeiroContato: n.esperandoPrimeiroContato || undefined,
          naoVaoSair: n.naoVaoSair || undefined,
          motivoDaPausa: lista.pausaAutomatica ?? undefined,
          ondeVerQuem: "Quem é cada um fica no painel, em Listas → Ver quem recebeu.",
        });
      }

      if (oQue === "pausar") {
        if (lista.status !== "em_andamento") return resposta({ mensagem: `A lista "${lista.titulo}" não está enviando agora (${ROTULO_DO_STATUS[lista.status]}).` });
        return { tipo: "proposta", resumo: `Pausar a lista "${lista.titulo}": nada mais sai dela até você retomar.`, dados: { campanhaId: lista.id, titulo: lista.titulo, acao: "pausar" } };
      }

      if (lista.status !== "pausada") return resposta({ mensagem: `A lista "${lista.titulo}" não está pausada (${ROTULO_DO_STATUS[lista.status]}).` });
      const numero = await situacaoDoNumero(supabase, deps.externos, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, agora: deps.relogio() });
      const avisos = [
        lista.pausaAutomatica ? `Ela parou sozinha: ${lista.pausaAutomatica}` : null,
        numero.conectado ? null : "Seu WhatsApp está desconectado: nada sai até você conectar o número.",
      ].filter(Boolean);
      return {
        tipo: "proposta",
        resumo: [`Retomar a lista "${lista.titulo}": as mensagens voltam a sair no ritmo seguro do seu número.`, ...avisos].join("\n"),
        dados: { campanhaId: lista.id, titulo: lista.titulo, acao: "retomar" },
      };
    },

    async executar(ctx, d) {
      const campanhaId = texto(d.campanhaId, 64);
      const titulo = texto(d.titulo, 120) ?? "a lista";
      if (!campanhaId) return { ok: false, texto: "Não sei qual lista." };
      const alvo = { grupoId: ctx.grupoId, corretorId: ctx.corretorId, campanhaId };
      if (d.acao === "pausar") {
        const r = await pausarListaPeloCentral(deps.banco(), alvo);
        return r.ok
          ? { ok: true, texto: `Lista "${titulo}" pausada.`, desfazer: { campanhaId, titulo, acao: "pausar" } }
          : { ok: false, texto: `Não pausei "${titulo}": ${r.erro}` };
      }
      if (d.acao === "retomar") {
        const r = await retomarListaPeloCentral(deps.banco(), deps.externos, alvo);
        return r.ok
          ? { ok: true, texto: `Lista "${titulo}" retomada.`, desfazer: { campanhaId, titulo, acao: "retomar" } }
          : { ok: false, texto: `Não retomei "${titulo}": ${r.erro}` };
      }
      return { ok: false, texto: "Não sei o que fazer com a lista." };
    },

    // Desfazer pausar é retomar, e vice-versa.
    async desfazer(ctx, d) {
      const campanhaId = texto(d.campanhaId, 64);
      const titulo = texto(d.titulo, 120) ?? "a lista";
      if (!campanhaId) return { ok: false, texto: "Não sei qual lista." };
      const alvo = { grupoId: ctx.grupoId, corretorId: ctx.corretorId, campanhaId };
      if (d.acao === "pausar") {
        const r = await retomarListaPeloCentral(deps.banco(), deps.externos, alvo);
        return r.ok ? { ok: true, texto: `Desfeito: a lista "${titulo}" voltou a enviar.` } : { ok: false, texto: `Não retomei "${titulo}": ${r.erro}` };
      }
      if (d.acao === "retomar") {
        const r = await pausarListaPeloCentral(deps.banco(), alvo);
        return r.ok ? { ok: true, texto: `Desfeito: a lista "${titulo}" voltou a ficar pausada.` } : { ok: false, texto: `Não pausei "${titulo}": ${r.erro}` };
      }
      return { ok: false, texto: "Não sei o que desfazer na lista." };
    },
  };
}

// ── Os tratadores ────────────────────────────────────────────────────────

/** As ações com as peças trocáveis: o teste passa banco falso, provedor, limites e relógio. */
export function criarTratadoresDeListas(parciais: Partial<DependenciasDeListas> = {}): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const deps: DependenciasDeListas = { ...PADRAO, ...parciais };
  return { consultas: {}, acoes: { montar_lista: criarMontarLista(deps), acompanhar_lista: criarAcompanharLista(deps) } };
}

const PRONTOS = criarTratadoresDeListas();
export const CONSULTAS_LISTAS: Record<string, Consulta> = PRONTOS.consultas;
export const ACOES_LISTAS: Record<string, Acao> = PRONTOS.acoes;
