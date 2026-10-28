import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  gradeEfetiva,
  proximosHorarios,
  type FaixaDisponivel,
  type HorarioDeVisita,
} from "./agendaDeVisitas";

/**
 * A agenda de UM corretor, lida do banco e virada em texto para o prompt.
 *
 * Separado de `agendaDeVisitas.ts` de propósito: lá é função pura e
 * testável; aqui é I/O. É a mesma divisão que o resto da casa usa, e é o
 * que permite ao eval medir o turno sem tocar no banco.
 *
 * ## Custo
 *
 * Duas consultas magras, e só quando a conversa é de verdade: a grade
 * semanal (no máximo 7 linhas) e as visitas já marcadas do corretor daqui
 * para frente. Roda no webhook, que já tem orçamento de 60s e faz chamada
 * de LLM — duas leituras de índice não pesam nada perto disso.
 */
export async function horariosDeVisita(
  corretorId: string,
  agora: Date = new Date(),
): Promise<HorarioDeVisita[]> {
  const supabase = createServiceClient();

  const [{ data: grade }, { data: marcadas }, { data: compromissos }] = await Promise.all([
    supabase
      .from("corretor_disponibilidade")
      .select("dia_semana, hora_inicio, hora_fim, horas_preferidas")
      .eq("corretor_id", corretorId),
    /*
     * Só o que ainda vai acontecer (ou está acontecendo): visita de ontem
     * não ocupa vaga nenhuma, e a que começou há menos de uma hora ainda
     * ocupa a seguinte. Lido de `visitas` (0224), que é onde a trava de
     * conflito mora: por QUEM FAZ a visita e só entre as marcadas.
     */
    supabase
      .from("visitas")
      .select("inicio")
      .eq("corretor_id", corretorId)
      .eq("status", "marcada")
      .gte("inicio", new Date(agora.getTime() - 60 * 60_000).toISOString()),
    // Reuniões e bloqueios (0226): a mesma tabela que a trava lê.
    supabase
      .from("compromisso_participantes")
      .select("inicio, fim")
      .eq("corretor_id", corretorId)
      .eq("ativo", true)
      .gt("fim", agora.toISOString()),
  ]);

  const faixas: FaixaDisponivel[] = (grade ?? []).map((f) => ({
    diaSemana: f.dia_semana,
    horaInicio: f.hora_inicio,
    horaFim: f.hora_fim,
    horasPreferidas: f.horas_preferidas ?? [],
  }));

  const ocupados = (marcadas ?? []).map((v) => new Date(v.inicio));

  const bloqueios = (compromissos ?? []).map((c) => ({ inicio: new Date(c.inicio), fim: new Date(c.fim) }));

  return proximosHorarios({ grade: gradeEfetiva(faixas), ocupados, bloqueios, agora, quantos: 6 });
}

/**
 * Os horários do corretor, e nunca uma exceção.
 *
 * Agenda é ENRIQUECIMENTO: falhar aqui não pode custar a resposta ao
 * cliente, que é o que o webhook está no meio de produzir. Sem lista, o
 * prompt volta ao calendário genérico. Quem não configurou grade usa a
 * padrão (`GRADE_PADRAO`, todos os dias das 9h às 20h).
 *
 * Devolve a lista CRUA, não o bloco pronto: quem filtra o que já foi
 * oferecido na conversa é o turno, que é onde o histórico está.
 */
export async function horariosDeVisitaSeguros(
  corretorId: string,
  agora: Date = new Date(),
): Promise<HorarioDeVisita[]> {
  try {
    return await horariosDeVisita(corretorId, agora);
  } catch (e) {
    console.error("[agenda] não foi possível ler os horários:", e);
    return [];
  }
}


/**
 * De quem é a agenda que vale para o lead (0225): se o gestor passou a visita
 * atual do lead a outro corretor, é a de quem FAZ a visita — a IA, que fala
 * pelo número do dono, oferece a remarcação na disponibilidade dele. Sem
 * visita passada (ou na falha da leitura), a do dono.
 */
export async function quemFazAVisitaDoLead(leadId: string, donoId: string, agora: Date = new Date()): Promise<string> {
  try {
    const { data } = await createServiceClient()
      .from("visitas")
      .select("corretor_id")
      .eq("lead_id", leadId)
      .eq("status", "marcada")
      .not("passada_em", "is", null)
      .gte("inicio", new Date(agora.getTime() - 60 * 60_000).toISOString())
      .order("inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.corretor_id ?? donoId;
  } catch (e) {
    console.error("[agenda] não foi possível ler quem faz a visita:", e);
    return donoId;
  }
}

/**
 * A agenda que vale para o lead quando quem pede não é necessariamente o
 * dono (o gestor, pelo WhatsApp): a de quem faz a visita passada, senão a do
 * dono do lead. Null se o lead não tem dono.
 */
export async function agendaQueValeParaOLead(leadId: string, agora: Date = new Date()): Promise<string | null> {
  const { data } = await createServiceClient().from("leads").select("corretor_id").eq("id", leadId).maybeSingle();
  if (!data?.corretor_id) return null;
  return quemFazAVisitaDoLead(leadId, data.corretor_id, agora);
}
