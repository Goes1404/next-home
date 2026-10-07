import { afterEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

import sharp from "sharp";
import { extrairDeImagem } from "./importacao";

async function foto(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: "#ffffff" } })
    .png()
    .toBuffer();
}

describe("Importação — a foto vai primeiro para o motor do atendimento", () => {
  afterEach(() => {
    chamarLlmJson.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("manda a foto como JPEG em detalhe alto e devolve os contatos lidos", async () => {
    chamarLlmJson.mockResolvedValue({
      ok: true,
      json: { leads: [{ nome: "Ana Prado", telefone: "(11) 99123-4567" }] },
    });

    const r = await extrairDeImagem(await foto(), "image/png");

    const [, opts] = chamarLlmJson.mock.calls[0];
    expect(opts.detalheImagem).toBe("high");
    expect(opts.imagens[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(r.metodo).toBe("ia");
    expect(r.candidatos.map((c) => c.nome)).toEqual(["Ana Prado"]);
  });

  it("se o motor falhar, o Gemini tenta", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "timeout", latenciaMs: 1 });
    vi.stubEnv("GEMINI_API_KEY", "x");
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"leads":[{"nome":"Bia","telefone":"11988887777"}]}' }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await extrairDeImagem(await foto(), "image/png");

    expect(fetchFalso).toHaveBeenCalledOnce();
    expect(r.candidatos.map((c) => c.nome)).toEqual(["Bia"]);
  });

  it("arquivo que nem o sharp abre (HEIC) vai direto ao Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    const r = await extrairDeImagem(Buffer.from("nao-e-imagem"), "image/heic");
    expect(chamarLlmJson).not.toHaveBeenCalled();
    expect(r.candidatos).toHaveLength(0);
  });
});
