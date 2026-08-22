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
 * transitório (timeout, 5xx, JSON truncado), e o uso de tokens do
 * `usageMetadata` devolvido para a telemetria (ver telemetria.ts).
 */

export const MODELO_GEMINI = "gemini-2.5-flash";

export type ResultadoGemini =
  | {
      ok: true;
      json: unknown;
      latenciaMs: number;
      tokensEntrada: number | null;
      tokensSaida: number | null;
    }
  | { ok: false; erro: string; latenciaMs: number };

const TIMEOUT_MS = 8000;
const BACKOFF_MS = 500;

function chaveApi(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || null;
}

export function geminiConfigurado(): boolean {
  return chaveApi() !== null;
}

async function tentativa(prompt: string, temperature: number): Promise<ResultadoGemini> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      return { ok: false, erro: `http_${response.status}`, latenciaMs: Date.now() - inicio };
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
    return {
      ok: false,
      erro: err instanceof Error && err.name === "AbortError" ? "timeout" : String(err),
      latenciaMs: Date.now() - inicio,
    };
  }
}

/**
 * Uma retentativa apenas: transitório de rede se resolve na segunda; erro
 * de verdade (4xx, chave inválida) só atrasaria o fallback em mais 8s.
 */
export async function chamarGeminiJson(
  prompt: string,
  opts?: { temperature?: number },
): Promise<ResultadoGemini> {
  const temperature = opts?.temperature ?? 0.2;

  const primeira = await tentativa(prompt, temperature);
  if (primeira.ok) return primeira;
  if (primeira.erro === "sem_api_key" || primeira.erro.startsWith("http_4")) return primeira;

  await new Promise((r) => setTimeout(r, BACKOFF_MS));
  const segunda = await tentativa(prompt, temperature);
  // Soma a latência real gasta (as duas tentativas + backoff) para a
  // telemetria refletir o que o cliente esperou de fato.
  if (segunda.ok) {
    return { ...segunda, latenciaMs: primeira.latenciaMs + BACKOFF_MS + segunda.latenciaMs };
  }
  return { ...segunda, latenciaMs: primeira.latenciaMs + BACKOFF_MS + segunda.latenciaMs };
}
