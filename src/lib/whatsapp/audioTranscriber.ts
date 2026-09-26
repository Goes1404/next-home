/**
 * Transcrição dos áudios que o cliente manda no WhatsApp.
 *
 * A alucinação relatada em 26/09/2026 tinha duas causas somadas:
 *
 * 1. O áudio que ia para o modelo era RUÍDO. O webhook passava
 *    `audioMessage.url`, que aponta para o arquivo CIFRADO do WhatsApp
 *    (`mmg.whatsapp.net/…enc`); e quando o download falhava, a própria URL
 *    seguia como se fosse base64. O arquivo decifrado agora vem da Evolution
 *    (`baixarMidiaDoProvedor`), e URL nunca é tratada como áudio.
 * 2. O prompt ENSINAVA a inventar: dizia que o áudio era de "clientes
 *    imobiliários de alto padrão em Alphaville" e dava como exemplo "quer
 *    saber o preço do 3 suítes". Diante de ruído, o modelo escrevia
 *    exatamente isso. Hoje o prompt é neutro, manda marcar trecho que não se
 *    entende e deixa o modelo dizer que não entendeu.
 *
 * Ordem dos motores: transcrição dedicada da OpenAI (a chave paga que já
 * atende), Whisper da Groq com o filtro de "sem fala" por trecho, e o Gemini
 * por último — modelo generativo é o que mais completa o que não ouviu.
 */
import { groqAudioConfigurado, transcreverComGroq } from "./groqAudio";

export interface ResultadoAudio {
  textoTranscrito: string;
  sucesso: boolean;
  /** Parte da fala ficou marcada como inaudível: a IA deve perguntar, não supor. */
  parcial: boolean;
  /** Quem transcreveu, para a telemetria. */
  motor?: "openai" | "groq" | "gemini";
  motivo?: "sem_audio" | "nao_entendido";
}

export interface EntradaAudio {
  /** O arquivo JÁ DECIFRADO, em base64. URL não serve: ver o cabeçalho. */
  base64: string | null;
  mimeType?: string | null;
  /** Duração declarada pelo WhatsApp (`audioMessage.seconds`). */
  segundos?: number | null;
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
  /*
   * O modelo AGUARDANDO em vez de transcrever. Isto foi para o banco em
   * produção como se fosse fala de quem mandou o áudio:
   *
   *   "Aguardando a fala do cliente para transcrever.
   *    [intenção detectada no áudio: Pronto para transcrever e resumir a
   *     intenção do cliente.]"
   *
   * Nenhum dos padrões acima pega: não há negação nem pedido de arquivo, é
   * o modelo anunciando que está pronto para começar. O sinal seguro é a
   * TERCEIRA PESSOA — ninguém descrevendo um imóvel se chama de "o
   * cliente" nem fala em "resumir a intenção".
   */
  /\baguardando\b.{0,30}\btranscrever\b/i,
  /\bpronto\s+para\s+(transcrever|receber)\b/i,
  /\b(envie|mande|compartilhe)\s+o\s+([áa]udio|arquivo)\b/i,
  /\bfala\s+do\s+cliente\b/i,
  /\bresumir\s+a\s+inten[çc][ãa]o\b/i,
];

/** A transcrição é, na verdade, o modelo dizendo que não transcreveu? */
export function pareceRecusaDeTranscricao(texto: string): boolean {
  const limpo = texto?.trim();
  if (!limpo) return true;
  return PADROES_DE_RECUSA.some((padrao) => padrao.test(limpo));
}

/**
 * A transcrição tem conteúdo de verdade, ou é só pontuação e ruído?
 *
 * O Whisper não recusa como o Gemini: diante de um áudio sem fala ele
 * devolve `"."` ou `" "`, com HTTP 200. Sem esta checagem esse ponto entrava
 * no histórico da conversa COMO SE FOSSE FALA DO CLIENTE, e a IA respondia
 * a ele. Flagrado testando a reserva com um áudio de tom puro.
 */
