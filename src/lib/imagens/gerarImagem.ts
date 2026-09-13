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
 * O que o modelo escreve na cena.
 *
 * ## A cláusula existiu, e foi RETIRADA por decisão de produto (11/09/2026)
 *
 * Na primeira geração de verdade desta tela o modelo desenhou uma placa com o
 * nome **"VISTA ALTO"** numa fachada que ninguém batizou. A reação foi proibir
 * todo texto — e isso resolveu a invenção matando uma capacidade central: peça
 * publicitária é feita de texto. Medido em 11/09: `textoNaCena`, a única
 * fresta que permitia escrita, **nunca teve um chamador**, então 100% das
 * imagens saíam sob a proibição e anúncio nenhum era possível.
 *
 * Hoje o modelo escreve livremente. O risco está registrado na spec e foi
 * aceito pelo dono do produto: ele vai inventar nome, metragem e preço quando
 * achar que a peça pede, e **quem publica responde pelo que está escrito**.
 *
 * ## O que sobrou aqui, e por que sobrou
 *
 * Quando o corretor DITA o texto (entre aspas, no próprio pedido), a
 * soletração entra. Não é preciosismo: medido na F0 de 10/09, com o texto
 * entre aspas e soletrado o modelo acertou **2 em 2**, contra 3 em 4 sem a
 * técnica. É a diferença entre a manchete sair certa e sair com letras
 * trocadas.
 *
 * O que precisa ser EXATO continua não vindo por aqui: a ressalva legal de
 * imagem ilustrativa é escrita por código em `carimbo.ts`, sobre a imagem
 * pronta. Três em quatro é ótimo para uma manchete e inaceitável para um
 * aviso legal.
 */
function soOsTextosPedidos(textos: string[]): string {
  /*
   * Cada texto entre aspas, separados por ponto e vírgula. Juntar por barra
   * ou por espaço faz o modelo DESENHAR o separador dentro da peça — o
   * defeito aparece na imagem, onde custa uma geração paga para descobrir.
   */
  const lista = textos.map((t) => `"${t}"`).join("; ");
  const umSo = textos.length === 1;
  return (
    `Escreva na imagem exatamente ${umSo ? "este texto" : "estes textos"}, com a ` +
    `grafia e os acentos idênticos: ${lista}. Reproduza caractere por caractere, ` +
    `sem traduzir, sem reescrever e sem mudar maiúsculas.`
  );
}

/**
 * O prompt que de fato vai para o provedor.
 *
 * Exportada para ser testável sem rede, e é o ponto ÚNICO por onde os dois
 * caminhos passam (criação em JSON e edição em multipart) — chamador novo não
 * tem como escapar dela, que é a mesma razão de `normalizarTelefoneBr` morar
 * no `provider.ts`.
 */
export function promptFinal(pedido: string, textosNaCena?: string[] | null): string {
  const textos = (textosNaCena ?? []).map((t) => t.trim()).filter(Boolean);
  if (textos.length === 0) return pedido.trim();
  return `${pedido.trim()} ${soOsTextosPedidos(textos)}`;
}

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
  /**
   * Fotos de referência: quando existem, o caminho vira EDIÇÃO em vez de
   * criação. O endpoint aceita `image[]`, inclusive para uma única foto.
   */
  referencias?: { bytes: Buffer; mime: string }[];
  largura: number;
  altura: number;
  qualidade: ChaveQualidade;
  /**
   * Os textos que devem aparecer DENTRO da cena, soletrados.
   *
   * Plural porque uma peça real tem manchete e apoio ("MUDE AINDA ESTE ANO" e
   * "63 e 81 m²"), e colá-los numa string só faria o modelo desenhar o
   * separador. Vazio é o caso comum: aí o modelo escreve o que quiser.
   *
   * Quem preenche é a ROTA, a partir do texto entre aspas do prompt que o
   * corretor aprovou — nunca a proposta do chat, que pode estar velha se ele
   * editou o campo antes de gerar.
   */
  textosNaCena?: string[] | null;
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
  // A partir daqui ninguém mais vê o texto cru: os dois caminhos abaixo leem
  // deste objeto, então a cláusula não tem como ser pulada por um deles.
  const pedidoFinal: PedidoDeImagem = {
    ...pedido,
    prompt: promptFinal(pedido.prompt, pedido.textosNaCena),
  };
  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), pedido.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    // Com referência a chamada é multipart (o arquivo vai no corpo); sem
    // referência é JSON. São dois endpoints diferentes, não um parâmetro.
    const comReferencia = (pedido.referencias?.length ?? 0) > 0;
    const resposta = comReferencia
      ? await fetch(URL_EDITAR, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: corpoDeEdicao(pedidoFinal, modelo, tamanho),
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
            prompt: pedidoFinal.prompt,
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

/**
 * O parâmetro se chama `tratado` e não `pedido` de propósito: o que chega aqui
 * JÁ passou por `promptFinal`. Com o nome antigo, o corpo desta função lia
 * `pedido.prompt` e ficava indistinguível — para quem lê e para a guarda — do
 * caminho que manda o texto cru.
 */
export function corpoDeEdicao(tratado: PedidoDeImagem, modelo: string, tamanho: string): FormData {
  const forma = new FormData();
  forma.append("model", modelo);
  forma.append("prompt", tratado.prompt);
  forma.append("size", tamanho);
  forma.append("quality", tratado.qualidade);
  forma.append("n", "1");
  for (const [indice, ref] of (tratado.referencias ?? []).entries()) {
    forma.append(
      "image[]",
      new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }),
      `referencia-${indice + 1}.png`,
    );
  }
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
