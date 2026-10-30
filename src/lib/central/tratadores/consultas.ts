import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { lerDocumentacaoDoLead } from "@/lib/crm/documentacaoDados";
import { FASE_DOCUMENTO_LABEL, FASES_DOCUMENTO } from "@/lib/crm/documentacao";
import { montarFilaDeTrabalho, type ItemFila } from "@/lib/crm/filaDeTrabalho";
import { diaEmSP, horarioEmSP } from "@/lib/crm/resumoDoDia";
import type { Tarefa } from "@/lib/crm/timeline";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { ETAPA_LABEL, ETAPAS_DO_CAMINHO, type EtapaFunil } from "@/lib/types";
import type { Acao, Consulta, ContextoDoCentral } from "../executar";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente A — consultas da onda 1: consultar_lead (4), quem_ligar_hoje (7).
 *
 * Consulta só LÊ e devolve um objeto curto; quem escreve a resposta em
 * português é o cérebro. Por isso o objeto leva rótulos prontos ("amanhã
 * 10:00", "Visita marcada"), nunca ISO nem chave de banco: o modelo erra
 * fuso e inventa rótulo quando tem de converter.
 *
 * O escopo vem da identificação (`ctx`), nunca dos argumentos: corretor vê
 * os leads dele, gestor o grupo. Texto escrito pelo cliente não entra (só
 * QUEM falou por último e quando): ele é dado, e um "apague tudo" dentro de
 * uma conversa não pode chegar ao cérebro como se fosse pedido.
 */

type Supa = ReturnType<typeof createServiceClient>;

const FUSO = "America/Sao_Paulo";
const diaDaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "hoje 14:30", "ontem 09:10", "amanhã 10:00" ou "sex 31/10 10:00", no fuso de SP. */
export function quandoEmSP(iso: string, agora: Date): string {
  const data = new Date(iso);
  const dia = diaEmSP(data);
  const hora = horarioEmSP(iso);
  const deslocado = (dias: number) => diaEmSP(new Date(agora.getTime() + dias * 86_400_000));
  if (dia === deslocado(0)) return `hoje ${hora}`;
  if (dia === deslocado(-1)) return `ontem ${hora}`;
  if (dia === deslocado(1)) return `amanhã ${hora}`;
  return `${rotuloDoDia(data, agora)} ${hora}`;
}

/** "sex 31/10" (com o ano só quando não é o corrente). */
function rotuloDoDia(data: Date, agora: Date = data): string {
  const [ano, mes, dia] = diaEmSP(data).split("-");
  const semana = diaDaSemana.format(data).replace(".", "");
  return `${semana} ${dia}/${mes}${ano !== diaEmSP(agora).slice(0, 4) ? `/${ano}` : ""}`;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Corta texto livre (dossiê, título): o objeto volta inteiro ao modelo e cada caractere é custo. */
function curto(texto: unknown, teto: number): string | null {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > teto ? `${t.slice(0, teto - 1).trimEnd()}…` : t;
}

/**
 * "Novo" em vez do rótulo da coluna do funil ("Leads"): aqui se fala de UM
 * cliente, e "o João está em Leads" não diz nada.
 */
function rotuloDaEtapa(etapa: string): string {
  if (etapa === "novo") return "Novo";
  return ETAPA_LABEL[etapa as EtapaFunil] ?? etapa;
}

/** Tira as chaves vazias: "renda: null" seis vezes ensina o modelo a falar do que não existe. */
function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

const QUEM_FALOU: Record<string, string> = { cliente: "o cliente", corretor: "você", bot: "a IA" };

// ── consultar_lead (capacidade 4) ────────────────────────────────────────

/**
 * "Como está o João?": ficha, leitura da IA, última conversa, próxima visita
 * e o que falta (documentos e retornos combinados).
 *
 * Mesmas permissões do painel, conferidas aqui porque a chave de serviço não
 * tem RLS:
 * - a CONVERSA só aparece para o dono dela (0134: o gestor não lê conversa
 *   de outro corretor, nem quando e quem falou). Por isso este arquivo não
 *   usa `lerResumoDoLead`, que lê a conversa só pelo lead e confia na RLS;
 * - o lembrete de anotação é de quem o recebe;
 * - ficha, dossiê da IA, visitas, tarefas e documentos o gestor vê (0134
 *   mantém com ele).
 */
export async function consultarLead(
  ctx: ContextoDoCentral,
  argumentos: Record<string, unknown>,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  const pedido = String(argumentos.lead ?? "").trim();
  const resolucao = await resolverLead(ctx, pedido, supabase);
  if (resolucao.tipo !== "um") return respostaDeLeadIncerto(resolucao, pedido);
  const leadId = resolucao.lead.id;

  // De novo pelo escopo, e não só pelo id: a ficha é a porta para o resto.
  let consultaFicha = supabase
    .from("leads")
    .select(
      "id, nome, telefone, etapa, corretor_id, regiao_interesse, renda_mensal, orcamento_min, orcamento_max, dormitorios_min, visita_agendada_em, nao_contatar_em, conversa:empreendimentos!leads_imovel_interesse_id_fkey(nome), origem:empreendimentos!leads_empreendimento_id_fkey(nome)",
    )
    .eq("grupo_id", ctx.grupoId)
    .eq("id", leadId)
    .is("arquivado_em", null);
  if (ctx.papel !== "gestor") consultaFicha = consultaFicha.eq("corretor_id", ctx.corretorId);
  const { data: ficha } = await consultaFicha.maybeSingle();
  if (!ficha) return respostaDeLeadIncerto({ tipo: "nenhum" }, pedido);

  const doDono = ficha.corretor_id === ctx.corretorId;
  let consultaTarefas = supabase
    .from("lead_tarefas")
    .select("titulo, prazo")
    .eq("grupo_id", ctx.grupoId)
    .eq("lead_id", leadId)
    .is("concluida_em", null)
    .order("prazo", { ascending: true })
    .limit(3);
  if (ctx.papel !== "gestor") consultaTarefas = consultaTarefas.eq("corretor_id", ctx.corretorId);

  const [{ data: dossie }, { data: visita }, { data: conversa }, { data: tarefas }, { data: lembretes }, { data: dono }, documentacao] =
    await Promise.all([
      supabase
        .from("lead_observacoes_ia")
        .select("perfil_familiar, urgencia_mudanca, objecoes_identificadas, resumo_executivo, proximo_passo_sugerido, temperatura_label, orcamento_min, orcamento_max")
        .eq("grupo_id", ctx.grupoId)
        .eq("lead_id", leadId)
        .maybeSingle(),
      supabase
        .from("visitas")
        .select("inicio")
        .eq("grupo_id", ctx.grupoId)
        .eq("lead_id", leadId)
        .eq("status", "marcada")
        .gte("inicio", agora.toISOString())
        .order("inicio", { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Só a conversa DESTE corretor com o lead (0134). Do gestor olhando
      // lead alheio, nenhuma: nem a data.
      supabase
        .from("whatsapp_conversas")
        .select("id, ultima_interacao_em")
        .eq("grupo_id", ctx.grupoId)
        .eq("lead_id", leadId)
        .eq("corretor_id", ctx.corretorId)
        .order("ultima_interacao_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      consultaTarefas,
      supabase
        .from("anotacoes")
        .select("texto, lembrete_em")
        .eq("grupo_id", ctx.grupoId)
        .eq("lead_id", leadId)
        .eq("destinatario_id", ctx.corretorId)
        .is("concluida_em", null)
        .not("lembrete_em", "is", null)
        .order("lembrete_em", { ascending: true })
        .limit(3),
      doDono || !ficha.corretor_id
        ? Promise.resolve({ data: null })
        : supabase.from("corretores").select("nome").eq("grupo_id", ctx.grupoId).eq("id", ficha.corretor_id).maybeSingle(),
      // Documento faltando é "o que falta" por excelência; se a leitura
      // falhar, o resto da resposta continua.
      lerDocumentacaoDoLead(supabase, leadId).catch(() => null),
    ]);

  // Quem falou por último: só remetente e hora. O texto da mensagem não sai daqui.
  const { data: ultima } = conversa
    ? await supabase
        .from("whatsapp_mensagens")
        .select("remetente, created_at")
        .eq("grupo_id", ctx.grupoId)
        .eq("conversa_id", conversa.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const umSo = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string } | null;
  // O imóvel de que a conversa trata vence o de origem (a régua de `lerResumoDoLead`).
  const imovel = umSo(ficha.conversa)?.nome ?? umSo(ficha.origem)?.nome ?? null;
  // A ficha manda; o dossiê só preenche o vazio (a mesma régua do resumo da ficha).
  const orcMin = numero(ficha.orcamento_min) ?? numero(dossie?.orcamento_min);
  const orcMax = numero(ficha.orcamento_max) ?? numero(dossie?.orcamento_max);
  const orcamento =
    orcMin || orcMax ? [orcMin, orcMax].filter((v): v is number => v !== null).map((v) => moeda.format(v)).join(" a ") : null;
  const renda = numero(ficha.renda_mensal);

  // A linha de `visitas` (0224) é a agenda; a coluna do lead fica de reserva.
  const visitaFicha = ficha.visita_agendada_em && new Date(ficha.visita_agendada_em) >= agora ? ficha.visita_agendada_em : null;
  const proximaVisita = visita?.inicio ?? visitaFicha;

  const objecoes = Array.isArray(dossie?.objecoes_identificadas)
    ? (dossie.objecoes_identificadas as unknown[]).map((o) => curto(o, 80)).filter((o): o is string => Boolean(o)).slice(0, 3)
    : [];

  const documentos = documentacao
    ? FASES_DOCUMENTO.map((fase) => documentacao.fases[fase])
        .filter((f) => f.itens.length > 0)
        .map((f) =>
          semVazios({
            fase: FASE_DOCUMENTO_LABEL[f.fase],
            faltam: f.resumo.pendentesDoCliente.slice(0, 8),
            aConferir: f.resumo.aConferir || null,
            completa: f.resumo.completa || null,
          }),
        )
    : [];

  const retornos = [
    ...(tarefas ?? []).map((t) => ({ oQue: curto(t.titulo, 80), quando: quandoEmSP(t.prazo, agora) })),
    ...(lembretes ?? []).map((n) => ({ oQue: curto(n.texto, 80), quando: quandoEmSP(n.lembrete_em!, agora) })),
  ];

  return semVazios({
    cliente: nomeParaExibir(ficha),
    telefone: ficha.telefone,
    dono: dono?.nome ?? null,
    etapa: rotuloDaEtapa(ficha.etapa),
    naoQuerContato: ficha.nao_contatar_em ? "o cliente pediu para não ser procurado" : null,
    interesse: semVazios({
      imovel,
      regiao: curto(ficha.regiao_interesse, 80),
      dormitorios: numero(ficha.dormitorios_min),
      renda: renda ? `${moeda.format(renda)}/mês` : null,
      orcamento,
    }),
    temperatura: dossie?.temperatura_label ?? null,
    leituraDaIa: dossie
      ? semVazios({
          perfil: curto([dossie.perfil_familiar, dossie.urgencia_mudanca].filter(Boolean).join(" · "), 120),
          resumo: curto(dossie.resumo_executivo, 280),
          objecoes,
          proximoPasso: curto(dossie.proximo_passo_sugerido, 160),
        })
      : null,
    ultimaConversa: !doDono
      ? "a conversa é só do corretor dono do cliente"
      : conversa?.ultima_interacao_em
        ? semVazios({
            quando: quandoEmSP(ultima?.created_at ?? conversa.ultima_interacao_em, agora),
            quemFalouPorUltimo: ultima ? (QUEM_FALOU[ultima.remetente] ?? null) : null,
          })
        : "nenhuma conversa pelo WhatsApp",
    proximaVisita: proximaVisita ? quandoEmSP(proximaVisita, agora) : "nenhuma marcada",
    falta: semVazios({ documentos, retornos }),
  });
}

// ── quem_ligar_hoje (capacidade 7) ───────────────────────────────────────

/** Até quantos itens a lista do dia leva: a fila do Início (6) mais os quentes. */
export const TETO_DA_LISTA_DO_DIA = 8;
/** Quantos leads quentes entram além da fila. */
const QUENTES = 2;
/**
 * Lead quente pesa como lead novo na régua da fila (`PESO`): o momento
 * esfria em horas, mas nada está atrasado ainda. Fica depois de quem espera
 * resposta, da visita de hoje e do que já venceu.
 */
const PESO_DO_QUENTE = 4;

/** Etapas em que ainda se liga para o cliente: o caminho sem o fechado. */
const ETAPAS_ABERTAS = ETAPAS_DO_CAMINHO.filter((e) => e !== "fechado");

/**
 * Itens da fila que só fazem sentido no painel (avaliar resposta da IA com
 * 👍/👎): ninguém liga para isso, e eles tomariam uma vaga da lista.
 */
const SO_NO_PAINEL = new Set<ItemFila["tipo"]>(["sem_revisao"]);

type ItemDoDia = { tipo: string; titulo: string; detalhe: string; peso: number; leadId?: string };

/**
 * "Quem eu ligo hoje?": a fila do Início (`montarFilaDeTrabalho`, a mesma
 * ordem do custo de perder) mais os leads que a IA leu como quentes.
 *
 * É a lista de QUEM PERGUNTA, também do gestor: a fila é o trabalho de quem
 * abre o painel (hotfix de 19/10/2026), e a equipe é relatório, não lista
 * de ligação. "Hoje" é o dia de São Paulo (a fila já conta assim).
 */
export async function quemLigarHoje(
  ctx: ContextoDoCentral,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  const tarefas = await tarefasAbertas(ctx, supabase);
  const [fila, quentes] = await Promise.all([
    montarFilaDeTrabalho(supabase, tarefas, agora, ctx.corretorId, { grupoId: ctx.grupoId }),
    leadsQuentes(ctx, supabase),
  ]);

  const daFila: ItemDoDia[] = fila
    .filter((i) => !SO_NO_PAINEL.has(i.tipo))
    .map((i) => ({ tipo: i.tipo, titulo: i.titulo, detalhe: i.detalhe, peso: i.peso, leadId: leadDoLink(i.href) }));
  const jaNaLista = new Set(daFila.map((i) => i.leadId).filter(Boolean));
  const novosQuentes = quentes.filter((q) => !jaNaLista.has(q.leadId)).slice(0, QUENTES);

  // `sort` é estável: dentro do mesmo peso fica a ordem da fila, e o quente
  // entra depois dos itens da fila com o mesmo peso.
  const itens = [...daFila, ...novosQuentes].sort((a, b) => a.peso - b.peso).slice(0, TETO_DA_LISTA_DO_DIA);

  return {
    hoje: rotuloDoDia(agora),
    itens: itens.map((i) => ({ tipo: i.tipo, titulo: curto(i.titulo, 100), detalhe: curto(i.detalhe, 140) })),
    ...(itens.length === 0 ? { vazio: "Nada pendente para hoje." } : {}),
  };
}

/** O id do lead no link da fila (`/corretor/leads/<id>`), para não repetir o cliente. */
function leadDoLink(href: string): string | undefined {
  return /^\/corretor\/leads\/([^/?#]+)$/.exec(href)?.[1];
}

/**
 * As tarefas abertas do corretor, como `getMinhasTarefas` do painel, mas
 * pelo corretor identificado e com o grupo explícito (sem sessão, sem RLS).
 */
async function tarefasAbertas(ctx: ContextoDoCentral, supabase: Supa): Promise<Tarefa[]> {
  const { data } = await supabase
    .from("lead_tarefas")
    .select("id, titulo, prazo, concluida_em, lead:leads(id, nome)")
    .eq("grupo_id", ctx.grupoId)
    .eq("corretor_id", ctx.corretorId)
    .is("concluida_em", null)
    .order("prazo", { ascending: true })
    .limit(50);
  return ((data ?? []) as unknown as {
    id: string;
    titulo: string;
    prazo: string;
    concluida_em: string | null;
    lead: { id: string; nome: string } | null;
  }[]).map((t) => ({ id: t.id, titulo: t.titulo, prazo: t.prazo, concluidaEm: t.concluida_em, lead: t.lead ?? undefined }));
}

/**
 * Leads do corretor que o dossiê da IA (`lead_observacoes_ia`) lê como
 * quentes, ainda no caminho e sem pedido de não contato. Os mexidos por
 * último primeiro. A fila do Início não tem "quente"; a spec (3.2, item 7)
 * pede.
 */
async function leadsQuentes(ctx: ContextoDoCentral, supabase: Supa): Promise<ItemDoDia[]> {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, etapa, dossie:lead_observacoes_ia!inner(temperatura_label)")
    .eq("grupo_id", ctx.grupoId)
    .eq("corretor_id", ctx.corretorId)
    .is("arquivado_em", null)
    .is("nao_contatar_em", null)
    .in("etapa", ETAPAS_ABERTAS)
    .eq("dossie.temperatura_label", "quente")
    .order("etapa_alterada_em", { ascending: false })
    // Folga para os que já estão na fila e saem na troca.
    .limit(QUENTES + 6);
  return (data ?? []).map((l) => ({
    tipo: "lead_quente",
    titulo: `Ligar para ${nomeParaExibir(l)}`,
    detalhe: `A IA leu como quente · ${rotuloDaEtapa(l.etapa)}`,
    peso: PESO_DO_QUENTE,
    leadId: l.id,
  }));
}

export const CONSULTAS_CONSULTAS: Record<string, Consulta> = {
  consultar_lead: (ctx, argumentos) => consultarLead(ctx, argumentos),
  quem_ligar_hoje: (ctx) => quemLigarHoje(ctx),
};
export const ACOES_CONSULTAS: Record<string, Acao> = {};
