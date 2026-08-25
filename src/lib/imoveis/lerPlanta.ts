import { extrairJsonDeTexto } from "@/lib/whatsapp/llmTipos";
import { modeloOpenai } from "@/lib/whatsapp/openai";
import { lerFichaDeMetragens, metragemPelaFicha } from "./fichaTecnica";

/**
 * Lê uma planta e devolve a tipologia que ela representa.
 *
 * A imagem SOZINHA não basta, e isso foi medido no book do Dom Parque: o
 * título ("Confort · 1 dormitório · 49 m² · 1 ou 2 vagas") é texto VETORIAL
 * da página, não pixel da imagem — a imagem extraída traz o desenho e, com
 * sorte, um "PLANTA TIPO FINAL 11". Por isso a chamada leva as duas coisas:
 * a planta e o texto do PDF inteiro, para o modelo casar uma com a outra.
 *
 * Não passa por `llm.ts` porque o contrato é outro (mensagem multimodal, com
 * a imagem embutida), mesma razão pela qual `groqAudio.ts` também mora fora.
 * O motor é o mesmo do atendimento — `gpt-4.1-mini` enxerga imagem.
 *
 * O que vem daqui é PROPOSTA de cadastro, e cadastro vira ficha no prompt do
 * bot: o que entrar errado aqui a IA afirma ao cliente. Daí a validação
 * determinística — o modelo pode chutar, os limites não deixam passar.
 */

const BASE_URL = "https://api.openai.com/v1/chat/completions";

/** Teto do prompt: o texto do deck inteiro cabe, e o resto é rodapé repetido. */
const TETO_DE_TEXTO = 12_000;

export type TipologiaDaPlanta = {
  nome: string;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  /** Área privativa em m². */
  metragem: number | null;
};

/**
 * Faixas do que existe em apartamento. Servem contra o chute: o modelo
 * confunde "145 torres" da construtora com o prédio (aconteceu), e confunde
 * área comum com privativa.
 */
const LIMITES = {
  dormitorios: 6,
  suites: 6,
  banheiros: 8,
  vagas: 8,
  metragemMinima: 20,
  metragemMaxima: 800,
} as const;

function inteiroAte(valor: unknown, teto: number): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > teto) return null;
  return Math.round(n);
}

/** Separada da chamada de rede para ser testável sem modelo nenhum. */
export function interpretarTipologia(bruto: unknown, textoDoPdf = ""): TipologiaDaPlanta | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const cru = bruto as Record<string, unknown>;

  const nome = typeof cru.nome === "string" ? cru.nome.trim() : "";
  if (!nome) return null;

  const dormitorios = inteiroAte(cru.dormitorios, LIMITES.dormitorios);
  if (dormitorios === null) return null;

  return {
    nome: nome.slice(0, 80),
    dormitorios,
    // Suíte é dormitório com banheiro: não pode haver mais suíte que quarto.
    suites: Math.min(inteiroAte(cru.suites, LIMITES.suites) ?? 0, dormitorios),
    banheiros: inteiroAte(cru.banheiros, LIMITES.banheiros) ?? 0,
    vagas: inteiroAte(cru.vagas, LIMITES.vagas) ?? 0,
    // A metragem NÃO vem do modelo: vem da ficha técnica, pelo final que ele
    // leu na imagem. Foi assim que se resolveu o erro de 51,8 m² numa planta
    // de 47,75 — o modelo escolhia entre as nove metragens do book.
    metragem: metragemPelaFicha(lerFichaDeMetragens(textoDoPdf), {
      final: typeof cru.final === "string" ? cru.final : null,
    }),
  };
}

function montarPrompt(textoDoPdf: string): string {
  return `A imagem é a planta de um apartamento, tirada da apresentação abaixo.

Devolva SÓ um JSON com a tipologia que ESTA planta representa:
{"nome":"","dormitorios":0,"suites":0,"banheiros":0,"vagas":0,"final":""}

Regras:
- "nome" é como a apresentação chama esta planta (ex.: "Confort 1 dorm.",
  "Prime 2 dorms", "Max 3 dorms"). Se não houver nome, descreva pela
  composição: "2 dormitórios, 1 suíte".
- "final" é o número da unidade escrito NA IMAGEM ("PLANTA TIPO FINAL 11",
  ou o quadradinho destacado no diagrama do pavimento). Só o que estiver
  desenhado na planta vale; se não houver, devolva "".
- Conte dormitórios, suítes, banheiros e vagas DESTA planta.
- NÃO devolva metragem: o m² sai da ficha técnica, não da sua leitura.
- O nome da tipologia quase sempre está no TEXTO, não desenhado na imagem:
  use o texto para identificar qual é esta planta, conferindo com o que você
  vê (número de quartos, de banheiros, varanda).
- Se não der para saber com segurança, devolva 0 no campo — não invente.
- NUNCA inclua preço.

Texto da apresentação:
${textoDoPdf.slice(0, TETO_DE_TEXTO)}`;
}

