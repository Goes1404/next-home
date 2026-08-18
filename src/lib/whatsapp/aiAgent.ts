import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

export interface ContextoAtendimento {
  nomeCorretor: string;
  creciCorretor: string;
  telefoneCorretor: string;
  nomeAssistente: string;
  tomVoz: string;
  catalogo: Empreendimento[];
  historicoMensagens: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
}

export interface AnexoMidiaIA {
  tipo: "foto" | "planta" | "video" | "tour360";
  url: string;
  titulo: string;
}

export interface RespostaAgenteIA {
  textoResposta: string;
  sugerirVisita: boolean;
  transferirHumano: boolean;
  motivoTransferencia?: string;
  empreendimentoCitado?: string;
  imoveisRecomendados: { nome: string; slug: string; preco: number | null; fotoUrl?: string }[];
  anexosMidia: AnexoMidiaIA[];
}

/**
 * Gera o prompt de sistema personalizado com RAG do catálogo da Next Home.
 */
export function construirPromptSistema(ctx: ContextoAtendimento): string {
  const resumoCatalogo = ctx.catalogo
    .slice(0, 10)
    .map((e) => {
      const preco = e.precoAPartir ? formatarMoedaBRL(e.precoAPartir) : "Consulte";
      const midiasDisponiveis = [
        e.capa?.url ? `Foto de Capa (${e.capa.url})` : null,
        e.bookUrl ? `Book Digital PDF (${e.bookUrl})` : null,
        e.plantas?.length ? `Plantas (${e.plantas.map((p) => p.url).join(", ")})` : null,
        e.videos?.length ? `Vídeo Cinema (${e.videos[0]?.url})` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${e.nome} (${e.bairro}, ${e.cidade}): ${e.status}, Tipo: ${e.tipo}, Preço a partir de: ${preco}. Destaques: ${e.tagline || e.descricao.slice(0, 100)}. Mídias: ${midiasDisponiveis}`;
    })
    .join("\n");

  return `Você é ${ctx.nomeAssistente}, a assistente virtual de inteligência imobiliária do consultor ${ctx.nomeCorretor} (CRECI ${ctx.creciCorretor}) da Next Home em Alphaville.

Seu objetivo é acolher leads de alto padrão de forma humanizada, elegante, objetiva e consultiva.

DIRETRIZES FUNDAMENTAIS:
1. Responda de forma concisa e natural, ideal para leitura rápida no WhatsApp (máximo 2 a 4 parágrafos curtos).
2. Utilize o catálogo oficial abaixo para responder sobre valores, bairros, plantas e mídias:
${resumoCatalogo}
3. Se o cliente pedir fotos, plantas, tour ou vídeo de um imóvel, selecione e anexe no campo "anexosMidia".
4. Nunca invente dados que não estão no catálogo. Se não souber, diga que ${ctx.nomeCorretor} trará essa informação com precisão.
5. Identifique o perfil do cliente (orçamento, se tem filhos, se tem pets, se busca moradia ou investimento).
6. Se o cliente demonstrar intenção de visitar ou pedir para falar com um humano, acolha e informe que ${ctx.nomeCorretor} entrará em contato.

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON EXCLUSIVO, sem crases markdown ou texto extra):
{
  "textoResposta": "Mensagem que será enviada diretamente no WhatsApp do cliente.",
  "sugerirVisita": true | false,
  "transferirHumano": true | false,
  "motivoTransferencia": "Motivo se transferirHumano for true ou null",
  "empreendimentoCitado": "Nome do empreendimento principal se citado ou null",
  "imoveisRecomendados": [
    { "nome": "Nome do Imovel", "slug": "slug-do-imovel", "preco": 1500000 }
  ],
  "anexosMidia": [
    { "tipo": "foto" | "planta" | "video" | "tour360", "url": "URL da foto ou planta", "titulo": "Descrição do anexo" }
  ]
}`;
}

/**
 * Processa a mensagem do cliente usando Gemini 2.0 Flash com RAG do catálogo.
 */
export async function gerarRespostaIA(
  ctx: ContextoAtendimento,
  mensagemCliente: string,
): Promise<RespostaAgenteIA> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return {
      textoResposta: `Olá! Sou a ${ctx.nomeAssistente}, assistente do consultor ${ctx.nomeCorretor}. Recebi sua mensagem e já avisei o ${ctx.nomeCorretor} para te responder em instantes!`,
      sugerirVisita: false,
      transferirHumano: true,
      motivoTransferencia: "API Key não configurada (Fallback)",
      imoveisRecomendados: [],
      anexosMidia: [],
    };
  }

  const promptSistema = construirPromptSistema(ctx);

  const historicoFormatado = ctx.historicoMensagens
    .map((m) => `${m.remetente === "cliente" ? "Cliente" : ctx.nomeAssistente}: ${m.texto}`)
    .join("\n");

  const entradaPrompt = `${promptSistema}\n\n--- HISTÓRICO DA CONVERSA ---\n${historicoFormatado}\nCliente: ${mensagemCliente}\n${ctx.nomeAssistente}:`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: entradaPrompt }] }],
          generationConfig: {
            temperature: 0.2,
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
          textoResposta: parsed.textoResposta || "Olá! Como posso ajudar você hoje?",
          sugerirVisita: Boolean(parsed.sugerirVisita),
          transferirHumano: Boolean(parsed.transferirHumano),
          motivoTransferencia: parsed.motivoTransferencia || undefined,
          empreendimentoCitado: parsed.empreendimentoCitado || undefined,
          imoveisRecomendados: Array.isArray(parsed.imoveisRecomendados) ? parsed.imoveisRecomendados : [],
          anexosMidia: Array.isArray(parsed.anexosMidia) ? parsed.anexosMidia : [],
        };
      }
    }
  } catch (err) {
    console.error("Erro ao chamar Gemini 2.0 Flash no agente de WhatsApp:", err);
  }

  return {
    textoResposta: `Olá! Recebi sua mensagem sobre nossos imóveis em Alphaville. Estou avisando o ${ctx.nomeCorretor} para te dar um atendimento personalizado em instantes!`,
    sugerirVisita: false,
    transferirHumano: true,
    motivoTransferencia: "Erro na IA / Fallback",
    imoveisRecomendados: [],
    anexosMidia: [],
  };
}
