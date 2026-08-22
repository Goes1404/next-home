import "server-only";

import { extrairJsonDeTexto, motivoDoStatus, type ResultadoLlm } from "./llmTipos";

/**
 * Adaptador da Groq (console.groq.com).
 *
 * API OpenAI-compatível, como a da NVIDIA: `POST /openai/v1/chat/completions`
 * com `Authorization: Bearer gsk_...`. Nenhuma dependência nova.
 *
 * O que a Groq tem de diferente é velocidade — ela roda os modelos em
 * hardware próprio (LPU) e a diferença não é sutil: `gpt-oss-120b` responde
 * o prompt de teste em **0,76s**, contra 5,5s do melhor modelo utilizável da
 * NVIDIA e 4,9–6,9s do Gemini medidos em produção. Um provedor sub-segundo
 * muda o orçamento do webhook inteiro: sobra tempo para a cascata tentar
 * outro provedor sem chegar perto do teto de 60s da função.
 *
 * Diferente da NVIDIA, aqui `response_format: {type: "json_object"}` é
 * suportado — mas a resposta ainda passa por `extrairJsonDeTexto`, porque
 * `qwen3.6-27b` emite bloco `<think>` antes do JSON mesmo com o parâmetro
 * ligado. Cinto e suspensório custam nada e já pagaram.
 */

const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Escolhido MEDINDO (ver `npm run bench:groq`), não pelo nome.
 *
 * Latência com o prompt de teste, nesta conta:
 *
 * | modelo | latência | observação |
 * |---|---|---|
 * | `openai/gpt-oss-120b` | ~0,8s | JSON limpo — escolhido |
 * | `openai/gpt-oss-20b` | ~0,8s | JSON limpo, modelo menor |
 * | `groq/compound-mini` | ~1,5s | JSON limpo |
 * | `qwen/qwen3.6-27b` | ~1,0s | cospe `<think>` antes do JSON |
 * | `groq/compound` | HTTP 413 | recusa prompt do nosso tamanho |
 *
 * `GROQ_MODEL` troca sem deploy de código.
 */
export const MODELO_GROQ_PADRAO = "openai/gpt-oss-120b";

export function modeloGroq(): string {
  return process.env.GROQ_MODEL || MODELO_GROQ_PADRAO;
}

function chaveApi(): string | null {
  return process.env.GROQ_API_KEY || null;
}

export function groqConfigurada(): boolean {
  return chaveApi() !== null;
}

const INSTRUCAO_JSON =
  "Você responde SOMENTE com um objeto JSON válido, sem cercas de código, " +
  "sem comentários e sem nenhum texto antes ou depois. Nada além do JSON.";

export async function chamarGroqJson(
  prompt: string,
  opts: { temperature?: number; timeoutMs: number },
): Promise<ResultadoLlm> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  const modelo = modeloGroq();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: INSTRUCAO_JSON },
          { role: "user", content: prompt },
        ],
        temperature: opts.temperature ?? 0.2,
        /*
         * 4096, não 2048. Os modelos da Groq são verbosos — `gpt-oss-120b`
         * gastou 1279 tokens de saída e `compound-mini` 1735 no prompt real.
         * Com o teto em 2048 o JSON era CORTADO no meio, e como
         * `response_format` faz a Groq validar antes de devolver, o corte
         * virava HTTP 400 `json_validate_failed` — que parecia defeito do
         * modelo e era só truncamento nosso.
         */
        max_tokens: 4096,
        /*
         * Só a família `gpt-oss` aceita este parâmetro, e ele é o que
         * transforma a Groq no provedor mais rápido da cascata: em `low` a
         * saída cai de 1279 para 107 tokens e a resposta de 3,2s para 0,7s.
         * Mandá-lo para outro modelo seria 400 na cara.
         */
        ...(modelo.includes("gpt-oss")
          ? { reasoning_effort: process.env.GROQ_REASONING_EFFORT || "low" }
          : {}),
        stream: false,
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return {
        ok: false,
        erro: motivoDoStatus(res.status),
        detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
        latenciaMs: Date.now() - inicio,
      };
    }

    const corpo = await res.json();
    const texto: string | undefined = corpo?.choices?.[0]?.message?.content;
    if (!texto) return { ok: false, erro: "resposta_vazia", latenciaMs: Date.now() - inicio };

    const json = extrairJsonDeTexto(texto);
    if (json === null) {
      return {
        ok: false,
        erro: "json_invalido",
        detalhe: `resposta não continha JSON: ${texto.slice(0, 120)}`,
        latenciaMs: Date.now() - inicio,
      };
    }

    return {
      ok: true,
      json,
      latenciaMs: Date.now() - inicio,
      tokensEntrada: corpo?.usage?.prompt_tokens ?? null,
      tokensSaida: corpo?.usage?.completion_tokens ?? null,
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
