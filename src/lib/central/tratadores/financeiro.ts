import "server-only";

import { normalizar } from "@/lib/agenda/comandos/normalizar";
import {
  campanhasDoGrupo,
  desfazerGastoPeloCentral,
  escolherCampanha,
  informarGastoPeloCentral,
  type CampanhaDoGrupo,
  type RegistroDoGasto,
} from "@/lib/crm/gastoDeAnuncioPeloCentral";
import { atualizarFichaPeloCentral, desfazerAtualizacaoPeloCentral, nomeDoDono, type RegistroDaAtualizacao } from "@/lib/crm/leadPeloCentral";
import {
  DIAS_PARADO_DO_PAINEL,
  TETO_DA_REDISTRIBUICAO,
  devolverLeadsPeloCentral,
  equipeDoGrupo,
  escolherCorretor,
  leadsParaRedistribuir,
  redistribuirLeadsPeloCentral,
  type CriterioDaRedistribuicao,
  type LeadMovido,
} from "@/lib/crm/redistribuicaoPeloCentral";
import { CATEGORIAS, ROTULO_CATEGORIA, type Categoria, type TipoMovimento } from "@/lib/financeiro/caixa";
import { desfazerLancamentoPeloCentral, lancarNoCaixaPeloCentral } from "@/lib/financeiro/caixaPeloCentral";
import { centavos, formatarPercentual, formatarReais, hojeEmSaoPaulo, lerReais, resolverPar } from "@/lib/financeiro/venda";
import {
  comissaoDeReferencia,
  desfazerVendaPeloCentral,
  lerLeadDaVenda,
  nomeDoImovel,
  procurarImovelNoGrupo,
  registrarVendaPeloCentral,
  ultimoRepasseNoGrupo,
  vendaAtivaDoLead,
  type ComissaoDeReferencia,
} from "@/lib/financeiro/vendaPeloCentral";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { avisarPeloCentral } from "../avisoDeQuedaPeloCentral";
import type { Acao, Consulta, ContextoDoCentral, Preparo } from "../executar";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente H — financeiro e gestão da onda 2: registrar_venda (9),
 * lancar_no_caixa (26, gestor), informar_gasto_de_anuncio (25),
 * redistribuir_leads (13, gestor).
 *
 * Contrato em `../executar.ts`: `preparar` resolve no banco e NUNCA grava;
 * o "sim" roda `executar` só com os `dados` resolvidos; `desfazer` volta
 * atrás em até 24 h (spec 4.6). Nada aqui escreve em tabela: venda em
 * `financeiro/vendaPeloCentral.ts`, caixa em `financeiro/caixaPeloCentral.ts`,
 * gasto de anúncio em `crm/gastoDeAnuncioPeloCentral.ts`, redistribuição em
 * `crm/redistribuicaoPeloCentral.ts` e a etapa do lead em
 * `crm/leadPeloCentral.ts`. Cada um confere grupo e dono de novo no "sim".
 *
 * O papel vem da identificação. O executor já barra o corretor nas
 * ferramentas `soGestor`, e as ações de gestor conferem o papel de novo no
 * `executar` e no `desfazer`: um item de proposta não pode virar escrita de
 * gestor por outro caminho.
 */

type Supa = ReturnType<typeof createServiceClient>;

/** O que as ações usam de fora: o teste passa o banco falso, o aviso falso e o relógio. */
export type DependenciasDoFinanceiro = {
  banco: () => Supa;
  avisar: (corretorId: string, texto: (nome: string) => string) => Promise<{ enviado: boolean }>;
  agora: () => Date;
};

const SO_GESTOR = "Isso é só para o gestor da imobiliária.";

/** "R$ 450.000", sem o espaço inseparável do `toLocaleString` (o WhatsApp o mostra estranho). */
const reais = (n: number) => formatarReais(n).replace(/\s/g, " ");

/** Texto do cérebro, aparado e com teto. Vazio vira `null`. */
function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });
const pergunta = (p: string, opcoes?: string[]): Preparo => resposta(opcoes ? { pergunta: p, opcoes } : { pergunta: p });
const recusa = (erro: string): Preparo => resposta({ erro });

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

/** "30/10" a partir de "2026-10-30". */
const rotuloDoDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const soDoCorretor = (ctx: ContextoDoCentral) => (ctx.papel === "gestor" ? null : ctx.corretorId);

/**
 * Valor em reais como a pessoa fala: 450000, "450 mil", "1.200", "1,2 mil",
 * "R$ 3.200,50", "1,5 milhão". O catálogo diz `number`, mas o cérebro às
 * vezes manda o texto que ouviu. `null` para o que não é valor positivo.
 *
 * Não usa `normalizarPrecoBRL` (preços): ela arredonda para real inteiro e
 * lê "m" solto como milhão; caixa tem centavo.
 */
