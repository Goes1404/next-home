import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { motivoDaQueda, motivoGuardadoNaEvolution } from "./motivoDaQueda";
import { motivoAindaNaoConsultado, motivoDaPausaPorQueda, quedaPedeProtecao } from "./protecaoDaQueda";
import { consultarMotivoDaQueda } from "./provider";

/**
 * A varredura dos números fora do ar (0174), a cada tique do cron.
 *
 * Duas tarefas, cada uma uma vez por queda:
 * 1. perguntar à Evolution o motivo que ela guardou, quando o webhook não o
 *    trouxe (quedas detectadas pela sincronização, ou anteriores a 0174);
 * 2. depois de 30 minutos fora do ar, pausar as listas em andamento do
 *    corretor e recomeçar o aquecimento (`protecaoDaQueda.ts`).
 *
 * Roda antes da janela de horário e de qualquer fila, como a varredura do
 * aviso de queda: proteção pendurada no caminho do disparo herdaria todas as
 * saídas antecipadas dele. Nunca lança.
 */
export async function protegerNumerosQueCairam(agora: Date = new Date()): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("corretor_whatsapp_instancias")
      .select(
        "id, corretor_id, instance_name, status_conexao, conectado_em, desconectado_em, queda_tratada_em, motivo_queda_codigo, motivo_queda_em",
      )
      .neq("status_conexao", "conectado")
      .not("desconectado_em", "is", null);

    if (error) {
      console.error("[queda] varredura não leu os números:", error.message);
      return;
    }

    for (const linha of data ?? []) {
      const desconectadoEm = new Date(linha.desconectado_em as string);
      let codigo = linha.motivo_queda_codigo;

      if (
        motivoAindaNaoConsultado({
          statusConexao: linha.status_conexao,
          desconectadoEm,
          motivoQuedaEm: linha.motivo_queda_em ? new Date(linha.motivo_queda_em) : null,
        })
      ) {
        const resposta = await consultarMotivoDaQueda(linha.instance_name);
        codigo = motivoGuardadoNaEvolution(resposta, desconectadoEm, agora);
        // Grava a consulta mesmo sem resposta: uma pergunta por queda. Um
        // provedor fora do ar não pode virar uma pergunta por minuto.
        await supabase
          .from("corretor_whatsapp_instancias")
          .update({ motivo_queda_codigo: codigo, motivo_queda_em: agora.toISOString() })
          .eq("id", linha.id);
        if (codigo !== null) console.warn(`[queda] ${linha.instance_name}: a Evolution guardou o código ${codigo}.`);
      }

      const pede = quedaPedeProtecao(
        {
          statusConexao: linha.status_conexao,
          conectadoEm: linha.conectado_em ? new Date(linha.conectado_em) : null,
          desconectadoEm,
          quedaTratadaEm: linha.queda_tratada_em ? new Date(linha.queda_tratada_em) : null,
        },
        agora,
      );
      if (!pede) continue;

      const { data: pausadas, error: erroPausa } = await supabase
        .from("whatsapp_campanhas")
        .update({ status: "pausada", pausa_automatica: motivoDaPausaPorQueda(desconectadoEm, motivoDaQueda(codigo)) })
        .eq("corretor_id", linha.corretor_id)
        .eq("status", "em_andamento")
        .select("id");
      if (erroPausa) {
        // Sem a pausa, não marca como tratada: o próximo tique tenta de novo.
        console.error("[queda] não consegui pausar as listas:", erroPausa.message);
        continue;
      }

      await supabase
        .from("corretor_whatsapp_instancias")
        .update({ queda_tratada_em: agora.toISOString(), aquecimento_desde: desconectadoEm.toISOString() })
        .eq("id", linha.id);

      console.warn(
        `[queda] ${linha.instance_name} fora do ar desde ${desconectadoEm.toISOString()}: ` +
          `${pausadas?.length ?? 0} lista(s) pausada(s) e aquecimento recomeçado.`,
      );
    }
  } catch (e) {
    console.error("[queda] varredura falhou sem derrubar o ciclo:", e);
  }
}
