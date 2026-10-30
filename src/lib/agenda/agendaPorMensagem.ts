import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { agendaQueValeParaOLead, horariosDeVisitaSeguros } from "@/lib/crm/agendaDoCorretor";
import { registrarInteracao } from "@/lib/crm/interacoes";
import {
  agendarVisitaLead,
  apagarLembretesPendentesDeVisita,
  cancelarVisitaLead,
  registrarEtapaAutomatica,
} from "@/lib/whatsapp/repositorio";
import { partesEmSaoPaulo } from "./comandos/instante";
import { MENSAGEM_CONFLITO, ehConflitoDeHorario } from "./conflito";
import { rotuloDoInstante } from "./quandoEmTexto";

/**
 * Visitas pedidas por mensagem ao número central (onda 1, capacidade 6).
 *
 * A escrita é a de sempre: marcar e remarcar por `agendarVisitaLead` (a
 * reserva no banco confere a grade e a trava de 60 min), desmarcar por
 * `cancelarVisitaLead`. O que este arquivo acrescenta é a conferência de
 * quem pede, porque o central não tem sessão: o lead tem de ser do grupo de
 * quem foi identificado, não arquivado e, para o corretor, dele (o gestor
 * mexe em qualquer lead do grupo, como na agenda por WhatsApp). Toda leitura
 * filtra o grupo.
 *
 * E o desfazer (spec 4.6): a visita volta ao estado de antes do "sim", só se
 * ninguém mexeu nela depois.
 */

type Supa = ReturnType<typeof createServiceClient>;

export type EscopoDaAgenda = { grupoId: string; corretorId: string; ehGestor: boolean };

/** O que o desfazer precisa: a data no lead e a etapa (marcar leva a "visita agendada"). */
export type EstadoDaVisita = { visitaEm: string | null; etapa: string };

export type VisitaDoLead = EstadoDaVisita & { leadId: string; nome: string; donoId: string | null };

export type MudancaDeVisita = { ok: true; antes: EstadoDaVisita; depois: EstadoDaVisita } | { ok: false; erro: string };

const DURACAO_DA_VISITA_MS = 60 * 60_000;

const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const NAO_ACHEI = "Não achei esse cliente na sua carteira.";

/** Mesmo instante, qualquer que seja o formato em que veio ("…+00:00", "…Z"). */
export function mesmoInstante(a: string | null, b: string | null): boolean {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
}

/** Visita que ainda vai acontecer: a de ontem não se remarca nem se cancela. */
export function visitaFutura(v: { visitaEm: string | null }, agora: Date): boolean {
  return Boolean(v.visitaEm) && Date.parse(v.visitaEm!) > agora.getTime();
}

function estado(v: VisitaDoLead): EstadoDaVisita {
  return { visitaEm: v.visitaEm, etapa: v.etapa };
}

export async function lerVisitaDoLead(
  escopo: EscopoDaAgenda,
  leadId: string,
  supabase: Supa = createServiceClient(),
): Promise<VisitaDoLead | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, corretor_id, etapa, visita_agendada_em")
    .eq("id", leadId)
    .eq("grupo_id", escopo.grupoId)
    .is("arquivado_em", null)
    .maybeSingle();
  if (!data) return null;
  if (!escopo.ehGestor && data.corretor_id !== escopo.corretorId) return null;
  return { leadId: data.id, nome: data.nome, donoId: data.corretor_id, etapa: data.etapa, visitaEm: data.visita_agendada_em };
}

export type HorarioDaVisita = { livre: true } | { livre: false; motivo: string; livres: string[] };

/**
 * O horário cabe? A mesma conta da reserva do banco (`reservar_horario_visita`
 * e as travas da 0224/0226), só lendo: grade de quem FAZ a visita (sem grade,
 * qualquer hora), outra visita dele que cruze a hora, reunião ou bloqueio.
 * Serve para a proposta já nascer sabendo; a reserva confere de novo no "sim".
 * A visita do próprio lead não conta: remarcar move a mesma linha.
 */