export function transcricaoTemConteudo(texto: string): boolean {
  const limpo = texto?.trim() ?? "";
  // Tira pontuação e espaços: o que sobra precisa ser palavra.
  const letras = limpo.replace(/[\s.,!?;:—–\-…"']/g, "");
  return letras.length >= 2;
}

/**
 * Frases que o Whisper produz a partir de SILÊNCIO ou ruído — vêm do corpus
 * de legendas de vídeo em que ele foi treinado. Nenhum cliente fala isso num
 * áudio para a imobiliária.
 */
const ALUCINACOES_CONHECIDAS: RegExp[] = [
  /amara\.org/i,
  /legendas?\s+(pela|por|da)\b/i,
  /\blegendado\s+por\b/i,
  /obrigad[oa]\s+por\s+(assistir|ver|acompanhar)/i,
  /inscrev[ae](-se)?\s+(no|n[oa]\s+nosso)\s+canal/i,
  /\bsubtitles?\s+by\b/i,
  /thanks?\s+(you\s+)?for\s+watching/i,
];

export function pareceAlucinacaoConhecida(texto: string): boolean {
  return ALUCINACOES_CONHECIDAS.some((p) => p.test(texto));
}

export const MARCA_INAUDIVEL = "[inaudível]";

/**
 * Mais palavras do que cabem na duração do áudio é sinal de texto inventado.
 * Fala rápida em português chega a ~3,5 palavras por segundo; 6 por segundo,
 * com folga de 4 palavras para áudio curtíssimo, não é fala humana.
 */
export function cabeNaDuracao(texto: string, segundos: number | null | undefined): boolean {
  if (!segundos || segundos <= 0) return true;
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return palavras <= segundos * 6 + 4;
}

/** O que sobra de fala depois de tirar as marcas de inaudível. */
function falaUtil(texto: string): string {
  return texto.split(MARCA_INAUDIVEL).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * A transcrição é aceitável como fala do cliente? Junta todas as travas:
 * recusa do modelo, ruído, alucinação conhecida, excesso para a duração e
 * fala que é quase toda inaudível.
 */
export function transcricaoAceitavel(texto: string, segundos?: number | null): boolean {
  const limpo = texto?.trim() ?? "";
  if (!limpo) return false;
  if (pareceRecusaDeTranscricao(limpo)) return false;
  if (pareceAlucinacaoConhecida(limpo)) return false;
  const util = falaUtil(limpo);
  if (!transcricaoTemConteudo(util)) return false;
  if (!cabeNaDuracao(util, segundos)) return false;
  return true;
}

const FALHA = (motivo: "sem_audio" | "nao_entendido"): ResultadoAudio => ({
  textoTranscrito: "[Áudio recebido — não foi possível transcrever automaticamente]",
  sucesso: false,
  parcial: false,
  motivo,
});

/**
 * Prompt NEUTRO de propósito. Dizer ao modelo de que assunto é o áudio é
 * dar a ele o texto para inventar quando não ouvir nada.
 */
const PROMPT_AUDIO = `Transcreva literalmente, em português, a fala deste áudio de WhatsApp.

Regras:
- Escreva só o que foi de fato dito, palavra por palavra. Não resuma, não corrija, não complete frases e não acrescente nada.
- Trecho que você não entende com segurança vira ${MARCA_INAUDIVEL}. Nunca adivinhe uma palavra.
- Se não houver fala (silêncio, ruído, música, áudio cortado), devolva "texto" vazio e "haFala": false.
- Não descreva o áudio e não fale com quem pediu a transcrição.

Responda só JSON: {"haFala": true|false, "texto": "..."}`;

type Tentativa = { ok: true; texto: string } | { ok: false; erro: string };

async function transcreverComOpenAI(base64: string, mimeType: string): Promise<Tentativa> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, erro: "sem_api_key" };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(base64, "base64")], { type: mimeType }), `audio.${extensaoDo(mimeType)}`);
    form.append("model", process.env.OPENAI_AUDIO_MODEL || "gpt-4o-mini-transcribe");
    form.append("language", "pt");
    form.append("response_format", "json");
    // Mesma ideia do prompt do Gemini: pedir literalidade, sem assunto.
    form.append("prompt", "Transcrição literal de um áudio de WhatsApp em português do Brasil.");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, erro: `http_${res.status}` };
    const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
    const texto = typeof json?.text === "string" ? json.text.trim() : "";
    return texto ? { ok: true, texto } : { ok: false, erro: "resposta_vazia" };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.name : String(err) };
  }
}

