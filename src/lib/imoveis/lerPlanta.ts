import { extrairJsonDeTexto } from "@/lib/whatsapp/llmTipos";
import { modeloOpenai } from "@/lib/whatsapp/openai";

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
export function interpretarTipologia(bruto: unknown): TipologiaDaPlanta | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const cru = bruto as Record<string, unknown>;

  const nome = typeof cru.nome === "string" ? cru.nome.trim() : "";
  if (!nome) return null;

  const dormitorios = inteiroAte(cru.dormitorios, LIMITES.dormitorios);
  if (dormitorios === null) return null;

  const metragemCrua = typeof cru.metragem === "number" ? cru.metragem : Number(cru.metragem);
  const metragem =
    Number.isFinite(metragemCrua) &&
    metragemCrua >= LIMITES.metragemMinima &&
    metragemCrua <= LIMITES.metragemMaxima
      ? Math.round(metragemCrua * 100) / 100
      : null;

  return {
    nome: nome.slice(0, 80),
    dormitorios,
    // Suíte é dormitório com banheiro: não pode haver mais suíte que quarto.
    suites: Math.min(inteiroAte(cru.suites, LIMITES.suites) ?? 0, dormitorios),
    banheiros: inteiroAte(cru.banheiros, LIMITES.banheiros) ?? 0,
    vagas: inteiroAte(cru.vagas, LIMITES.vagas) ?? 0,
    metragem,
  };
}

function montarPrompt(textoDoPdf: string): string {
  return `A imagem é a planta de um apartamento, tirada da apresentação abaixo.

Devolva SÓ um JSON com a tipologia que ESTA planta representa:
{"nome":"","dormitorios":0,"suites":0,"banheiros":0,"vagas":0,"metragem":0}

Regras:
- "nome" é como a apresentação chama esta planta (ex.: "Confort 1 dorm.",
  "Prime 2 dorms", "Max 3 dorms"). Se não houver nome, descreva pela
  composição: "2 dormitórios, 1 suíte".
- "metragem" é a área PRIVATIVA em m², nunca a área do terreno nem a
  construída do empreendimento inteiro.
- Conte dormitórios, suítes, banheiros e vagas DESTA planta.
- O título e a metragem quase sempre estão no TEXTO, não desenhados na
  imagem: use o texto para identificar de qual tipologia é esta planta,
  conferindo com o que você vê (número de quartos, de banheiros, varanda).
- Se não der para saber com segurança, devolva 0 no campo — não invente.
- NUNCA inclua preço.

Texto da apresentação:
${textoDoPdf.slice(0, TETO_DE_TEXTO)}`;
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
    const tipologia = texto ? interpretarTipologia(extrairJsonDeTexto(texto)) : null;

    return tipologia ? { ok: true, tipologia } : { ok: false, motivo: "resposta_inutil" };
  } catch (erro) {
    console.error("[planta] falha ao ler:", erro);
    return { ok: false, motivo: "modelo_indisponivel" };
  } finally {
    clearTimeout(timeout);
  }
}
