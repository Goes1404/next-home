import "server-only";

/**
 * Chamada crua ao Gemini com contrato JSON — o único lugar do sistema que
 * fala com o modelo de linguagem.
 *
 * Existia uma cópia deste fetch em `aiAgent.ts` e outra em
 * `dossierExtractor.ts`, cada uma com seu timeout e nenhuma com retry: um
 * soluço de rede de 1 segundo derrubava a resposta inteira para o fallback
 * ("vou avisar o corretor"), que é a pior experiência possível para um
 * cliente quente. Aqui: 1 retentativa com backoff curto para erro
 * transitório (5xx, rede, JSON truncado), e o uso de tokens do
 * `usageMetadata` devolvido para a telemetria (ver telemetria.ts).
 *
 * Sobre TIMEOUT, e por que ele não é retentado: o teto era 8s para todos os
 * chamadores, e a telemetria de produção mostrou chamadas boas em 4950,
 * 5247 e 6948 ms — ou seja, um segundo de folga. Quando estourava, o retry
 * gastava 8000 + 500 + 8000 = 16,5s para chegar ao mesmo fallback, com o
 * cliente esperando. Um timeout já consumiu o orçamento inteiro; erro
 * rápido (5xx, rede) volta em menos de 1s e aí a retentativa vale. Por isso
 * o teto passou a ser escolhido por quem chama, e o timeout não repete.
 */

export const MODELO_GEMINI = "gemini-2.5-flash";

/**
 * Por que a chamada falhou, em vocabulário fechado.
 *
 * Era uma string solta, e o custo apareceu na tela do corretor: o painel
 * chutava "sem GEMINI_API_KEY configurada" para QUALQUER falha, mandando
 * caçar um problema de configuração que não existia — quando o que tinha
 * acontecido era timeout. Cada camada acima escolhe o que dizer a partir
 * daqui, sem `includes()` em texto livre.
 */
export type MotivoFalhaGemini =
  | "sem_api_key"
  | "timeout"
  | "http_4xx"
  | "http_429"
  | "http_5xx"
  | "resposta_vazia"
  | "desconhecido";

export type ResultadoGemini =
  | {
      ok: true;
      json: unknown;
      latenciaMs: number;
      tokensEntrada: number | null;
      tokensSaida: number | null;
    }
  | { ok: false; erro: MotivoFalhaGemini; detalhe?: string; latenciaMs: number };

/**
 * Tetos por tipo de chamada. Três vezes a maior latência já observada em
 * produção (6948 ms) é folga de verdade; 8s era otimismo.
 *
 * O webhook tem 60s de teto de função (`route.ts`), e o orçamento fecha:
 * 6s de espera de rajada + 20s do agente + ~5s de envios + 12s do dossiê.
 */
export const TIMEOUT_AGENTE_MS = 20_000;
/** O dossiê roda DEPOIS dos envios: ninguém está esperando por ele na tela. */
export const TIMEOUT_DOSSIE_MS = 12_000;

const BACKOFF_MS = 500;

function chaveApi(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || null;
}

export function geminiConfigurado(): boolean {
  return chaveApi() !== null;
}

/** Traduz o status HTTP para o vocabulário fechado de `MotivoFalhaGemini`. */
export function motivoDoStatus(status: number): MotivoFalhaGemini {
  if (status === 429) return "http_429";
  if (status >= 400 && status < 500) return "http_4xx";
  if (status >= 500) return "http_5xx";
  return "desconhecido";
}

/** Só vale repetir o que falha rápido — ver o comentário de topo. */
export function valeRetentar(motivo: MotivoFalhaGemini): boolean {
  return motivo === "http_5xx" || motivo === "resposta_vazia" || motivo === "desconhecido";
}

async function tentativa(
  prompt: string,
  temperature: number,
  timeoutMs: number,
): Promise<ResultadoGemini> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, responseMimeType: "application/json" },
        }),
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        erro: motivoDoStatus(response.status),
        detalhe: `HTTP ${response.status}`,
        latenciaMs: Date.now() - inicio,
      };
    }

    const corpo = await response.json();
    const texto = corpo.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return { ok: false, erro: "resposta_vazia", latenciaMs: Date.now() - inicio };

    return {
      ok: true,
      json: JSON.parse(texto),
      latenciaMs: Date.now() - inicio,
      tokensEntrada: corpo.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: corpo.usageMetadata?.candidatesTokenCount ?? null,
    };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      erro: abortou ? "timeout" : "desconhecido",
      detalhe: abortou ? `abortado em ${timeoutMs}ms` : String(err),
      latenciaMs: Date.now() - inicio,
    };
  }
}

/**
 * Uma retentativa apenas, e só para o que falha rápido: transitório de rede
 * se resolve na segunda. Chave ausente, 4xx e TIMEOUT não repetem — os dois
 * primeiros porque a segunda resposta seria idêntica, o timeout porque já
 * gastou o orçamento inteiro e repetir apenas dobra a espera do cliente.
 *
 * `timeoutMs` é do chamador: quem tem alguém esperando na tela merece mais
 * tempo que um trabalho de bastidor.
 */
export async function chamarGeminiJson(
  prompt: string,
  opts?: { temperature?: number; timeoutMs?: number },
): Promise<ResultadoGemini> {
  const temperature = opts?.temperature ?? 0.2;
  const timeoutMs = opts?.timeoutMs ?? TIMEOUT_AGENTE_MS;

  const primeira = await tentativa(prompt, temperature, timeoutMs);
  if (primeira.ok || !valeRetentar(primeira.erro)) return primeira;

  await new Promise((r) => setTimeout(r, BACKOFF_MS));
  const segunda = await tentativa(prompt, temperature, timeoutMs);
  // Soma a latência real gasta (as duas tentativas + backoff) para a
  // telemetria refletir o que o cliente esperou de fato.
  return { ...segunda, latenciaMs: primeira.latenciaMs + BACKOFF_MS + segunda.latenciaMs };
}
