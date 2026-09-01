import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  blocoDeHorarios,
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

  const [{ data: grade }, { data: marcadas }] = await Promise.all([
    supabase
      .from("corretor_disponibilidade")
      .select("dia_semana, hora_inicio, hora_fim")
      .eq("corretor_id", corretorId),
    /*
     * Só o que ainda vai acontecer: visita de ontem não ocupa vaga nenhuma.
     * O `gte` usa o instante de agora, não o dia — visita das 9h não
     * bloqueia a vaga das 15h do mesmo dia.
     */
    supabase
      .from("leads")
      .select("visita_agendada_em")
      .eq("corretor_id", corretorId)
      .not("visita_agendada_em", "is", null)
      .gte("visita_agendada_em", agora.toISOString()),
  ]);

  const faixas: FaixaDisponivel[] = (grade ?? []).map((f) => ({
    diaSemana: f.dia_semana,
    horaInicio: f.hora_inicio,
    horaFim: f.hora_fim,
  }));

  const ocupados = (marcadas ?? [])
    .map((l) => l.visita_agendada_em)
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v));

  return proximosHorarios({ grade: faixas, ocupados, agora, quantos: 6 });
}

/**
 * O bloco pronto para o prompt, ou string vazia.
 *
 * Vazio quando o corretor não configurou agenda — hoje, TODOS. O prompt
 * então segue com o calendário genérico de sempre: nunca quebrar o que já
 * funciona por causa de uma configuração que ninguém preencheu ainda é a
 * mesma regra que protege o link do catálogo (só entra quando há slug).
 */
export async function blocoDeHorariosDoCorretor(
  corretorId: string,
  agora: Date = new Date(),
): Promise<string> {
  try {
    return blocoDeHorarios(await horariosDeVisita(corretorId, agora));
  } catch (e) {
    // Agenda é enriquecimento; falhar aqui não pode custar a resposta ao
    // cliente. Sem bloco, o prompt volta ao calendário genérico.
    console.error("[agenda] não foi possível montar os horários:", e);
    return "";
  }
}
