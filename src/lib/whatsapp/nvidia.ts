import "server-only";

import {
  extrairJsonDeTexto,
  motivoDoStatus,
  type ResultadoLlm,
} from "./llmTipos";

/**
 * Adaptador dos modelos hospedados da NVIDIA (build.nvidia.com).
 *
 * A API é OpenAI-compatível: `POST /v1/chat/completions` com
 * `Authorization: Bearer nvapi-...`, resposta em
 * `choices[0].message.content`. Nenhuma dependência nova — é `fetch` puro,
 * como o adaptador do Gemini.
 *
 * A diferença que importa: o Gemini garante JSON por contrato
 * (`responseMimeType`), e aqui `response_format` não vale para todo modelo
 * do catálogo. Por isso duas defesas: a instrução de sistema abaixo e o
 * `extrairJsonDeTexto`, que sabe desembrulhar cerca de código e frase de
 * cortesia. Sem elas, uma resposta boa viraria contingência à toa.
 */

const BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Escolhido MEDINDO contra a API real, não pela reputação do nome.
 *
 * O primeiro palpite foi `meta/llama-3.3-70b-instruct`, e ele estava errado:
 * na conta gratuita esse modelo **não responde** — duas tentativas, 60s e
 * 90s, sem uma linha de volta. Teria virado timeout em toda conversa.
 *
 * O que a medição com o prompt real (~3100 tokens de entrada) mostrou:
 *
 * | modelo | latência | veredito |
 * |---|---|---|
 * | `meta/llama-3.3-70b-instruct` | não respondeu em 90s | inutilizável |
 * | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | ~30s | lento demais |
 * | `nvidia/nemotron-3.5-lightning-30b-a3b` | ~14s | lento, e cospe raciocínio antes do JSON |
 * | `meta/llama-3.1-8b-instruct` | ~1,8s | rápido, mas agenda no DIA ERRADO |
 * | `mistralai/mistral-nemotron` | ~5,5s | escolhido |
 *
 * O 8B foi descartado por um erro caro: o cliente pediu sábado e ele
 * devolveu uma quinta-feira — e essa data vai direto para
 * `leads.visita_agendada_em`. Visita marcada no dia errado é pior que
 * visita não marcada.
 *
 * O mistral-nemotron acertou o sábado, recusou um pedido de 30% de desconto
 * e não inventou imóvel fora do catálogo quando perguntado sobre o Leblon —
 * os dois casos que os guardrails existem para pegar. A latência fica na
 * mesma faixa do Gemini (4,9–6,9s medidos em produção).
 *
 * `NVIDIA_MODEL` troca sem deploy de código.
 */
export const MODELO_NVIDIA_PADRAO = "mistralai/mistral-nemotron";

export function modeloNvidia(): string {
  return process.env.NVIDIA_MODEL || MODELO_NVIDIA_PADRAO;
}

function chaveApi(): string | null {
  return process.env.NVIDIA_API_KEY || null;
}

export function nvidiaConfigurada(): boolean {
  return chaveApi() !== null;
}

/**
 * Vive aqui, e não no prompt do atendimento, de propósito: é uma exigência
 * do transporte (este provedor não garante JSON), não uma instrução sobre
 * como atender o cliente. Misturar as duas coisas faria o `PROMPT_VERSAO`
 * mudar por motivo errado e sujaria a comparação entre versões.
 */
const INSTRUCAO_JSON =
  "Você responde SOMENTE com um objeto JSON válido, sem cercas de código, " +
  "sem comentários e sem nenhum texto antes ou depois. Nada além do JSON.";

export async function chamarNvidiaJson(
  prompt: string,
  opts: { temperature?: number; timeoutMs: number },
): Promise<ResultadoLlm> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  const modelo = modeloNvidia();

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
        max_tokens: 2048,
        stream: false,
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