export async function conferirHorarioDaVisita(
  escopo: EscopoDaAgenda,
  p: { leadId: string; quando: Date; agora: Date },
  supabase: Supa = createServiceClient(),
): Promise<HorarioDaVisita> {
  const quem = await agendaQueValeParaOLead(p.leadId, p.agora).catch(() => null);
  if (!quem) return { livre: true };
  const inicio = p.quando.toISOString();
  const fim = new Date(p.quando.getTime() + DURACAO_DA_VISITA_MS).toISOString();

  const [{ data: grade }, { data: visitas }, { data: compromissos }] = await Promise.all([
    supabase
      .from("corretor_disponibilidade")
      .select("dia_semana, hora_inicio, hora_fim")
      .eq("grupo_id", escopo.grupoId)
      .eq("corretor_id", quem),
    supabase
      .from("visitas")
      .select("id")
      .eq("grupo_id", escopo.grupoId)
      .eq("corretor_id", quem)
      .eq("status", "marcada")
      .neq("lead_id", p.leadId)
      .lt("inicio", fim)
      .gt("fim", inicio)
      .limit(1),
    supabase
      .from("compromisso_participantes")
      .select("compromisso_id")
      .eq("grupo_id", escopo.grupoId)
      .eq("corretor_id", quem)
      .eq("ativo", true)
      .lt("inicio", fim)
      .gt("fim", inicio)
      .limit(1),
  ]);

  const partes = partesEmSaoPaulo(p.quando);
  const faixas = grade ?? [];
  const foraDaGrade =
    faixas.length > 0 &&
    !faixas.some((f) => f.dia_semana === SEMANA[partes.semana] && partes.hora >= f.hora_inicio && partes.hora < f.hora_fim);
  const ocupado = (visitas ?? []).length > 0 || (compromissos ?? []).length > 0;
  if (!foraDaGrade && !ocupado) return { livre: true };

  // O gestor marca na agenda do dono do lead: o recado diz de quem é a agenda.
  const minha = quem === escopo.corretorId;
  const motivo = foraDaGrade
    ? minha
      ? "Esse horário está fora da sua grade de visitas."
      : "Esse horário está fora da grade de visitas de quem atende esse cliente."
    : minha
      ? MENSAGEM_CONFLITO
      : "Quem atende esse cliente já tem outro compromisso nesse horário.";
  const livres = (await horariosDeVisitaSeguros(quem, p.agora)).slice(0, 3).map((h) => h.rotulo);
  return { livre: false, motivo, livres };
}

/**
 * Marca ou remarca. `esperada` é a data que a pessoa viu na proposta: se a
 * visita mudou entre a proposta e o "sim" (o cliente remarcou pela conversa),
 * nada é gravado sobre o que ela não viu.
 */
export async function marcarVisitaPorMensagem(
  escopo: EscopoDaAgenda,
  p: { leadId: string; quando: Date; esperada: string | null; agora: Date },
  supabase: Supa = createServiceClient(),
): Promise<MudancaDeVisita> {
  const antes = await lerVisitaDoLead(escopo, p.leadId, supabase);
  if (!antes) return { ok: false, erro: NAO_ACHEI };
  if (!mesmoInstante(antes.visitaEm, p.esperada)) {
    return { ok: false, erro: `A visita de ${antes.nome} mudou desde o pedido. Peça de novo.` };
  }
  if (p.quando <= p.agora) return { ok: false, erro: "Esse horário já passou. Peça outro." };

  if (!(await agendarVisitaLead(p.leadId, p.quando, { por: "central", corretorId: escopo.corretorId }))) {
    // Os livres são da agenda de quem faz a visita: o gestor que pede pode não ser o dono (como em `canal.ts`).
    const dono = await agendaQueValeParaOLead(p.leadId, p.agora).catch(() => null);
    const livres = dono ? await horariosDeVisitaSeguros(dono, p.agora) : [];
    const sugestao = livres.slice(0, 3).map((h) => h.rotulo).join("; ");
    return {
      ok: false,
      erro: sugestao
        ? `Esse horário não está mais livre. Livres: ${sugestao}.`
        : "Esse horário não está mais livre. Veja os horários na Agenda do painel.",
    };
  }
  const depois = await lerVisitaDoLead(escopo, p.leadId, supabase);
  return {
    ok: true,
    antes: estado(antes),
    depois: depois ? estado(depois) : { visitaEm: p.quando.toISOString(), etapa: antes.etapa },
  };
}

export async function desmarcarVisitaPorMensagem(
  escopo: EscopoDaAgenda,
  p: { leadId: string; esperada: string | null; agora: Date },
  supabase: Supa = createServiceClient(),
): Promise<MudancaDeVisita> {
  const antes = await lerVisitaDoLead(escopo, p.leadId, supabase);
  if (!antes) return { ok: false, erro: NAO_ACHEI };
  if (!visitaFutura(antes, p.agora)) return { ok: false, erro: `${antes.nome} não tem visita marcada.` };
  if (!mesmoInstante(antes.visitaEm, p.esperada)) {
    return { ok: false, erro: `A visita de ${antes.nome} mudou desde o pedido. Peça de novo.` };
  }
  if (!(await cancelarVisitaLead(p.leadId, { por: "central", corretorId: escopo.corretorId }))) {
    return { ok: false, erro: "Não consegui desmarcar agora. Tente de novo." };
  }
  const depois = await lerVisitaDoLead(escopo, p.leadId, supabase);
  return { ok: true, antes: estado(antes), depois: depois ? estado(depois) : { visitaEm: null, etapa: antes.etapa } };
}