/**
 * Confere o final com uma pergunta SÓ sobre ele, sem o texto do deck junto.
 *
 * Medido: quando a planta não traz o final desenhado, o modelo não responde
 * "não sei" — ele chuta, e chuta o mesmo número que viu em outra página
 * ("11"). Isso dava a área do apartamento de 1 dormitório para plantas de 2.
 *
 * Duas leituras independentes concordarem num número inventado é bem menos
 * provável que uma só; e quando o número ESTÁ escrito na imagem, as duas
 * concordam sempre. É a mesma ideia do voto: caro seria pedir três.
 */
async function confirmarFinal(
  imagem: Buffer,
  mime: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: modeloOpenai(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  'Esta imagem é a planta de um apartamento. Está escrito nela o número do final ' +
                  '(por exemplo "PLANTA TIPO FINAL 11", ou um quadradinho destacado num diagrama)? ' +
                  'Responda SÓ com JSON: {"final":"11"} se estiver escrito, ou {"final":""} se não estiver. ' +
                  "Não deduza pelo tipo de apartamento: só vale o que está desenhado.",
              },
              { type: "image_url", image_url: { url: `data:${mime};base64,${imagem.toString("base64")}` } },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!resposta.ok) return null;
    const corpo = await resposta.json();
    const json = extrairJsonDeTexto(corpo?.choices?.[0]?.message?.content ?? "");
    const final = (json as { final?: unknown } | null)?.final;
    return typeof final === "string" && final.trim() ? final.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type ResultadoLeituraPlanta =
  | { ok: true; tipologia: TipologiaDaPlanta }
  | { ok: false; motivo: "sem_api_key" | "modelo_indisponivel" | "resposta_inutil" };

/**
 * @param imagem bytes da planta (JPEG ou PNG), já extraída do PDF.
 * @param textoDoPdf texto do deck, de onde saem nome e metragem.
 */
export async function lerPlanta(
  imagem: Buffer,
  mime: string,
  textoDoPdf: string,
  opts: { timeoutMs?: number } = {},
): Promise<ResultadoLeituraPlanta> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, motivo: "sem_api_key" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);

  try {
    const resposta = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modeloOpenai(),
        messages: [
          {
            role: "system",
            content:
              "Você responde SOMENTE com um objeto JSON válido, sem cercas de código e sem texto antes ou depois.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: montarPrompt(textoDoPdf) },
              {
                type: "image_url",
                // Data URI: a planta pode estar num bucket público, mas
                // mandar os bytes evita depender de o modelo alcançar a URL.
                image_url: { url: `data:${mime};base64,${imagem.toString("base64")}` },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      console.error(`[planta] modelo recusou: HTTP ${resposta.status} ${corpo.slice(0, 200)}`);
      return { ok: false, motivo: "modelo_indisponivel" };
    }

    const corpo = await resposta.json();
    const texto: string | undefined = corpo?.choices?.[0]?.message?.content;
    if (!texto) return { ok: false, motivo: "resposta_inutil" };

    const bruto = extrairJsonDeTexto(texto) as Record<string, unknown> | null;
    const primeiraLeitura = typeof bruto?.final === "string" ? bruto.final : null;

    // Metragem só entra com o final CONFIRMADO por uma segunda leitura.
    const confirmado = primeiraLeitura
      ? await confirmarFinal(imagem, mime, apiKey, opts.timeoutMs ?? 25_000)
      : null;
    const mesmoNumero =
      confirmado !== null &&
      primeiraLeitura !== null &&
      confirmado.match(/\d+/)?.[0] === primeiraLeitura.match(/\d+/)?.[0];

    const tipologia = interpretarTipologia(
      { ...bruto, final: mesmoNumero ? primeiraLeitura : "" },
      textoDoPdf,
    );

    if (process.env.DEBUG_PLANTA) {
      console.warn(`[planta] final: leu ${JSON.stringify(primeiraLeitura)}, confirmou ${JSON.stringify(confirmado)}`);
    }

    return tipologia ? { ok: true, tipologia } : { ok: false, motivo: "resposta_inutil" };
  } catch (erro) {
    console.error("[planta] falha ao ler:", erro);
    return { ok: false, motivo: "modelo_indisponivel" };
  } finally {
    clearTimeout(timeout);
  }
}
