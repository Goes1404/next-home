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

/**
 * Escolhido MEDINDO (`npm run bench:gemini`), com o catálogo real.
 *
 * | modelo | nota | latência | estabilidade |
 * |---|---|---|---|
 * | `gemini-3.5-flash` | 5/5 | 1,5–4,6s | **5/5** |
 * | `gemini-3.5-flash-lite` | 5/5 | 0,9s | 5/6 |
 * | `gemini-3.6-flash` | 5/5 | 6,0s | 5/7 |
 * | `gemini-2.5-flash` (anterior) | 1/5 | — | 1/9 |
 * | `gemini-pro-latest` | — | — | 429 na primeira chamada |
 * | `gemini-3.7-flash` | — | timeout | 0/2 |
 *
 * O 2.5-flash saiu por **cota esgotada**, não por qualidade: ele acumulou
 * ~170 interações de produção e passou a devolver 429 em toda chamada,
 * derrubando o atendimento para o modo de contingência. E a cota do tier
 * gratuito é POR MODELO — trocar de modelo é trocar de balde, o que faz da
 * escolha aqui uma decisão de disponibilidade, não só de qualidade.
 *
 * Entre os três que passaram, o `3.5-flash` foi escolhido pela
 * estabilidade perfeita e pelo texto mais rico. O `lite` é 5x mais rápido,
 * mas a velocidade da cascata já vem da Groq, que é o primeiro elo; o
 * papel do Gemini aqui é ser o elo CONFIÁVEL.
 *
 * `GEMINI_MODEL` troca sem deploy de código.
 */
export const MODELO_GEMINI_PADRAO = "gemini-3.5-flash";

export function modeloGemini(): string {
  return process.env.GEMINI_MODEL || MODELO_GEMINI_PADRAO;
}

/** @deprecated Use `modeloGemini()`; a constante ignora `GEMINI_MODEL`. */
export const MODELO_GEMINI = MODELO_GEMINI_PADRAO;

function chaveApi(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || null;
}

export function geminiConfigurado(): boolean {
  return chaveApi() !== null;
}

export async function chamarGeminiJson(
  prompt: string,
  opts: { temperature?: number; timeoutMs: number; modelo?: string },
): Promise<ResultadoLlm> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  /*
   * `opts.modelo` existe para o juiz do eval, e a razão é de cota, não de
   * qualidade: o tier gratuito conta por MODELO (20 chamadas/dia por
   * modelo nesta conta). Um eval de 17 chamadas no mesmo modelo que atende
   * o cliente esgota o balde do atendimento — e o cliente cai em
   * contingência porque alguém rodou um teste.
   */
  const modelo = opts.modelo || modeloGemini();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
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
      modelo,
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