/**
 * O desfazer (até 24 h): a data e a etapa voltam ao que eram antes do "sim".
 *
 * Só se a visita ainda está como o central deixou: se o cliente remarcou
 * pela conversa, ou alguém mexeu no painel, voltar atrás apagaria isso. A
 * etapa só volta se continua a que o central deixou (o lead que avançou para
 * proposta não regride). Uma data de antes que já passou não volta: viraria
 * visita no passado.
 *
 * Escreve na coluna do lead, como o painel (`definirVisitaEm`): o gatilho da
 * 0224 move a linha de `visitas` e a trava de 60 min recusa o conflito.
 */
export async function voltarVisitaPorMensagem(
  escopo: EscopoDaAgenda,
  p: { leadId: string; antes: EstadoDaVisita; depois: EstadoDaVisita; agora: Date },
  supabase: Supa = createServiceClient(),
): Promise<{ ok: boolean; texto: string }> {
  const atual = await lerVisitaDoLead(escopo, p.leadId, supabase);
  if (!atual) return { ok: false, texto: NAO_ACHEI };
  if (!mesmoInstante(atual.visitaEm, p.depois.visitaEm)) {
    return { ok: false, texto: `A visita de ${atual.nome} mudou depois disso. Ajuste pela Agenda do painel.` };
  }
  if (p.antes.visitaEm && Date.parse(p.antes.visitaEm) <= p.agora.getTime()) {
    return {
      ok: false,
      texto: `A visita de antes (${rotuloDoInstante(new Date(p.antes.visitaEm))}) já passou; não dá para voltar a ela. Se for o caso, peça para cancelar a nova.`,
    };
  }

  const voltaEtapa = atual.etapa === p.depois.etapa && p.antes.etapa !== p.depois.etapa;
  let alteracao = supabase
    .from("leads")
    .update({
      visita_agendada_em: p.antes.visitaEm,
      ...(voltaEtapa ? { etapa: p.antes.etapa, etapa_alterada_em: p.agora.toISOString() } : {}),
    })
    .eq("id", p.leadId)
    .eq("grupo_id", escopo.grupoId);
  // A trava otimista: só grava sobre a data que acabou de ser conferida.
  alteracao = atual.visitaEm ? alteracao.eq("visita_agendada_em", atual.visitaEm) : alteracao.is("visita_agendada_em", null);
  const { data, error } = await alteracao.select("id");
  if (error) {
    return {
      ok: false,
      texto: ehConflitoDeHorario(error)
        ? `O horário de antes já foi ocupado por outro compromisso. Marque outro para ${atual.nome}.`
        : "Não consegui desfazer agora. Tente de novo.",
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, texto: `A visita de ${atual.nome} mudou depois disso. Ajuste pela Agenda do painel.` };
  }

  // O lembrete de véspera pendente era da data que saiu.
  await apagarLembretesPendentesDeVisita(supabase, p.leadId);
  const texto = p.antes.visitaEm
    ? `A visita de ${atual.nome} voltou para ${rotuloDoInstante(new Date(p.antes.visitaEm))}.`
    : `A visita de ${atual.nome} saiu da agenda.`;
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: escopo.corretorId,
    tipo: "visita",
    conteudo: `Desfeito pelo número central: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`,
    detalhes: { de: atual.visitaEm, para: p.antes.visitaEm, por: "central" },
  });
  if (voltaEtapa) await registrarEtapaAutomatica(p.leadId, p.depois.etapa, p.antes.etapa, "central");
  return { ok: true, texto };
}

/**
 * As visitas marcadas de quem pede que cruzam o intervalo: o bloqueio que as
 * cruza é recusado pelo banco (0226), e a proposta já diz isso antes do "sim".
 */
export async function visitasNoIntervalo(
  escopo: EscopoDaAgenda,
  p: { inicio: Date; fim: Date },
  supabase: Supa = createServiceClient(),
): Promise<Date[]> {
  const { data } = await supabase
    .from("visitas")
    .select("inicio")
    .eq("grupo_id", escopo.grupoId)
    .eq("corretor_id", escopo.corretorId)
    .eq("status", "marcada")
    .lt("inicio", p.fim.toISOString())
    .gt("fim", p.inicio.toISOString())
    .order("inicio", { ascending: true })
    .limit(3);
  return (data ?? []).map((v) => new Date(v.inicio));
}
