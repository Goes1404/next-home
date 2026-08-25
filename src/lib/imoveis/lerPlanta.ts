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

/**
 * A metragem só vale se o modelo mostrar DE ONDE tirou.
 *
 * O deck do Dom Parque lista nove metragens e a imagem não diz qual é a
 * dela — o título fica em texto vetorial da página, que a extração não
 * associa à imagem. Sem esta amarra o modelo escolhe uma metragem
 * plausível e erra: mediu-se 51,8 m² para a planta de 47,75. Metragem
 * errada é pior que metragem ausente, porque a IA afirma o número ao
 * cliente e ele confere na visita.
 */
/**
 * Compara pelo conteúdo, não pelos sinais. O modelo devolve "m²" e
 * "artística" com acento; a extração do PDF nem sempre. Exigir igualdade
 * literal reprovaria citação legítima — foi o que aconteceu na primeira
 * medição, e a metragem certa (47,75) foi descartada junto com os chutes.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/[^a-z0-9,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metragemAncorada(
  metragem: number | null,
  trecho: unknown,
  textoDoPdf: string,
): number | null {
  if (metragem === null) return null;
  // Fragmento ("51,37 m") não é citação: é o número recortado do meio do
  // deck, e foi assim que a metragem de 1 dormitório veio parar numa planta
  // de 2. Legenda de planta é uma frase.
  if (typeof trecho !== "string" || trecho.trim().length < 25) {
    if (process.env.DEBUG_PLANTA) console.warn("[planta] trecho curto demais:", trecho);
    return null;
  }

  if (!normalizar(textoDoPdf).includes(normalizar(trecho))) {
    if (process.env.DEBUG_PLANTA) console.warn("[planta] trecho não confere:", JSON.stringify(trecho));
    return null;
  }

  // A frase citada precisa conter o número que ele diz ter lido nela.
  const comVirgula = metragem.toFixed(2).replace(".", ",");
  const inteiro = String(Math.trunc(metragem));
  return trecho.includes(comVirgula) || trecho.includes(String(metragem)) || trecho.includes(inteiro)
    ? metragem
    : null;
}

/** Separada da chamada de rede para ser testável sem modelo nenhum. */
export function interpretarTipologia(bruto: unknown, textoDoPdf = ""): TipologiaDaPlanta | null {
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
    metragem: metragemAncorada(metragem, cru.trechoDaMetragem, textoDoPdf),
  };
}

function montarPrompt(textoDoPdf: string): string {
  return `A imagem é a planta de um apartamento, tirada da apresentação abaixo.

Devolva SÓ um JSON com a tipologia que ESTA planta representa:
{"nome":"","dormitorios":0,"suites":0,"banheiros":0,"vagas":0,"metragem":0,"trechoDaMetragem":""}

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
- "trechoDaMetragem" é a FRASE do texto, copiada literalmente, que informa a
  área desta planta (ex.: "Planta artística do Apartamento de 1 dormitório de
  47,75 m² - final 11"). O deck lista várias metragens: só vale a que a frase
  copiada disser. Se você não encontrar a frase desta planta, devolva
  "trechoDaMetragem" vazio e metragem 0 — chutar entre as metragens do
  empreendimento é o erro que mais atrapalha.
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
    const tipologia = texto ? interpretarTipologia(extrairJsonDeTexto(texto), textoDoPdf) : null;

    return tipologia ? { ok: true, tipologia } : { ok: false, motivo: "resposta_inutil" };
  } catch (erro) {
    console.error("[planta] falha ao ler:", erro);
    return { ok: false, motivo: "modelo_indisponivel" };
  } finally {
    clearTimeout(timeout);
  }
}
