import "server-only";

import { motivoDoStatus, type ResultadoLlm } from "./llmTipos";

/**
 * Adaptador do Gemini.
 *
 * Já foi o único caminho de IA do sistema; hoje é um dos dois provedores da
 * cascata em `llm.ts`. O que ele tem de melhor e nenhum outro tem aqui:
 * `responseMimeType: "application/json"` — JSON limpo por contrato, sem
 * precisar desembrulhar cerca de código.
 *
 * Continua sendo o ÚNICO caminho para áudio e PDF (`audioTranscriber.ts`,
 * `importacao.ts`), que mandam `inlineData` — modelo de texto não recebe.
 */

export const MODELO_GEMINI = "gemini-2.5-flash";

function chaveApi(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || null;
}

export function geminiConfigurado(): boolean {
  return chaveApi() !== null;
}

export async function chamarGeminiJson(
  prompt: string,
  opts: { temperature?: number; timeoutMs: number },
): Promise<ResultadoLlm> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const corpo = await response.text().catch(() => "");
      return {
        ok: false,
        erro: motivoDoStatus(response.status),
        detalhe: `HTTP ${response.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
        latenciaMs: Date.now() - inicio,
      };
    }

    const corpo = await response.json();
    const texto = corpo.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return { ok: false, erro: "resposta_vazia", latenciaMs: Date.now() - inicio };

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return { ok: false, erro: "json_invalido", latenciaMs: Date.now() - inicio };
    }

    return {
      ok: true,
      json,
      latenciaMs: Date.now() - inicio,
      tokensEntrada: corpo.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: corpo.usageMetadata?.candidatesTokenCount ?? null,
      modelo: MODELO_GEMINI,
    };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      erro: abortou ? "timeout" : "desconhecido",
      detalhe: abortou ? `abortado em ${opts.timeoutMs}ms` : String(err),
      latenciaMs: Date.now() - inicio,
    };
  }
}