export function lerValorEmReais(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? centavos(v) : null;
  if (typeof v !== "string") return null;
  const t = v
    .toLowerCase()
    .replace(/r\$|reais|real/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const milhao = /\d\s*(milh[aã]o|milh[oõ]es|mi)\b/.test(t);
  const mil = !milhao && /\d\s*(mil\b|k\b)/.test(t);
  if (!milhao && !mil) {
    const n = lerReais(t);
    return n !== null && n > 0 ? n : null;
  }
  const base = t.replace(/(milh[aã]o|milh[oõ]es|mi|mil|k)\b.*$/, "").replace(/\s/g, "");
  // "1.200 mil" é mil e duzentos mil; "1,2 mil" e "1.2 mil", um e dois décimos.
  const normal = /^\d{1,3}(\.\d{3})+$/.test(base) ? base.replace(/\./g, "") : base.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = centavos(Number(normal) * (milhao ? 1_000_000 : 1_000));
  return n > 0 ? n : null;
}

// ── registrar_venda ────────────────────────────────────────────────────────

/** Venda abaixo disso é engano de digitação ("450" no lugar de "450 mil"). */
const MENOR_VENDA = 10_000;

function deOndeVeioAComissao(c: ComissaoDeReferencia, imovel: string | null, participante: string | null): string {
  if (c.de === "imovel") return `a da última venda ${imovel ? `do ${imovel}` : "deste imóvel"}`;
  if (c.de === "corretor") return participante ? `a da última venda de ${participante}` : "a da sua última venda";
  return "a da última venda da imobiliária";
}

type DadosDaVenda = {
  leadId: string;
  nome: string;
  participanteId: string;
  imovelId: string | null;
  imovelDescricao: string;
  dataVenda: string;
  valorVenda: number;
  comissaoPercentual: number;
  repassePercentual: number;
};

/** Os `dados` da venda, de volta do JSON da proposta. Faltou algo, `null`. */
function dadosDaVenda(d: Record<string, unknown>): DadosDaVenda | null {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const leadId = texto(d.leadId, 64);
  const participanteId = texto(d.participanteId, 64);
  const dataVenda = texto(d.dataVenda, 10);
  const valorVenda = num(d.valorVenda);
  const comissaoPercentual = num(d.comissaoPercentual);
  const repassePercentual = num(d.repassePercentual);
  if (!leadId || !participanteId || !dataVenda || valorVenda === null || comissaoPercentual === null || repassePercentual === null) return null;
  return {
    leadId,
    nome: texto(d.nome, 120) ?? "o cliente",
    participanteId,
    imovelId: texto(d.imovelId, 64),
    imovelDescricao: texto(d.imovelDescricao, 200) ?? "",
    dataVenda,
    valorVenda,
    comissaoPercentual,
    repassePercentual,
  };
}

// ── lancar_no_caixa ────────────────────────────────────────────────────────

const TIPO_DO_PEDIDO: Record<string, TipoMovimento> = { despesa: "saida", receita: "entrada" };

/**
 * A categoria pelo que a pessoa disse ("aluguel", "salário da Bia", "Zap").
 * A lista é a da tela (`CATEGORIAS_DO_TIPO`); o que não casa vai para
 * "Outros" (ou "Outras receitas"), e o resumo mostra qual foi.
 */
const PISTAS_DA_DESPESA: [Categoria, RegExp][] = [
  ["aluguel", /\b(aluguel|condominio|iptu do escritorio)\b/],
  ["pessoal", /\b(salario|salarios|folha|ferias|13o|decimo|vale|beneficio|estagiario|recepcionista|pro labore)\b/],
  ["impostos", /\b(imposto|impostos|taxa|taxas|das|iss|irpj|csll|pis|cofins|inss|darf|guia|creci)\b/],
  ["portais", /\b(portal|portais|zap|zapimoveis|viva ?real|olx|imovelweb|chaves na mao|quinto andar)\b/],
  ["marketing", /\b(anuncio|anuncios|marketing|impulsionamento|meta|facebook|instagram|google|ads|panfleto|placa|placas|fotografo|fotos|video)\b/],
  ["sistemas", /\b(sistema|sistemas|assinatura|software|crm|site|dominio|hospedagem|aplicativo|app)\b/],
  ["contabilidade", /\b(contador|contadora|contabilidade|contabil)\b/],
  ["escritorio", /\b(luz|energia|agua|internet|telefone|limpeza|material|manutencao|cafe|escritorio|moveis|reforma)\b/],
];

export function categoriaDoLancamento(tipo: TipoMovimento, descricao: string): Categoria {
  const d = normalizar(descricao);
  if (tipo === "entrada") return /\bcomiss/.test(d) ? "comissao_avulsa" : "outras_receitas";
  return PISTAS_DA_DESPESA.find(([, pista]) => pista.test(d))?.[0] ?? "outros";
}

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaReal(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d.toISOString().slice(0, 10) : null;
}

/**
 * O dia do lançamento ("hoje", "ontem", "dia 10", "05/11", "2026-11-05").
 * Sem nada, hoje. A régua da agenda (`quandoEmTexto`) olha só para a frente
 * ("dia 5" no dia 30 é o mês que vem); no caixa o dia costuma ser o de um
 * pagamento que já aconteceu, então "dia 10" é o deste mês e a data com
 * barra é a deste ano. Mais de um ano para lá ou para cá é engano.
 */
export function lerDiaDoCaixa(v: unknown, hoje: string): string | null {
  const dito = typeof v === "string" ? normalizar(v) : "";
  if (!dito || /\bhoje\b/.test(dito)) return hoje;
  const [ano, mes] = hoje.split("-").map(Number);
  let dia: string | null = null;
  if (/\banteontem\b/.test(dito)) dia = somarDias(hoje, -2);
  else if (/\bontem\b/.test(dito)) dia = somarDias(hoje, -1);
  else if (/\bdepois de amanha\b/.test(dito)) dia = somarDias(hoje, 2);
  else if (/\bamanha\b/.test(dito)) dia = somarDias(hoje, 1);
  else {
    const iso = /\b(\d{4}) (\d{1,2}) (\d{1,2})\b/.exec(dito);
    const barra = /\b(\d{1,2}) (\d{1,2})(?: (\d{4}|\d{2}))?\b/.exec(dito);
    const solto = /\bdia (\d{1,2})\b/.exec(dito);
    if (iso) dia = diaReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    else if (solto && !barra) dia = diaReal(ano, mes, Number(solto[1]));
    else if (barra) {
      const a = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : ano;
      dia = diaReal(a, Number(barra[2]), Number(barra[1]));
    }
  }
  if (!dia) return null;
  const distancia = Math.abs(Date.parse(dia) - Date.parse(hoje)) / 86_400_000;
  return distancia <= 366 ? dia : null;
}

// ── redistribuir_leads ─────────────────────────────────────────────────────

/** "os parados", "parados há 30 dias", "todos": o recorte que a pessoa disse. */
export function lerCriterio(v: unknown): CriterioDaRedistribuicao | null {
  const dito = typeof v === "string" ? normalizar(v) : "";
  if (!dito) return null;
  if (/\b(parad|sem mexer|esquecid|abandonad|sem andamento)/.test(dito)) {
    const dias = Number(/\b(\d{1,3}) ?dias?\b/.exec(dito)?.[1]);
    return { tipo: "parados", dias: Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : DIAS_PARADO_DO_PAINEL };
  }
  if (/\b(todos|todas|tudo|carteira|ativos|em andamento|abertos)\b/.test(dito)) return { tipo: "em_andamento" };
  return null;
}

function descreverCriterio(c: CriterioDaRedistribuicao): string {
  return c.tipo === "parados" ? `parados há ${c.dias}+ dias` : "em andamento";
}

const leads = (n: number) => `${n} lead${n === 1 ? "" : "s"}`;

function criterioDosDados(v: unknown): CriterioDaRedistribuicao | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (c.tipo === "em_andamento") return { tipo: "em_andamento" };
  if (c.tipo === "parados" && typeof c.dias === "number") return { tipo: "parados", dias: c.dias };
  return null;
}

