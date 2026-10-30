import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { montarVocabulario, TETO_DE_IMOVEIS } = await import("./vocabulario");
const { promptDaTranscricao, TETO_DO_VOCABULARIO } = await import("@/lib/whatsapp/audioTranscriber");

describe("vocabulário da transcrição do central", () => {
  it("jargão do CRM e nomes dos imóveis, sem repetir, com teto", () => {
    const v = montarVocabulario(["Dom Parque Barueri", "Vitra", "Vitra", " "]);
    expect(v).toContain("lead");
    expect(v).toContain("lista de transmissão");
    expect(v.match(/Vitra/g)).toHaveLength(1);
    const muitos = montarVocabulario(Array.from({ length: 60 }, (_, i) => `Imóvel ${i}`));
    expect(muitos).toContain(`Imóvel ${TETO_DE_IMOVEIS - 1}`);
    expect(muitos).not.toContain(`Imóvel ${TETO_DE_IMOVEIS}`);
  });

  it("vira dica no prompt da transcrição, curta; sem vocabulário, o prompt de sempre", () => {
    expect(promptDaTranscricao()).toBe("Transcrição literal de um áudio de WhatsApp em português do Brasil.");
    const p = promptDaTranscricao(montarVocabulario(["Dom Parque Barueri"]));
    expect(p).toMatch(/Termos que podem aparecer: .*Dom Parque Barueri\./);
    expect(promptDaTranscricao("x".repeat(5000)).length).toBeLessThan(TETO_DO_VOCABULARIO + 120);
  });
});
