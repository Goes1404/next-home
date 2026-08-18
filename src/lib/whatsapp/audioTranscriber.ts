/**
 * Módulo de Transcrição e Compreensão de Áudios do WhatsApp usando Gemini 2.0 Flash Multimodal.
 */

export interface ResultadoAudio {
  textoTranscrito: string;
  intencaoResumida: string;
  sucesso: boolean;
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
        return {
          textoTranscrito: parsed.textoTranscrito || "[Transcrição indisponível]",
          intencaoResumida: parsed.intencaoResumida || "Mensagem de voz sobre imóveis.",
          sucesso: true,
        };
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
