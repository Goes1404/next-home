import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { FinalidadeDaIa } from "./custoDaIa";

/**
 * O livro do consumo da IA (0233): uma linha por chamada paga que deu
 * resposta, de QUALQUER funcionalidade.
 *
 * Existe porque o custo em /plataforma somava só a telemetria do atendimento
 * (`ia_interacoes`), e metade do que se paga não passa por ela: o dossiê a
 * cada mensagem, a transcrição, as artes, a planta, a importação de leads...
 * O número da tela ficava abaixo do real, calado.
 *
 * A regra que fecha o buraco: **quem chama o provedor diz para quê e quem
 * paga** (`UsoDaIa`), e o tipo é obrigatório em `chamarLlmJson` e nos
 * adaptadores que falam direto com o provedor. Caminho novo sem `uso` não
 * compila.
 *
 * Nunca lança: quem chama está no meio do atendimento. Falha vai para o log.
 */

/**
 * Quem paga a chamada. O grupo sai do corretor (carimbo da 0191) ou vem
 * informado; os dois juntos são conferidos pelo banco.
 *
 * `semGrupo` é só para o que roda FORA de um grupo (eval e bench offline,
 * teste de API): não há a quem cobrar, e a linha não é gravada.
 */
export type QuemPagaAIa =
  | { corretorId: string; grupoId?: string | null }
  | { grupoId: string; corretorId?: string | null }
  | { semGrupo: "eval" };

export type UsoDaIa = { finalidade: FinalidadeDaIa; quemPaga: QuemPagaAIa };

export type GastoDaIa = {
  /** O modelo que DE FATO respondeu (o mesmo que vai para a telemetria). */
  modelo: string;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  /** Só onde a cobrança é por duração (transcrição). */
  segundosDeAudio?: number | null;
};

function inteiroOuNulo(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export async function registrarConsumoDaIa(uso: UsoDaIa, gasto: GastoDaIa): Promise<void> {
  // Sem a chave de serviço não há banco (teste de unidade, script local): nada
  // a gravar. Em produção a chave existe, e sem ela o webhook inteiro cai antes.
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE) return;
  try {
    if ("semGrupo" in uso.quemPaga) return;
    const { error } = await createServiceClient()
      .from("ia_consumo")
      .insert({
        ...(uso.quemPaga.grupoId ? { grupo_id: uso.quemPaga.grupoId } : {}),
        corretor_id: uso.quemPaga.corretorId ?? null,
        finalidade: uso.finalidade,
        modelo: gasto.modelo,
        tokens_entrada: inteiroOuNulo(gasto.tokensEntrada),
        tokens_saida: inteiroOuNulo(gasto.tokensSaida),
        segundos_de_audio:
          typeof gasto.segundosDeAudio === "number" && Number.isFinite(gasto.segundosDeAudio) && gasto.segundosDeAudio >= 0
            ? Math.round(gasto.segundosDeAudio * 10) / 10
            : null,
      });
    if (error) console.error(`[consumo-ia] não gravou ${uso.finalidade} (${gasto.modelo}): ${error.message}`);
  } catch (err) {
    console.error(`[consumo-ia] não gravou ${uso.finalidade} (${gasto.modelo}):`, err instanceof Error ? err.message : err);
  }
}
