import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  base64DoAudio,
  cabeNaDuracao,
  instrucaoDoAudio,
  pareceAlucinacaoConhecida,
  transcreverAudioWhatsapp,
  transcricaoAceitavel,
} from "./audioTranscriber";
import { textoDosTrechos } from "./groqAudio";

const AUDIO = Buffer.alloc(2000, 7).toString("base64");

describe("o áudio que vai para a transcrição", () => {
  it("URL nunca vira base64: é o arquivo cifrado do WhatsApp", () => {
    expect(base64DoAudio("https://mmg.whatsapp.net/v/t62/abc.enc?ccb=11")).toBeNull();
  });
  it("resto de erro curto não é áudio", () => {
    expect(base64DoAudio("data:audio/ogg;base64,AAA")).toBeNull();
  });
  it("aceita o base64 com ou sem prefixo", () => {
    expect(base64DoAudio(AUDIO)).toBe(AUDIO);
    expect(base64DoAudio(`data:audio/ogg;base64,${AUDIO}`)).toBe(AUDIO);
  });
});

describe("travas contra fala inventada", () => {
  it("frases que o Whisper tira do silêncio", () => {
    expect(pareceAlucinacaoConhecida("Legendas pela comunidade Amara.org")).toBe(true);
    expect(pareceAlucinacaoConhecida("Obrigado por assistir!")).toBe(true);
    expect(pareceAlucinacaoConhecida("Se inscreva no canal")).toBe(true);
    expect(pareceAlucinacaoConhecida("Quero ver o apartamento sábado")).toBe(false);
  });
  it("texto que não cabe na duração do áudio", () => {
    const longo = "quero saber o preço do apartamento de três suítes com duas vagas e lazer completo perto do shopping";
    expect(cabeNaDuracao(longo, 2)).toBe(false);
    expect(cabeNaDuracao(longo, 10)).toBe(true);
    expect(cabeNaDuracao(longo, null)).toBe(true);
  });
  it("fala quase toda inaudível não conta", () => {
    expect(transcricaoAceitavel("[inaudível] [inaudível]")).toBe(false);
    expect(transcricaoAceitavel("Oi, tudo bem? [inaudível] sábado")).toBe(true);
  });
  it("Whisper: trecho que ele acha sem fala sai fora", () => {
    expect(
      textoDosTrechos({
        segments: [
          { text: " Oi, pode ser sábado?", no_speech_prob: 0.05, avg_logprob: -0.2 },
          { text: " Legendas pela comunidade Amara.org", no_speech_prob: 0.92, avg_logprob: -0.3 },
        ],
      }),
    ).toBe("Oi, pode ser sábado?");
  });
});

describe("a cadeia de motores", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "x");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("devolve a transcrição e marca quando há trecho inaudível", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: "Oi, queria ver o [inaudível] no sábado" })),
    ) as typeof fetch;
    const r = await transcreverAudioWhatsapp({ base64: AUDIO, segundos: 4 });
    expect(r.sucesso).toBe(true);
    expect(r.parcial).toBe(true);
    expect(r.motor).toBe("openai");
    expect(instrucaoDoAudio(r)).toMatch(/repita|escreva/);
  });

  it("alucinação vira falha, não fala do cliente", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: "Legendas pela comunidade Amara.org" })),
    ) as typeof fetch;
    const r = await transcreverAudioWhatsapp({ base64: AUDIO, segundos: 3 });
    expect(r.sucesso).toBe(false);
    expect(r.motivo).toBe("nao_entendido");
  });

  it("sem áudio decifrado nem chama motor nenhum", async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await transcreverAudioWhatsapp({ base64: "https://mmg.whatsapp.net/x.enc" });
    expect(r.sucesso).toBe(false);
    expect(r.motivo).toBe("sem_audio");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("guarda de código", () => {
  const fonte = readFileSync("src/lib/whatsapp/audioTranscriber.ts", "utf8");
  const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
  it("o prompt não diz ao modelo de que assunto é o áudio", () => {
    const prompt = fonte.slice(fonte.indexOf("const PROMPT_AUDIO"), fonte.indexOf("type Tentativa"));
    expect(prompt).not.toMatch(/imobili|im[óo]ve|alphaville|su[íi]te/i);
  });
  it("o webhook pede o áudio decifrado à Evolution e não anexa palpite de intenção", () => {
    expect(webhook).toContain("baixarMidiaDoProvedor(");
    expect(webhook).not.toMatch(/intenção detectada no áudio: \$\{/);
  });
});
