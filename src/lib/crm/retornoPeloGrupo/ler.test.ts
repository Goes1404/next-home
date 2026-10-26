import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/llm", () => ({
  algumProvedorConfigurado: vi.fn(),
  chamarLlmJson: vi.fn(),
}));

import { algumProvedorConfigurado, chamarLlmJson } from "@/lib/whatsapp/llm";
import { agoraEmSaoPaulo, encurtarRelato, lerRetornoDaLigacao } from "./ler";

const provedor = vi.mocked(algumProvedorConfigurado);
const llm = vi.mocked(chamarLlmJson);

const AGORA = new Date("2026-10-26T17:05:00.000Z");

function pedido(extra: Partial<Parameters<typeof lerRetornoDaLigacao>[0]> = {}) {
  return {
    relato: "falei com a Ana, quer 3 quartos até 600 mil, visita sábado 10h",
    fichaAtual: "Ana, 11 99999-0000",
    dossieAtual: null,
    agora: AGORA,
    ...extra,
  };
}

function respostaOk(json: unknown) {
  return { ok: true, json, latenciaMs: 800, tokensEntrada: 1200, tokensSaida: 150, modelo: "teste" } as const;
}

beforeEach(() => {
  provedor.mockReset().mockReturnValue(true);
  llm.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lerRetornoDaLigacao", () => {
  it("relato com menos de 3 caracteres: ok false, sem chamar o modelo", async () => {
    expect(await lerRetornoDaLigacao(pedido({ relato: " a " }))).toEqual({ ok: false });
    expect(llm).not.toHaveBeenCalled();
  });

  it("sem provedor de IA: ok false, sem chamar o modelo", async () => {
    provedor.mockReturnValue(false);
    expect(await lerRetornoDaLigacao(pedido())).toEqual({ ok: false });
    expect(llm).not.toHaveBeenCalled();
  });

  it("chamada que falha: ok false", async () => {
    llm.mockResolvedValue({ ok: false, erro: "timeout", latenciaMs: 15000 } as never);
    expect(await lerRetornoDaLigacao(pedido())).toEqual({ ok: false });
  });

  it("JSON que o normalizador não entende: ok false", async () => {
    llm.mockResolvedValue(respostaOk({ resultado: "talvez" }));
    expect(await lerRetornoDaLigacao(pedido())).toEqual({ ok: false });
    llm.mockResolvedValue(respostaOk("texto solto"));
    expect(await lerRetornoDaLigacao(pedido())).toEqual({ ok: false });
  });

  it("chamarLlmJson lançando: ok false, não lança", async () => {
    llm.mockRejectedValue(new Error("rede caiu"));
    await expect(lerRetornoDaLigacao(pedido())).resolves.toEqual({ ok: false });
  });

  it("sucesso: devolve a leitura normalizada e os tokens", async () => {
    llm.mockResolvedValue(
      respostaOk({
        resultado: "atendeu",
        etapa: "visita_agendada",
        visitaEm: "2026-10-31T10:00:00-03:00",
        fatos: { dormitoriosMin: 3, orcamentoMax: 600000 },
      }),
    );
    const r = await lerRetornoDaLigacao(pedido());
    expect(r).toEqual({
      ok: true,
      leitura: {
        resultado: "atendeu",
        etapa: "visita_agendada",
        visitaEm: "2026-10-31T13:00:00.000Z",
        motivoPerda: null,
        resumo: null,
        proximoPasso: null,
        fatos: { dormitoriosMin: 3, orcamentoMax: 600000 },
      },
      tokensEntrada: 1200,
      tokensSaida: 150,
    });
  });

  it("chama o modelo com temperatura 0.1 e orçamento de 15 s", async () => {
    llm.mockResolvedValue(respostaOk({ resultado: "atendeu" }));
    await lerRetornoDaLigacao(pedido());
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][1]).toMatchObject({ temperature: 0.1, orcamentoMs: 15000 });
  });

  it("o prompt leva o agora de São Paulo, a ficha, o dossiê e o relato", async () => {
    llm.mockResolvedValue(respostaOk({ resultado: "atendeu" }));
    await lerRetornoDaLigacao(pedido({ dossieAtual: "orçamento até 500 mil" }));
    const prompt = llm.mock.calls[0][0];
    expect(prompt).toContain("segunda-feira, 26/10/2026 14:05");
    expect(prompt).toContain("Ana, 11 99999-0000");
    expect(prompt).toContain("orçamento até 500 mil");
    expect(prompt).toContain("visita sábado 10h");
    expect(prompt).toContain("-03:00");
  });
});

describe("agoraEmSaoPaulo", () => {
  it("formata com dia da semana no fuso de São Paulo", () => {
    expect(agoraEmSaoPaulo(AGORA)).toBe("segunda-feira, 26/10/2026 14:05");
  });

  it("depois das 21h em São Paulo (já é o dia seguinte em UTC) segue no dia de São Paulo", () => {
    // 22:30 em São Paulo de sábado = 01:30 UTC de domingo
    expect(agoraEmSaoPaulo(new Date("2026-11-01T01:30:00Z"))).toBe("sábado, 31/10/2026 22:30");
  });
});

describe("encurtarRelato", () => {
  it("relato dentro do teto passa inteiro", () => {
    const r = "a".repeat(4000);
    expect(encurtarRelato(r)).toBe(r);
  });

  it("relato acima do teto guarda os 1500 primeiros e os 2500 últimos, ligados por […]", () => {
    const r = "I".repeat(1500) + "M".repeat(3000) + "F".repeat(2500);
    expect(encurtarRelato(r)).toBe("I".repeat(1500) + " […] " + "F".repeat(2500));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("7000"));
  });

  it("o desfecho no fim do relato longo chega ao prompt", async () => {
    llm.mockResolvedValue(respostaOk({ resultado: "atendeu" }));
    await lerRetornoDaLigacao(pedido({ relato: "x".repeat(6000) + " marquei sábado 10h" }));
    expect(llm.mock.calls[0][0]).toContain("marquei sábado 10h");
  });
});
