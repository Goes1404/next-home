import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { registrarAvisoNoHistorico } from "./avisos";
import { FALHAS_SEGUIDAS_PARA_PAUSAR, decidirEnvio, inicioDoDiaEmSaoPaulo, textoDoCorretor } from "./comunicadoRegras";
import { lerCentral } from "./numeroDoCentral";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * A fila do comunicado pelo número central (0260), chamada pelo tique dos
 * follow-ups (pg_cron, a cada 5 min). Manda NO MÁXIMO UMA mensagem por
 * chamada, só quando `decidirEnvio` deixa (horário, teto do dia,
 * intervalo, central conectado). As regras estão em `comunicadoRegras.ts`.
 *
 * - Reserva antes de mandar: o envio só é pego se ainda está `pendente` e
 *   sem `enviado_em` (troca condicional); dois tiques sobrepostos não
 *   mandam a mesma mensagem duas vezes.
 * - A pessoa é relida na hora: desativada ou sem WhatsApp vira `pulado`.
 * - Três falhas seguidas no mesmo comunicado o PAUSAM (número com problema
 *   não fica insistindo); retomar é na tela da plataforma.
 * - No histórico do central entra só para quem JÁ conversou com ele: criar
 *   a conversa aqui faria o central passar a mandar os avisos automáticos
 *   (resumo das 8h…) para quem nunca falou com ele (`canalDoAviso`).
 *
 * Nenhuma IA: não conta na cota. Nunca lança.
 */
export async function processarComunicados(supabase: Supa, agora: Date = new Date()): Promise<number> {
  try {
    const { data: abertos, error: erroAbertos } = await supabase
      .from("comunicados")
      .select("id")
      .eq("situacao", "enviando")
      .order("criado_em", { ascending: true })
      .limit(5);
    if (erroAbertos || !abertos || abertos.length === 0) return 0;

    const central = await lerCentral();
    const { count: enviadosHoje } = await supabase
      .from("comunicado_envios")
      .select("id", { count: "exact", head: true })
      .not("enviado_em", "is", null)
      .gte("enviado_em", inicioDoDiaEmSaoPaulo(agora).toISOString());
    const { data: ultimo } = await supabase
      .from("comunicado_envios")
      .select("enviado_em")
      .not("enviado_em", "is", null)
      .order("enviado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const decisao = decidirEnvio({
      agora,
      centralConectado: central?.statusConexao === "conectado",
      enviadosHoje: enviadosHoje ?? 0,
      ultimoEnvioEm: ultimo?.enviado_em ? new Date(ultimo.enviado_em) : null,
    });
    if (!decisao.pode || !central) return 0;

    for (const comunicado of abertos) {
      const { data: envio } = await supabase
        .from("comunicado_envios")
        .select("id, corretor_id, nome, telefone, ordem")
        .eq("comunicado_id", comunicado.id)
        .eq("situacao", "pendente")
        .is("enviado_em", null)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!envio) {
        await supabase
          .from("comunicados")
          .update({ situacao: "concluido", concluido_em: agora.toISOString() })
          .eq("id", comunicado.id)
          .eq("situacao", "enviando");
        continue;
      }

      // Reserva: só um tique pega este envio.
      const { data: reservado } = await supabase
        .from("comunicado_envios")
        .update({ enviado_em: agora.toISOString() })
        .eq("id", envio.id)
        .eq("situacao", "pendente")
        .is("enviado_em", null)
        .select("id");
      if (!reservado || reservado.length === 0) return 0;

      const { data: modelo } = await supabase.from("comunicados").select("texto").eq("id", comunicado.id).maybeSingle();
      const { data: pessoa } = await supabase.from("corretores").select("ativo, whatsapp").eq("id", envio.corretor_id).maybeSingle();
      if (!modelo || !pessoa?.ativo || !pessoa.whatsapp) {
        await supabase
          .from("comunicado_envios")
          .update({ situacao: "pulado", motivo: !pessoa?.ativo ? "corretor desativado" : "sem WhatsApp no perfil" })
          .eq("id", envio.id);
        return 0;
      }

      const texto = textoDoCorretor(modelo.texto, envio.nome, envio.ordem);
      let resultado: { enviado: boolean; motivo?: string };
      try {
        resultado = await enviarMensagemWhatsapp({ instanceName: central.instanceName, telefone: pessoa.whatsapp, texto });
      } catch (err) {
        resultado = { enviado: false, motivo: err instanceof Error ? err.message : "erro no envio" };
      }

      if (resultado.enviado) {
        await supabase.from("comunicado_envios").update({ situacao: "enviado", motivo: null }).eq("id", envio.id);
        const { data: conversa } = await supabase
          .from("central_estado")
          .select("corretor_id")
          .eq("corretor_id", envio.corretor_id)
          .limit(1)
          .maybeSingle();
        if (conversa) await registrarAvisoNoHistorico(supabase, envio.corretor_id, texto, agora);
        console.info(`[comunicado] enviado pelo central: comunicado ${comunicado.id}, ordem ${envio.ordem}`);
        return 1;
      }

      // Falhou: libera o teto do dia (a reserva não conta) e registra o motivo.
      await supabase
        .from("comunicado_envios")
        .update({ situacao: "falhou", motivo: String(resultado.motivo ?? "não saiu").slice(0, 300), enviado_em: null })
        .eq("id", envio.id);
      console.warn(`[comunicado] não saiu: comunicado ${comunicado.id}, ordem ${envio.ordem}: ${resultado.motivo}`);
      await pausarSeFalhouSeguido(supabase, comunicado.id);
      return 0;
    }
    return 0;
  } catch (err) {
    console.warn("[comunicado] tique falhou:", err);
    return 0;
  }
}

async function pausarSeFalhouSeguido(supabase: Supa, comunicadoId: string): Promise<void> {
  const { data: ultimos } = await supabase
    .from("comunicado_envios")
    .select("situacao")
    .eq("comunicado_id", comunicadoId)
    .in("situacao", ["enviado", "falhou"])
    .order("ordem", { ascending: false })
    .limit(FALHAS_SEGUIDAS_PARA_PAUSAR);
  if (ultimos && ultimos.length === FALHAS_SEGUIDAS_PARA_PAUSAR && ultimos.every((e) => e.situacao === "falhou")) {
    await supabase.from("comunicados").update({ situacao: "pausado" }).eq("id", comunicadoId).eq("situacao", "enviando");
    console.warn(`[comunicado] ${FALHAS_SEGUIDAS_PARA_PAUSAR} falhas seguidas: comunicado ${comunicadoId} pausado`);
  }
}
