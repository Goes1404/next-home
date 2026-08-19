/**
 * Módulo de Transcrição e Compreensão de Áudios do WhatsApp usando Gemini 2.0 Flash Multimodal.
 */

export interface ResultadoAudio {
  textoTranscrito: string;
  intencaoResumida: string;
  sucesso: boolean;
}

/**
 * Frases com que o modelo responde quando NÃO transcreveu nada — porque o
 * áudio não chegou, veio corrompido ou ele simplesmente se recusou.
 *
 * Sem esta checagem, a recusa entra no banco como se fosse a fala da pessoa.
 * Aconteceu em produção: a conversa 5511937696256 tem, gravado como mensagem
 * do corretor, o texto "Nenhum áudio fornecido. Por favor, forneça o texto
 * do áudio do cliente…". Isso não só polui o histórico do CRM como alimenta
 * o próprio agente, que passa a responder a um pedido que ninguém fez.
 *
 * Os padrões são de META-CONVERSA — o modelo falando com quem o chamou. Um
 * cliente descrevendo imóvel não diz "não recebi nenhum áudio" nem "sou um
 * modelo de linguagem", então o risco de descartar transcrição boa é baixo.
 */
const PADROES_DE_RECUSA: RegExp[] = [
  /\bnenhum\s+[áa]udio\b/i,
  /\b(n[ãa]o|sem)\s+(recebi|foi\s+fornecido|h[áa])\s+.{0,20}[áa]udio\b/i,
  /\bpor\s+favor,?\s+forne[çc]a\b/i,
  /\bforne[çc]a\s+o\s+(texto|[áa]udio|arquivo)\b/i,
  /\bn[ãa]o\s+(consigo|posso|é\s+poss[íi]vel)\s+.{0,25}transcrever\b/i,
  /\bn[ãa]o\s+tenho\s+acesso\s+ao\s+[áa]udio\b/i,
  /\b(sou|como)\s+um[a]?\s+(modelo\s+de\s+linguagem|intelig[êe]ncia\s+artificial|IA)\b/i,
  /*
   * Aceita ligação entre as palavras ("o áudio está corrompido"). Sem `\b`
   * na frente: em JavaScript a fronteira de palavra é ASCII, e entre o
   * espaço e o "á" de "áudio" não existe fronteira nenhuma — o padrão nunca
   * casaria.
   */
  /[áa]udio\b.{0,15}\b(vazio|inv[áa]lido|corrompido|ileg[íi]vel)\b/i,
];

/** A transcrição é, na verdade, o modelo dizendo que não transcreveu? */
export function pareceRecusaDeTranscricao(texto: string): boolean {
  const limpo = texto?.trim();
  if (!limpo) return true;
  return PADROES_DE_RECUSA.some((padrao) => padrao.test(limpo));
}

const PROMPT_AUDIO = `Você é um assistente especializado em transcrever e compreender áudios de clientes imobiliários de alto padrão em Alphaville e região.
Transcreva fielmente a fala do cliente e, caso haja termos em português coloquial ou gírias, preserve o significado original.

Responda EXCLUSIVAMENTE um JSON no seguinte formato:
{
  "textoTranscrito": "Transcrição completa do que o cliente falou",
  "intencaoResumida": "Resumo em 1 frase da intenção principal do cliente (ex: quer saber o preço do 3 suítes, quer agendar visita no sábado, etc)"
}`;

/**
 * Transcreve áudio enviado no WhatsApp via base64 ou URL utilizando Gemini Multimodal.
 */
export async function transcreverAudioWhatsapp(
  audioBase64OrUrl: string,
  mimeType: string = "audio/ogg",
): Promise<ResultadoAudio> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey || !audioBase64OrUrl) {
    return {
      textoTranscrito: "[Áudio recebido — não foi possível transcrever automaticamente]",
      intencaoResumida: "Transcrição indisponível: ouça o áudio original no WhatsApp.",
      sucesso: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Se for URL, baixa o buffer e converte para base64
    let dadosBase64 = audioBase64OrUrl;
    if (audioBase64OrUrl.startsWith("http://") || audioBase64OrUrl.startsWith("https://")) {
      const resBuffer = await fetch(audioBase64OrUrl, { signal: controller.signal });
      if (resBuffer.ok) {
        const arrayBuffer = await resBuffer.arrayBuffer();
        dadosBase64 = Buffer.from(arrayBuffer).toString("base64");
      }
    } else if (audioBase64OrUrl.includes("base64,")) {
      dadosBase64 = audioBase64OrUrl.split("base64,")[1];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT_AUDIO },
                {
                  inlineData: {
                    mimeType: mimeType || "audio/ogg",
                    data: dadosBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (texto) {
        const parsed = JSON.parse(texto);
        const transcrito = String(parsed.textoTranscrito ?? "");

        // Resposta 200 não é garantia de transcrição: o modelo pode ter
        // devolvido, educadamente, que não transcreveu nada. Isso não pode
        // virar fala do cliente no histórico.
        if (!pareceRecusaDeTranscricao(transcrito)) {
          return {
            textoTranscrito: transcrito,
            intencaoResumida: parsed.intencaoResumida || "Mensagem de voz sobre imóveis.",
            sucesso: true,
          };
        }

        console.warn("[audioTranscriber] resposta recusada pelo modelo, caindo no fallback:", transcrito.slice(0, 120));
      }
    }
  } catch (err) {
    console.error("Erro ao transcrever áudio no Gemini:", err);
  }

  // `sucesso: false` e o texto precisam contar a MESMA história: dizer
  // "processado com sucesso" aqui faria o corretor ler o card no CRM e
  // acreditar numa transcrição que nunca aconteceu.
  return {
    textoTranscrito: "[Áudio recebido — não foi possível transcrever automaticamente]",
    intencaoResumida: "Transcrição indisponível: ouça o áudio original no WhatsApp.",
    sucesso: false,
  };
}
