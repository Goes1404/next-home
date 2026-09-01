"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";

/**
 * A grade semanal de quando o corretor recebe visita (0073).
 *
 * Grava a grade INTEIRA de uma vez — apaga e insere — em vez de editar
 * faixa a faixa. Uma faixa "editada" é indistinguível de uma nova, e o
 * caminho único evita o estado intermediário em que metade da grade é
 * velha e metade é nova. É também por isso que a tabela não tem policy de
 * UPDATE.
 */

export interface FaixaDaSemana {
  diaSemana: number;
  horaInicio: number;
  horaFim: number;
}

export async function salvarDisponibilidade(
  faixas: FaixaDaSemana[],
): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const validas = faixas.filter(
    (f) =>
      Number.isInteger(f.diaSemana) &&
      f.diaSemana >= 0 &&
      f.diaSemana <= 6 &&
      f.horaInicio >= 6 &&
      f.horaFim <= 22 &&
      f.horaFim > f.horaInicio,
  );

  if (validas.length !== faixas.length) {
    return { erro: "Há um horário inválido na grade. O fim precisa ser depois do começo." };
  }

  const supabase = await createClient();

  // Apaga com a sessão do próprio corretor: a policy garante que ninguém
  // apague a grade de outro, sem precisar de service key aqui.
  const { error: erroApagar } = await supabase
    .from("corretor_disponibilidade")
    .delete()
    .eq("corretor_id", corretor.id);

  if (erroApagar) return { erro: "Não foi possível salvar agora. Tente de novo." };

  if (validas.length > 0) {
    const { error } = await supabase.from("corretor_disponibilidade").insert(
      validas.map((f) => ({
        corretor_id: corretor.id,
        dia_semana: f.diaSemana,
        hora_inicio: f.horaInicio,
        hora_fim: f.horaFim,
      })),
    );
    if (error) return { erro: "Não foi possível salvar agora. Tente de novo." };
  }

  revalidatePath("/corretor/visitas");

  return {
    ok:
      validas.length === 0
        ? "Agenda limpa. A assistente volta a falar de horário de forma genérica."
        : "Agenda salva. A assistente passa a oferecer só estes horários.",
  };
}