function movidosDosDados(v: unknown): LeadMovido[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is { id: string; origem?: unknown } => !!l && typeof l === "object" && typeof (l as { id?: unknown }).id === "string")
    .map((l) => ({ id: l.id, origem: typeof l.origem === "string" ? l.origem : null }));
}

// ── As ações ──────────────────────────────────────────────────────────────

export function criarAcoesDoFinanceiro(deps: Partial<DependenciasDoFinanceiro> = {}): Record<string, Acao> {
  const banco = deps.banco ?? (() => createServiceClient());
  const avisar = deps.avisar ?? avisarPeloCentral;
  const agora = deps.agora ?? (() => new Date());

  const registrar_venda: Acao = {
    async preparar(ctx, a) {
      const pedido = texto(a.lead, 120);
      if (!pedido) return pergunta("Qual cliente comprou? Peça o nome.");
      const valor = lerValorEmReais(a.valor);
      if (valor === null) return pergunta("Qual foi o valor da venda? (ex.: 450 mil)");
      if (valor < MENOR_VENDA) return pergunta(`${reais(valor)} por um imóvel? Confirme o valor inteiro da venda (ex.: 450 mil).`);

      const supabase = banco();
      const achado = await resolverLead(ctx, pedido, supabase);
      if (achado.tipo !== "um") return resposta(respostaDeLeadIncerto(achado, pedido));
      const lead = await lerLeadDaVenda(supabase, { grupoId: ctx.grupoId, leadId: achado.lead.id, soDoCorretor: soDoCorretor(ctx) });
      if (!lead) return resposta(respostaDeLeadIncerto({ tipo: "nenhum" }, pedido));

      // Duas vezes a mesma venda dobraria a comissão no caixa e no ranking.
      const ja = await vendaAtivaDoLead(supabase, ctx.grupoId, lead.id);
      if (ja) {
        return resposta({
          mensagem: `${lead.nome} já tem venda registrada (${reais(ja.valorVenda)}, ${rotuloDoDia(ja.dataVenda)}). Não registrei outra; para corrigir, abra a venda em Financeiro no painel.`,
        });
      }

      let imovelId: string | null = null;
      let imovelNome: string | null = null;
      const imovelDito = texto(a.imovel, 120);
      if (imovelDito) {
        const r = await procurarImovelNoGrupo(supabase, ctx.grupoId, imovelDito);
        if (r.tipo === "varios") return pergunta(`Qual imóvel foi vendido?`, r.opcoes.map((o) => o.nome));
        if (r.tipo === "um") ({ id: imovelId, nome: imovelNome } = r.imovel);
      } else if (lead.imovelId) {
        // Sem imóvel no pedido, o de interesse do lead (a tela de venda nova faz igual).
        imovelNome = await nomeDoImovel(supabase, ctx.grupoId, lead.imovelId);
        if (imovelNome) imovelId = lead.imovelId;
      }
      // Imóvel fora do catálogo vira descrição livre, como o "Outro" da tela.
      const imovelDescricao = imovelNome ?? imovelDito;
      if (!imovelDescricao) return pergunta(`Qual imóvel ${primeiroNome(lead.nome)} comprou?`);

      // A venda é de quem trabalha o lead. Lead sem dono: de quem pede.
      const participanteId = lead.corretorId ?? ctx.corretorId;
      const outro = participanteId !== ctx.corretorId ? await nomeDoDono(supabase, ctx.grupoId, participanteId) : null;
      const comissao = await comissaoDeReferencia(supabase, { grupoId: ctx.grupoId, imovelId, corretorId: participanteId });
      if (!comissao) {
        return recusa(
          "Ainda não há venda com comissão para eu usar de referência. Registre esta pelo painel, em Financeiro → Registrar venda, onde a comissão é informada.",
        );
      }
      const repasse = (await ultimoRepasseNoGrupo(supabase, ctx.grupoId, participanteId)) ?? 0;
      const dataVenda = hojeEmSaoPaulo(agora());
      const comissaoValor = resolverPar(valor, { modo: "percentual", numero: comissao.percentual }).valor;

      const partes = [
        `Registrar venda: ${lead.nome}${outro ? ` (cliente de ${outro})` : ""}, ${imovelNome ?? `"${imovelDescricao}" (fora do catálogo)`}, ${reais(valor)}, hoje (${rotuloDoDia(dataVenda)}).`,
        `Comissão ${formatarPercentual(comissao.percentual)} = ${reais(comissaoValor)} (${deOndeVeioAComissao(comissao, imovelNome, outro)}; dá para corrigir no painel).`,
      ];
      if (lead.etapa !== "fechado") partes.push(`${primeiroNome(lead.nome)} vai para Fechado.`);
      const dados: DadosDaVenda = {
        leadId: lead.id,
        nome: lead.nome,
        participanteId,
        imovelId,
        imovelDescricao,
        dataVenda,
        valorVenda: valor,
        comissaoPercentual: comissao.percentual,
        repassePercentual: repasse,
      };
      return { tipo: "proposta", resumo: partes.join(" "), dados };
    },

    async executar(ctx, dados) {
      const v = dadosDaVenda(dados);
      if (!v) return { ok: false, texto: "Não consegui registrar a venda: faltou algum dado." };
      // A regra da tela: o corretor só registra venda da qual participa.
      if (ctx.papel !== "gestor" && v.participanteId !== ctx.corretorId) return { ok: false, texto: "Você só registra venda da qual participa." };

      const supabase = banco();
      const r = await registrarVendaPeloCentral(supabase, {
        grupoId: ctx.grupoId,
        registradorId: ctx.corretorId,
        soDoCorretor: soDoCorretor(ctx),
        venda: { ...v },
      });
      if (r.desfecho === "nao_achou") return { ok: false, texto: `Não achei mais ${v.nome} na sua carteira; a venda não foi registrada.` };
      if (r.desfecho === "ja_existe") return { ok: false, texto: `${v.nome} já tem venda registrada (${reais(r.valorVenda)}, ${rotuloDoDia(r.dataVenda)}); não registrei outra.` };
      if (r.desfecho === "recusado") return { ok: false, texto: `Não registrei a venda: ${r.motivo}` };
      if (r.desfecho === "falhou") return { ok: false, texto: `Não consegui registrar a venda de ${v.nome} agora.` };

      // O funil e a venda não podem contar histórias diferentes (o mesmo da
      // tela): venda nova leva o lead para Fechado.
      let registroDaEtapa: RegistroDaAtualizacao | null = null;
      let aviso = "";
      try {
        const f = await atualizarFichaPeloCentral(supabase, {
          grupoId: ctx.grupoId,
          leadId: v.leadId,
          autorId: ctx.corretorId,
          soDoCorretor: soDoCorretor(ctx),
          mudancas: { etapa: "fechado" },
          anotacao: null,
        });
        if (f.desfecho === "atualizado") registroDaEtapa = f.registro;
        if (f.desfecho === "nao_achou") aviso = ` ${primeiroNome(v.nome)} não foi para Fechado; mova pela ficha.`;
      } catch {
        aviso = ` ${primeiroNome(v.nome)} não foi para Fechado; mova pela ficha.`;
      }
      return {
        ok: true,
        texto: `Venda registrada no Financeiro: ${v.nome}, ${reais(v.valorVenda)}, comissão ${reais(r.comissaoValor)}.${registroDaEtapa ? ` ${primeiroNome(v.nome)} foi para Fechado.` : ""}${aviso}`,
        desfazer: { vendaId: r.vendaId, atualizadoEm: r.atualizadoEm, nome: v.nome, registroDaEtapa },
      };
    },

    async desfazer(ctx, d) {
      const vendaId = texto(d.vendaId, 64);
      const atualizadoEm = texto(d.atualizadoEm, 64);
      const nome = texto(d.nome, 120) ?? "o cliente";
      if (!vendaId || !atualizadoEm) return { ok: false, texto: "Não sei qual venda desfazer." };
      const supabase = banco();
      const r = await desfazerVendaPeloCentral(supabase, { grupoId: ctx.grupoId, registradorId: ctx.corretorId, vendaId, atualizadoEm });
      if (r.desfecho === "recusado") return { ok: false, texto: `Não desfiz a venda de ${nome}: ${r.motivo}` };
      if (r.desfecho === "mudou") {
        return {
          ok: false,
          texto: `Não desfiz a venda de ${nome}: ela mudou depois (no painel, no Caixa ou no fiscal). Se precisar, exclua em Financeiro no painel.`,
        };
      }

      let etapa = "";
      const registro = d.registroDaEtapa as RegistroDaAtualizacao | null | undefined;
      if (registro && typeof registro.leadId === "string") {
        const e = await desfazerAtualizacaoPeloCentral(supabase, {
          grupoId: ctx.grupoId,
          autorId: ctx.corretorId,
          soDoCorretor: soDoCorretor(ctx),
          registro: {
            leadId: registro.leadId,
            antes: registro.antes ?? {},
            depois: registro.depois ?? {},
            etapaAlteradaEmAntes: registro.etapaAlteradaEmAntes ?? null,
            marcasAcrescentadas: [],
            notaId: null,
          },
        });
        if (e.desfecho === "desfeito" && e.voltaram.etapa) etapa = ` ${primeiroNome(nome)} voltou para ${ETAPA_LABEL[e.voltaram.etapa as EtapaFunil] ?? e.voltaram.etapa}.`;
        else etapa = ` A etapa de ${primeiroNome(nome)} mudou depois e ficou como está.`;
      }
      return { ok: true, texto: `Desfeito: a venda de ${nome} saiu do Financeiro.${etapa}` };
    },
  };

  const lancar_no_caixa: Acao = {
    async preparar(ctx, a) {
      if (ctx.papel !== "gestor") return recusa(SO_GESTOR);
      const tipo = TIPO_DO_PEDIDO[String(a.tipo ?? "").toLowerCase()];
      if (!tipo) return pergunta("É despesa ou receita?");
      const valor = lerValorEmReais(a.valor);
      if (valor === null) return pergunta("Qual o valor? (ex.: 1.200)");
      const descricao = texto(a.descricao, 200);
      if (!descricao) return pergunta(`${tipo === "saida" ? "Despesa" : "Receita"} de quê? (ex.: aluguel)`);
      const hoje = hojeEmSaoPaulo(agora());
      const dia = lerDiaDoCaixa(a.quando, hoje);
      if (!dia) return pergunta("Qual o dia? (ex.: hoje, ontem, dia 10, 05/11)");

      const categoria = categoriaDoLancamento(tipo, descricao);
      // Dia de hoje ou passado: o dinheiro já saiu (ou entrou). Dia futuro: conta a pagar (ou a receber).
      const pagoEm = dia <= hoje ? dia : null;
      const quando = pagoEm
        ? `${tipo === "saida" ? "paga" : "recebida"} ${dia === hoje ? "hoje" : "em"} ${rotuloDoDia(dia)}`
        : `a ${tipo === "saida" ? "pagar" : "receber"} em ${rotuloDoDia(dia)}`;
      return {
        tipo: "proposta",
        resumo: `Lançar no caixa ${tipo === "saida" ? "despesa" : "receita"} de ${reais(valor)}: "${descricao}" (${ROTULO_CATEGORIA[categoria]}), ${quando}.`,
        dados: { tipo, categoria, descricao, valor, vencimento: dia, pagoEm },
      };
    },

    async executar(ctx, d) {
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const tipo = d.tipo === "entrada" || d.tipo === "saida" ? d.tipo : null;
      const categoria = (CATEGORIAS as readonly string[]).includes(String(d.categoria)) ? (d.categoria as Categoria) : null;
      const descricao = texto(d.descricao, 200);
      const valor = typeof d.valor === "number" ? d.valor : null;
      const vencimento = texto(d.vencimento, 10);
      const pagoEm = texto(d.pagoEm, 10);
      if (!tipo || !categoria || !descricao || valor === null || !vencimento) return { ok: false, texto: "Não consegui lançar: faltou algum dado." };
      const r = await lancarNoCaixaPeloCentral(banco(), {
        grupoId: ctx.grupoId,
        gestorId: ctx.corretorId,
        lancamento: { tipo, categoria, descricao, valor, vencimento, pagoEm },
      });
      if (r.desfecho === "recusado") return { ok: false, texto: `Não lancei: ${r.motivo}` };
      if (r.desfecho === "falhou") return { ok: false, texto: "Não consegui lançar no caixa agora." };
      return {
        ok: true,
        texto: `Lançado no caixa: ${tipo === "saida" ? "despesa" : "receita"} de ${reais(valor)}, "${descricao}".`,
        desfazer: { lancamentoId: r.lancamentoId, atualizadoEm: r.atualizadoEm, descricao },
      };
    },

    async desfazer(ctx, d) {
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const lancamentoId = texto(d.lancamentoId, 64);
      const atualizadoEm = texto(d.atualizadoEm, 64);
      const descricao = texto(d.descricao, 200) ?? "o lançamento";
      if (!lancamentoId || !atualizadoEm) return { ok: false, texto: "Não sei qual lançamento desfazer." };
      const r = await desfazerLancamentoPeloCentral(banco(), { grupoId: ctx.grupoId, lancamentoId, atualizadoEm });
      if (r.desfecho === "recusado") return { ok: false, texto: `Não desfiz "${descricao}": ${r.motivo}` };
      if (r.desfecho === "mudou") return { ok: false, texto: `Não desfiz "${descricao}": o lançamento mudou ou já saiu do caixa.` };
      return { ok: true, texto: `Desfeito: "${descricao}" saiu do caixa.` };
    },
  };

  const informar_gasto_de_anuncio: Acao = {
    async preparar(ctx, a) {
      const pedido = texto(a.campanha, 120);
      if (!pedido) return pergunta("De qual anúncio?");
      const valor = lerValorEmReais(a.valor);
      if (valor === null) return pergunta("Quanto foi gasto no total até hoje? (ex.: 300)");
      if (valor > 1_000_000) return recusa("Valor alto demais para um anúncio. Confira os zeros.");

      const campanhas = await campanhasDoGrupo(banco(), { grupoId: ctx.grupoId, soDoCorretor: soDoCorretor(ctx) });
      if (campanhas.length === 0) return resposta({ mensagem: "Não há anúncio seu em Anúncios pagos ainda. Cadastre a campanha no painel." });
      const achadas = escolherCampanha(pedido, campanhas);
      const comoOpcao = (c: CampanhaDoGrupo) => `${c.nome}${c.imovel && c.imovel !== c.nome ? ` (${c.imovel})` : ""}${c.valorGasto === null ? ", sem gasto" : `, ${reais(c.valorGasto)}`}`;
      if (achadas.length === 0) return pergunta(`Não achei o anúncio "${pedido}". Qual destes?`, campanhas.slice(0, 5).map(comoOpcao));
      if (achadas.length > 1) return pergunta("Qual anúncio?", achadas.slice(0, 5).map(comoOpcao));

      const c = achadas[0];
      const dono = c.donoId !== ctx.corretorId ? await nomeDoDono(banco(), ctx.grupoId, c.donoId) : null;
      const antes = c.valorGasto === null ? " (estava sem valor)" : ` (antes ${reais(c.valorGasto)})`;
      // O valor é o TOTAL até hoje (0133). Menor que o anterior costuma ser o
      // gasto de um dia só: o resumo avisa antes do "sim".
      const menor = c.valorGasto !== null && valor < c.valorGasto ? " Atenção: é menos que o total anterior; se foi só o gasto de agora, diga o total." : "";
      return {
        tipo: "proposta",
        resumo: `Anúncio "${c.nome}"${dono ? ` (de ${dono})` : ""}: gasto total até hoje ${reais(valor)}${antes}.${menor}`,
        dados: { impulsionamentoId: c.id, nome: c.nome, valor, dia: hojeEmSaoPaulo(agora()) },
      };
    },

    async executar(ctx, d) {
      const impulsionamentoId = texto(d.impulsionamentoId, 64);
      const nome = texto(d.nome, 200) ?? "o anúncio";
      const dia = texto(d.dia, 10);
      const valor = typeof d.valor === "number" ? d.valor : null;
      if (!impulsionamentoId || !dia || valor === null) return { ok: false, texto: "Não consegui salvar o gasto: faltou algum dado." };
      const r = await informarGastoPeloCentral(banco(), { grupoId: ctx.grupoId, soDoCorretor: soDoCorretor(ctx), impulsionamentoId, dia, valor });
      if (r.desfecho === "nao_achou") return { ok: false, texto: `Não achei mais "${nome}" nos seus anúncios.` };
      if (r.desfecho === "falhou") return { ok: false, texto: `Não consegui salvar o gasto de "${nome}" agora.` };
      const total = r.total === valor ? "" : ` O total continua ${reais(r.total)}, o do registro mais recente.`;
      return {
        ok: true,
        texto: `Gasto de "${nome}" salvo: ${reais(valor)} até ${rotuloDoDia(dia)}. O custo por cliente já foi recalculado.${total}`,
        desfazer: { nome, registro: r.registro },
      };
    },

    async desfazer(ctx, d) {
      const nome = texto(d.nome, 200) ?? "o anúncio";
      const registro = d.registro as RegistroDoGasto | undefined;
      if (!registro || typeof registro.impulsionamentoId !== "string" || typeof registro.dia !== "string" || typeof registro.valor !== "number") {
        return { ok: false, texto: "Não sei qual gasto desfazer." };
      }
      const r = await desfazerGastoPeloCentral(banco(), {
        grupoId: ctx.grupoId,
        soDoCorretor: soDoCorretor(ctx),
        registro: {
          impulsionamentoId: registro.impulsionamentoId,
          dia: registro.dia,
          valor: registro.valor,
          pontoAntes: typeof registro.pontoAntes === "number" ? registro.pontoAntes : null,
          valorGastoAntes: typeof registro.valorGastoAntes === "number" ? registro.valorGastoAntes : null,
          gastoInformadoEmAntes: typeof registro.gastoInformadoEmAntes === "string" ? registro.gastoInformadoEmAntes : null,
        },
      });
      if (r.desfecho === "mudou") return { ok: false, texto: `Não desfiz o gasto de "${nome}": ele foi corrigido depois.` };
      return { ok: true, texto: `Desfeito: o gasto de "${nome}" voltou a ${r.total === null ? "ficar sem valor" : reais(r.total)}.` };
    },
  };

  /** Avisa a dona e o destino pelo central; quem pediu não recebe aviso de si mesmo. */
  async function avisarOsDois(ctx: ContextoDoCentral, avisos: { id: string; texto: (nome: string) => string }[]): Promise<string[]> {
    const semAviso: string[] = [];
    for (const a of avisos) {
      if (a.id === ctx.corretorId) continue;
      const r = await avisar(a.id, a.texto).catch(() => ({ enviado: false }));
      if (!r.enviado) semAviso.push(a.id);
    }
    return semAviso;
  }

  const redistribuir_leads: Acao = {
    async preparar(ctx, a) {
      if (ctx.papel !== "gestor") return recusa(SO_GESTOR);
      const deDito = texto(a.de, 80);
      const paraDito = texto(a.para, 80);
      if (!deDito) return pergunta("Os leads de quem?");
      if (!paraDito) return pergunta("Para quem passo os leads?");

      const supabase = banco();
      const equipe = await equipeDoGrupo(supabase, ctx.grupoId);
      const de = escolherCorretor(deDito, equipe, { euId: ctx.corretorId, soAtivos: false });
      if (de.tipo === "varios") return pergunta(`Os leads de qual ${deDito}?`, de.opcoes.map((o) => o.nome));
      if (de.tipo === "nenhum") return recusa(`Não achei "${deDito}" na sua equipe.`);
      const para = escolherCorretor(paraDito, equipe, { euId: ctx.corretorId, soAtivos: true });
      if (para.tipo === "varios") return pergunta(`Para qual ${paraDito}?`, para.opcoes.map((o) => o.nome));
      if (para.tipo === "nenhum") {
        const inativo = escolherCorretor(paraDito, equipe.filter((c) => !c.ativo), { euId: ctx.corretorId, soAtivos: false });
        return recusa(
          inativo.tipo === "um" ? `${inativo.lead.nome} está desativado: reative antes de passar leads para ele.` : `Não achei "${paraDito}" na sua equipe.`,
        );
      }
      if (de.lead.id === para.lead.id) return recusa("Origem e destino são o mesmo corretor.");

      const criterio = lerCriterio(a.quais);
      if (!criterio) {
        // Sem recorte não se adivinha: "todos" de quem está ativo mexe na
        // carteira inteira. Pergunta com os números na mão.
        const base = { grupoId: ctx.grupoId, deId: de.lead.id, agora: agora() };
        const [parados, todos] = await Promise.all([
          leadsParaRedistribuir(supabase, { ...base, criterio: { tipo: "parados", dias: DIAS_PARADO_DO_PAINEL } }),
          leadsParaRedistribuir(supabase, { ...base, criterio: { tipo: "em_andamento" } }),
        ]);
        const conta = (r: { ids: string[]; sobrou: boolean }) => `${r.ids.length}${r.sobrou ? "+" : ""}`;
        return pergunta(
          `${de.lead.nome} tem ${conta(todos)} leads em andamento, ${conta(parados)} deles parados há ${DIAS_PARADO_DO_PAINEL}+ dias. Passo para ${para.lead.nome} só os parados ou todos os em andamento?`,
        );
      }

      const { ids, sobrou } = await leadsParaRedistribuir(supabase, { grupoId: ctx.grupoId, deId: de.lead.id, criterio, agora: agora() });
      const descricao = descreverCriterio(criterio);
      if (ids.length === 0) return resposta({ mensagem: `${de.lead.nome} não tem leads ${descricao}. Nada a passar.` });

      const avisados = [de.lead, para.lead].filter((c) => c.id !== ctx.corretorId).map((c) => primeiroNome(c.nome));
      const resto = sobrou ? ` (os ${TETO_DA_REDISTRIBUICAO} mais antigos; o resto num próximo pedido)` : "";
      return {
        tipo: "proposta",
        resumo: `Passar ${leads(ids.length)} ${descricao} de ${de.lead.nome} para ${para.lead.nome}${resto}.${avisados.length ? ` O central avisa ${avisados.join(" e ")}.` : ""}`,
        dados: { deId: de.lead.id, deNome: de.lead.nome, paraId: para.lead.id, paraNome: para.lead.nome, criterio, leadIds: ids },
      };
    },

    async executar(ctx, d) {
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const deId = texto(d.deId, 64);
      const paraId = texto(d.paraId, 64);
      const criterio = criterioDosDados(d.criterio);
      const leadIds = Array.isArray(d.leadIds) ? d.leadIds.filter((id): id is string => typeof id === "string") : [];
      if (!deId || !paraId || !criterio || leadIds.length === 0) return { ok: false, texto: "Não consegui passar os leads: faltou algum dado." };

      const r = await redistribuirLeadsPeloCentral(banco(), { grupoId: ctx.grupoId, atorId: ctx.corretorId, deId, paraId, leadIds });
      if (r.desfecho === "recusado") return { ok: false, texto: `Não passei os leads: ${r.motivo}` };
      if (r.desfecho === "nenhum") return { ok: false, texto: "Nenhum daqueles leads está mais com a mesma pessoa; nada foi passado." };

      const n = r.movidos.length;
      const descricao = descreverCriterio(criterio);
      const semAviso = await avisarOsDois(ctx, [
        {
          id: paraId,
          texto: (nome) => `${primeiroNome(nome)}, ${ctx.nome} passou para você ${leads(n)} ${descricao} que eram de ${r.deNome}. Já estão na sua carteira no painel.`,
        },
        { id: deId, texto: (nome) => `${primeiroNome(nome)}, ${ctx.nome} passou ${leads(n)} ${descricao} da sua carteira para ${r.paraNome}.` },
      ]);
      const nomeDe = (id: string) => primeiroNome(id === deId ? r.deNome : r.paraNome);
      const aviso = semAviso.length ? ` Não consegui avisar ${semAviso.map(nomeDe).join(" e ")} pelo central.` : "";
      return {
        ok: true,
        texto: `${leads(n)} ${n === 1 ? "passou" : "passaram"} de ${r.deNome} para ${r.paraNome}.${aviso}`,
        desfazer: { deId, paraId, descricao, movidos: r.movidos },
      };
    },

    async desfazer(ctx, d) {
      if (ctx.papel !== "gestor") return { ok: false, texto: SO_GESTOR };
      const deId = texto(d.deId, 64);
      const paraId = texto(d.paraId, 64);
      const movidos = movidosDosDados(d.movidos);
      const descricao = texto(d.descricao, 60) ?? "";
      if (!deId || !paraId || movidos.length === 0) return { ok: false, texto: "Não sei qual redistribuição desfazer." };

      const r = await devolverLeadsPeloCentral(banco(), { grupoId: ctx.grupoId, atorId: ctx.corretorId, deId, paraId, movidos });
      if (r.desfecho === "recusado") return { ok: false, texto: `Não desfiz: ${r.motivo}` };
      if (r.quantos === 0) return { ok: false, texto: `Não desfiz: nenhum daqueles leads está mais com ${r.paraNome}.` };

      const lista = `${leads(r.quantos)}${descricao ? ` ${descricao}` : ""} ${r.quantos === 1 ? "voltou" : "voltaram"}`;
      await avisarOsDois(ctx, [
        { id: deId, texto: (nome) => `${primeiroNome(nome)}, ${ctx.nome} desfez a passagem: ${lista} para a sua carteira.` },
        { id: paraId, texto: (nome) => `${primeiroNome(nome)}, ${ctx.nome} desfez a passagem: ${lista} para ${r.deNome}.` },
      ]);
      const ficaram = r.ficaram ? ` ${leads(r.ficaram)} já ${r.ficaram === 1 ? "tinha mudado" : "tinham mudado"} de mão e ${r.ficaram === 1 ? "ficou" : "ficaram"}.` : "";
      return { ok: true, texto: `Desfeito: ${leads(r.quantos)} ${r.quantos === 1 ? "voltou" : "voltaram"} de ${r.paraNome} para ${r.deNome}.${ficaram}` };
    },
  };

  return { registrar_venda, lancar_no_caixa, informar_gasto_de_anuncio, redistribuir_leads };
}

export const CONSULTAS_FINANCEIRO: Record<string, Consulta> = {};
export const ACOES_FINANCEIRO: Record<string, Acao> = criarAcoesDoFinanceiro();