async function transcreverComGemini(base64: string, mimeType: string): Promise<Tentativa> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { ok: false, erro: "sem_api_key" };
  const modelo = process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: PROMPT_AUDIO }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    clearTimeout(t);
    if (!res.ok) return { ok: false, erro: `http_${res.status}` };
    const json = await res.json();
    const bruto = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!bruto) return { ok: false, erro: "resposta_vazia" };
    const parsed = JSON.parse(bruto) as { haFala?: unknown; texto?: unknown };
    if (parsed.haFala === false) return { ok: false, erro: "sem_fala" };
    const texto = typeof parsed.texto === "string" ? parsed.texto.trim() : "";
    return texto ? { ok: true, texto } : { ok: false, erro: "resposta_vazia" };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.name : String(err) };
  }
}

function extensaoDo(mimeType: string): string {
  return mimeType.includes("mpeg")
    ? "mp3"
    : mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("webm")
          ? "webm"
          : "ogg";
}

/** Tira o `data:...;base64,` e recusa o que não é base64 (uma URL, por exemplo). */
export function base64DoAudio(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const semPrefixo = entrada.includes("base64,") ? entrada.split("base64,")[1] : entrada;
  const limpo = semPrefixo.replace(/\s+/g, "");
  if (/^https?:/i.test(limpo) || !/^[A-Za-z0-9+/]+=*$/.test(limpo)) return null;
  // Menos de ~1 KB não é um áudio de voz: é resto de erro.
  return limpo.length >= 1200 ? limpo : null;
}

/**
 * Transcreve o áudio do cliente. Nunca devolve fala que não passou pelas
 * travas: na dúvida, `sucesso: false`, e o webhook pede ao cliente que
 * escreva — resposta honesta custa menos que resposta a uma fala inventada.
 */
export async function transcreverAudioWhatsapp(entrada: EntradaAudio): Promise<ResultadoAudio> {
  const base64 = base64DoAudio(entrada.base64);
  if (!base64) return FALHA("sem_audio");
  const mimeType = (entrada.mimeType || "audio/ogg").split(";")[0].trim() || "audio/ogg";
  const segundos = entrada.segundos ?? null;

  const motores: Array<{ nome: "openai" | "groq" | "gemini"; tentar: () => Promise<Tentativa> }> = [
    { nome: "openai", tentar: () => transcreverComOpenAI(base64, mimeType) },
    {
      nome: "groq",
      tentar: async () => {
        if (!groqAudioConfigurado()) return { ok: false, erro: "sem_api_key" };
        const r = await transcreverComGroq(base64, mimeType);
        return r.ok ? { ok: true, texto: r.texto } : { ok: false, erro: r.erro };
      },
    },
    { nome: "gemini", tentar: () => transcreverComGemini(base64, mimeType) },
  ];

  for (const motor of motores) {
    const r = await motor.tentar();
    if (!r.ok) {
      if (r.erro !== "sem_api_key") console.warn(`[audio] ${motor.nome} não transcreveu: ${r.erro}`);
      continue;
    }
    if (!transcricaoAceitavel(r.texto, segundos)) {
      console.warn(`[audio] ${motor.nome} devolveu texto recusado pelas travas:`, r.texto.slice(0, 120));
      continue;
    }
    return {
      textoTranscrito: r.texto,
      sucesso: true,
      parcial: r.texto.includes(MARCA_INAUDIVEL),
      motor: motor.nome,
    };
  }
  return FALHA("nao_entendido");
}

/**
 * Instrução para o turno quando a mensagem é um áudio. Não repete a fala:
 * diz à IA que o texto é TRANSCRIÇÃO, que pode ter erro, e o que fazer com
 * o trecho inaudível.
 */
export function instrucaoDoAudio(resultado: ResultadoAudio): string {
  const base =
    "A última mensagem do cliente foi um ÁUDIO, e você está lendo a transcrição automática dele. Responda só ao que está escrito; não suponha o que ele quis dizer além disso.";
  return resultado.parcial
    ? `${base} Parte do áudio ficou ${MARCA_INAUDIVEL}: se o trecho que faltou importa para responder, peça em UMA frase curta que ele repita essa parte ou escreva. Não invente o que estava ali.`
    : `${base} Se a transcrição parecer sem sentido ou contraditória, pergunte em vez de adivinhar.`;
}
