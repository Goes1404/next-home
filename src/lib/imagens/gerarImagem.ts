import "server-only";

import type { ChaveQualidade } from "./imagensTipos";

/**
 * Geração de imagem pela OpenAI.
 *
 * ## Por que não passa por `llm.ts`
 *
 * `llm.ts` é o roteador de texto→JSON: ele escolhe entre quatro provedores,
 * divide orçamento por prazo e devolve `ResultadoLlm`. Aqui o contrato é
 * outro — a saída são BYTES, não JSON, e não há cascata porque nenhum outro
 * provedor configurado no projeto gera imagem. Mora fora pelo mesmo motivo que
 * `lerPlanta.ts` (imagem de entrada) e `leads/importacao.ts` (PDF) moram.
 *
 * ## O modelo
 *
 * `gpt-image-2`, e a escolha foi medida em 03/09/2026: a conta alcança seis
 * modelos de imagem e ele é o ÚNICO sem data de desligamento. `gpt-image-1`
 * morre em 2026-10-23 e outros três em 2026-12-01 — construir neles seria
 * construir em areia.
 *
 * Contrato descoberto sondando a API com valores inválidos (que não geram
 * imagem e não custam nada): `size` aceita qualquer W×H com os dois lados
 * divisíveis por 16; `quality` é low|medium|high|auto; `output_format` é
 * png|webp|jpeg; `n` vai até 10.
 *
 * ## Os desfechos que importam
 *
 * `sem_credito` e `recusado` são motivos SEPARADOS dos erros genéricos, e isso
 * é decisão de produto. A chave desta conta já ficou sem crédito uma vez, no
 * meio de uma medição; "não deu para gerar" não diz à corretora que falta
 * pagar. E recusa do modelo não é defeito — é resposta, e ela precisa chegar
 * com o texto para a pessoa saber o que mudar no pedido.
 */

const URL_GERAR = "https://api.openai.com/v1/images/generations";
const URL_EDITAR = "https://api.openai.com/v1/images/edits";

const MODELO_IMAGEM_PADRAO = "gpt-image-2";

/**
 * Teto de espera, com FOLGA para o que vem depois.
 *
 * A rota vive sob o limite de 60s do plano Hobby, e o orçamento não é só a
 * chamada: depois dela ainda sobem 1-3 MB para o Storage e grava-se a linha da
 * galeria. Um teto de 55s deixaria 5s para isso — geração de 50s (dentro da
 * variação medida em `medium`, que deu 37s) mataria a função COM A IMAGEM JÁ
 * PAGA e a corretora receberia um erro genérico.
 *
 * 45s deixa 15s para o upload. Quando estoura, a mensagem manda tentar em
 * "Rápida", que é a saída de verdade — `low` mediu 14,5s.
 */
const TIMEOUT_PADRAO_MS = 45_000;

