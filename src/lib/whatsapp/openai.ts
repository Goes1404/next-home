import "server-only";

import { extrairJsonDeTexto, motivoDoStatus, type ResultadoLlm } from "./llmTipos";

/**
 * Adaptador da OpenAI.
 *
 * É o ÚNICO provedor PAGO da cascata, e isso decide o lugar dele: por
 * último. Groq, Gemini e NVIDIA são gratuitos e cobrem a esmagadora maioria
 * das mensagens; a OpenAI só é chamada quando os três falharam — que é
 * exatamente o momento em que hoje o cliente recebe a mensagem de
 * contingência e a conversa morre. Trocar isso por alguns centavos é um bom
 * negócio; pagar por toda mensagem quando a Groq responde de graça em 0,8s
 * não é.
 *
 * Consequência prática: a fatura só cresce quando os gratuitos estão
 * doentes. Se ela crescer sem isso, é sinal de que algo na cascata quebrou
 * antes — vale olhar `ia_interacoes.modelo` antes de culpar o volume.
 */

const BASE_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Escolhido MEDINDO (`npm run bench:openai`), como os das outras cascatas:
 *
 * | modelo | nota | latência | observação |
 * |---|---|---|---|
 * | `gpt-4.1-mini` | 5/5 | ~2,6s | escolhido — único que passou tudo |
 * | `gpt-4.1` | 4/5 | ~1,2s | mais rápido, mas nem sempre convida |
 * | `gpt-4o-mini` | 4/5 | ~1,5s | idem |
 * | `gpt-5` / `gpt-5-mini` | — | timeout 10,4s | reprovados na triagem |
 *
 * A família `gpt-5` reprovou por TEMPO, não por qualidade: são modelos de
 * raciocínio e passam dos 10s de triagem. Num webhook com teto de 60s
 * dividido entre rajada, agente, envios e dossiê, isso não cabe.
 *
 * Trocar por `OPENAI_MODEL` sem deploy de código.
 */
export const MODELO_OPENAI_PADRAO = "gpt-4.1-mini";

export function modeloOpenai(): string {
  return process.env.OPENAI_MODEL || MODELO_OPENAI_PADRAO;
}

function chaveApi(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

export function openaiConfigurada(): boolean {
  return chaveApi() !== null;
}

const INSTRUCAO_JSON =
  "Você responde SOMENTE com um objeto JSON válido, sem cercas de código, " +
  "sem comentários e sem nenhum texto antes ou depois. Nada além do JSON.";

export async function chamarOpenaiJson(
  prompt: string,
  opts: { temperature?: number; timeoutMs: number; modelo?: string },
): Promise<ResultadoLlm> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, erro: "sem_api_key", latenciaMs: 0 };

  const modelo = opts.modelo || modeloOpenai();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    /*
     * A família `gpt-5` e os modelos `o*` recusam `temperature` diferente de
     * 1 e trocaram `max_tokens` por `max_completion_tokens` — mandar os
     * parâmetros antigos devolve HTTP 400, que pareceria modelo indisponível
     * e mandaria a cascata adiante à toa.
     */
    const familiaNova = /^(gpt-5|o[34])/.test(modelo);

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
        ...(familiaNova
          ? { max_completion_tokens: 4096 }
          : { max_tokens: 4096, temperature: opts.temperature ?? 0.2 }),
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
