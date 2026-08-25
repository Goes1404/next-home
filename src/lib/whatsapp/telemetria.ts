import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

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
  /**
   * Id da linha, quando o chamador precisa conhecê-lo ANTES do insert —
   * é o caso do webhook, que carimba o mesmo uuid na mensagem gravada
   * (whatsapp_mensagens.interacao_id, 0040) para a resposta ser avaliável
   * balão a balão no Live Chat.
   */
  id?: string;
  conversaId?: string | null;
  corretorId?: string | null;
  origem: "webhook" | "playground" | "followup" | "eval";
  /** A conversa foi marcada como teste (palavra-chave de teste, ver 0039). */
  eTeste?: boolean;
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
      ...(dados.id ? { id: dados.id } : {}),
      conversa_id: dados.conversaId ?? null,
      corretor_id: dados.corretorId ?? null,
      origem: dados.origem,
      /*
       * Playground e eval são teste POR DEFINIÇÃO — nunca há cliente do
       * outro lado. Marcar na origem evita o trabalho manual de limpar
       * depois, que é o que produziu a migration 0038: 891 interações de
       * teste misturadas ao que deveria ser corpus de aprendizado, sendo
       * ensinadas ao agente como few-shot.
       */
      /*
       * Playground e eval são teste por definição. `eTeste` cobre o caso do
       * meio: o corretor testando pela linha de verdade, que chega como
       * `webhook` e só se distingue pela palavra-chave de teste.
       */
      e_teste: dados.eTeste === true || dados.origem === "playground" || dados.origem === "eval",
      prompt_versao: dados.promptVersao,
      /*
       * O modelo é o que DE FATO respondeu, ou nada. Nunca um palpite.
       *
       * Esta linha já mentiu duas vezes, e a segunda foi grande. A primeira:
       * na contingência ninguém respondeu, e cair no padrão fazia a tabela
       * dizer "gemini-2.5-flash" para uma resposta que o Gemini não deu —
       * apontando o diagnóstico do 429 justamente para o modelo
       * indisponível. Resolvido com o "nenhum".
       *
       * A segunda sobreviveu à primeira correção: `pausada_por_humano` e
       * `silenciada_por_modo` são registradas SEM chamar modelo nenhum — o
       * webhook sai antes — e mesmo assim recebiam o padrão. Em 24/08/2026
       * eram **1.443 de 1.496 linhas** carimbadas com um modelo que nunca
       * foi chamado. Contando por linha, isso fazia o Gemini parecer
       * responsável por 97% do atendimento; o número real era 9 respostas
       * de 47. Uma conclusão inteira sobre a cascata saiu daí, e estava
       * errada.
       *
       * Regra: quem chamou modelo passa o modelo. Quem não chamou não
       * inventa — `null` é a resposta honesta, e é ela que permite filtrar
       * "o que a IA de fato respondeu" com `where modelo is not null`.
       */
      modelo: dados.modelo ?? (dados.fallback ? "nenhum" : null),
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
