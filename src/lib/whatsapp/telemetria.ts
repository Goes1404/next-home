import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { modeloGemini } from "./gemini";

/**
 * Registro de cada interação da IA (tabela ia_interacoes, migration 0029).
 *
 * Fire-and-forget por contrato: telemetria que derruba a resposta ao
 * cliente é pior que nenhuma telemetria. Erro aqui vira log e nada mais.
 *
 * O ponto que menos parece dado é o que mais vale: os SILÊNCIOS
 * (silenciada_por_modo, pausada_por_humano, debounce, reentrega). Sem
 * registrá-los, "o bot respondeu pouco" e "o bot está quebrado" são
 * indistinguíveis — foi exatamente o buraco que deixou o disparo de
 * campanhas morto por semanas sem ninguém ver.
 */
export type InteracaoIA = {
  conversaId?: string | null;
  corretorId?: string | null;
  origem: "webhook" | "playground" | "followup" | "eval";
  promptVersao: string;
  latenciaMs?: number | null;
  fallback?: boolean;
  acao: string;
  sugeriuVisita?: boolean | null;
  transferiuHumano?: boolean | null;
  anexosEnviados?: number | null;
  anexosBloqueados?: number | null;
  temperaturaScore?: number | null;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  /**
   * Qual modelo respondeu. Era a constante do Gemini cravada no insert —
   * inútil desde que existe cascata, porque a coluna diria "gemini" mesmo
   * quando quem atendeu foi a NVIDIA. É por aqui que se compara os dois
   * provedores em produção.
   */
  modelo?: string | null;
};

export async function registrarInteracao(dados: InteracaoIA): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("ia_interacoes").insert({
      conversa_id: dados.conversaId ?? null,
      corretor_id: dados.corretorId ?? null,
      origem: dados.origem,
      prompt_versao: dados.promptVersao,
      /*
       * Na contingência NINGUÉM respondeu, então `dados.modelo` vem null e
       * cair no padrão do Gemini seria mentira: a linha diria
       * "gemini-2.5-flash" para uma resposta que o Gemini não deu. Foi o
       * que atrapalhou o diagnóstico do 429 — a telemetria apontava para o
       * modelo que estava justamente indisponível.
       */
      modelo: dados.modelo ?? (dados.fallback ? "nenhum" : modeloGemini()),
      latencia_ms: dados.latenciaMs ?? null,
      fallback: dados.fallback ?? false,
      acao: dados.acao,
      sugeriu_visita: dados.sugeriuVisita ?? null,
      transferiu_humano: dados.transferiuHumano ?? null,
      anexos_enviados: dados.anexosEnviados ?? null,
      anexos_bloqueados: dados.anexosBloqueados ?? null,
      temperatura_score: dados.temperaturaScore ?? null,
      tokens_entrada: dados.tokensEntrada ?? null,
      tokens_saida: dados.tokensSaida ?? null,
    });
  } catch (err) {
    console.warn("Telemetria de IA falhou (seguindo sem ela):", err);
  }
}
