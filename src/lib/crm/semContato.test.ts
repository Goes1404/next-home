import { describe, expect, it } from "vitest";
import { haQuantoTempo, textoDeLeadSemContato } from "./semContato";

describe("aviso de lead sem contato", () => {
  it("diz o tamanho do atraso", () => {
    expect(haQuantoTempo(35)).toBe("há 35 min");
    expect(haQuantoTempo(130)).toBe("há 2h");
  });

  it("nomeia o lead, a origem e leva à ficha", () => {
    const t = textoDeLeadSemContato({ nome: "Ana", origem: "ZAP Imóveis", minutos: 40, fichaUrl: "https://x/l/1" });
    expect(t).toMatch(/Ana pediu contato pelo ZAP Imóveis há 40 min/);
    expect(t.endsWith("https://x/l/1")).toBe(true);
  });
});