function chaveApi(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

export function imagensConfiguradas(): boolean {
  return chaveApi() !== null;
}

export function modeloDeImagem(): string {
  return process.env.OPENAI_IMAGE_MODEL || MODELO_IMAGEM_PADRAO;
}

export type MotivoFalhaImagem =
  | "sem_api_key"
  | "timeout"
  | "sem_credito"
  | "recusado"
  | "http_4xx"
  | "http_429"
  | "http_5xx"
  | "resposta_vazia"
  | "desconhecido";

export type ResultadoImagem =
  | { ok: true; bytes: Buffer; mime: string; modelo: string; latenciaMs: number }
  | { ok: false; motivo: MotivoFalhaImagem; detalhe?: string; latenciaMs: number };

export type PedidoDeImagem = {
  prompt: string;
  /** Foto de referência: quando existe, o caminho vira EDIÇÃO em vez de criação. */
  referencia?: { bytes: Buffer; mime: string } | null;
  largura: number;
  altura: number;
  qualidade: ChaveQualidade;
  timeoutMs?: number;
};

/**
 * Traduz o corpo de erro da OpenAI num motivo do nosso vocabulário.
 *
 * Separado e exportado para ser testável sem rede — a classificação é a parte
 * que erra, não o `fetch`.
 */
export function motivoDoErro(status: number, corpo: string): MotivoFalhaImagem {
  const texto = corpo.toLowerCase();
  if (texto.includes("insufficient_quota") || texto.includes("billing_hard_limit")) {
    return "sem_credito";
  }
  if (
    texto.includes("moderation_blocked") ||
    texto.includes("content_policy") ||
    texto.includes("safety system") ||
    texto.includes("image_generation_user_error")
  ) {
    return "recusado";
  }
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  if (status >= 400) return "http_4xx";
  return "desconhecido";
}

export async function gerarImagem(pedido: PedidoDeImagem): Promise<ResultadoImagem> {
  const inicio = Date.now();
  const apiKey = chaveApi();
  if (!apiKey) return { ok: false, motivo: "sem_api_key", latenciaMs: 0 };

  const modelo = modeloDeImagem();
  const tamanho = `${pedido.largura}x${pedido.altura}`;
  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), pedido.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    // Com referência a chamada é multipart (o arquivo vai no corpo); sem
    // referência é JSON. São dois endpoints diferentes, não um parâmetro.
    const comReferencia = Boolean(pedido.referencia);
    const resposta = comReferencia
      ? await fetch(URL_EDITAR, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: corpoDeEdicao(pedido, modelo, tamanho),
          signal: controle.signal,
        })
      : await fetch(URL_GERAR, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelo,
            prompt: pedido.prompt,
            size: tamanho,
            quality: pedido.qualidade,
            output_format: "png",
            n: 1,
          }),
          signal: controle.signal,
        });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return {
        ok: false,
        motivo: motivoDoErro(resposta.status, corpo),
        detalhe: mensagemDoCorpo(corpo) ?? `HTTP ${resposta.status}`,
        latenciaMs: Date.now() - inicio,
      };
    }

    const corpo = (await resposta.json()) as {
      data?: { b64_json?: string; url?: string }[];
    };
    const primeira = corpo.data?.[0];

    if (primeira?.b64_json) {
      return {
        ok: true,
        bytes: Buffer.from(primeira.b64_json, "base64"),
        mime: "image/png",
        modelo,
        latenciaMs: Date.now() - inicio,
      };
    }

    // O modelo devolve base64 por padrão, mas a API historicamente também
    // respondeu com URL temporária. Buscar é barato e evita um caminho morto.
    if (primeira?.url) {
      const arquivo = await fetch(primeira.url, { signal: controle.signal });
      if (arquivo.ok) {
        return {
          ok: true,
          bytes: Buffer.from(await arquivo.arrayBuffer()),
          mime: arquivo.headers.get("content-type") ?? "image/png",
          modelo,
          latenciaMs: Date.now() - inicio,
        };
      }
    }

    return { ok: false, motivo: "resposta_vazia", latenciaMs: Date.now() - inicio };
  } catch (err) {
    const latenciaMs = Date.now() - inicio;
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        motivo: "timeout",
        detalhe: `abortado em ${pedido.timeoutMs ?? TIMEOUT_PADRAO_MS}ms`,
        latenciaMs,
      };
    }
    return { ok: false, motivo: "desconhecido", detalhe: String(err), latenciaMs };
  } finally {
    clearTimeout(alarme);
  }
}

function corpoDeEdicao(pedido: PedidoDeImagem, modelo: string, tamanho: string): FormData {
  const forma = new FormData();
  forma.append("model", modelo);
  forma.append("prompt", pedido.prompt);
  forma.append("size", tamanho);
  forma.append("quality", pedido.qualidade);
  forma.append("n", "1");
  const ref = pedido.referencia!;
  forma.append("image", new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }), "referencia.png");
  return forma;
}

/** A frase que a OpenAI devolve, quando devolve — é ela que ajuda quem lê. */
function mensagemDoCorpo(corpo: string): string | null {
  try {
    const json = JSON.parse(corpo) as { error?: { message?: string } };
    return json.error?.message ?? null;
  } catch {
    return null;
  }
}
