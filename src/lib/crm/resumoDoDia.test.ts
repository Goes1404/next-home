import { describe, expect, it } from "vitest";
import {
  diaEmSP,
  horaDeMandarResumo,
  montarResumoDoDia,
  MAXIMO_POR_SECAO,
} from "./resumoDoDia";

describe("hora de mandar o resumo — fuso de São Paulo", () => {
  it("8h de SP é 11h UTC: manda", () => {
    expect(horaDeMandarResumo(new Date("2026-09-26T11:05:00Z"), null)).toBe(true);
  });

  it("7h de SP (10h UTC) ainda não", () => {
    expect(horaDeMandarResumo(new Date("2026-09-26T10:30:00Z"), null)).toBe(false);
  });

  it("depois do meio-dia não manda mais: é notícia velha", () => {
    expect(horaDeMandarResumo(new Date("2026-09-26T15:30:00Z"), null)).toBe(false);
  });

  it("já mandado hoje não manda de novo", () => {
    const agora = new Date("2026-09-26T11:05:00Z");
    expect(horaDeMandarResumo(agora, "2026-09-26")).toBe(false);
    expect(horaDeMandarResumo(agora, "2026-09-25")).toBe(true);
  });

  it("às 22h de SP o dia ainda é o de SP, não o de UTC", () => {
    expect(diaEmSP(new Date("2026-09-27T01:00:00Z"))).toBe("2026-09-26");
  });
});

describe("texto do resumo", () => {
  const vazio = { nomeCorretor: "Bruna Lima", visitas: [], esperando: [], novos: [], lembretes: [] };

  it("sem nada a dizer, não manda nada", () => {
    expect(montarResumoDoDia(vazio, "https://x")).toBeNull();
  });

  it("cumprimenta pelo primeiro nome e dá um link por item", () => {
    const texto = montarResumoDoDia(
      {
        ...vazio,
        visitas: [{ titulo: "10:00 Ana Prado", detalhe: "Vitra", link: "https://x/corretor/leads/1" }],
      },
      "https://x",
    )!;
    expect(texto).toMatch(/^Bom dia, Bruna!/);
    expect(texto).toContain("*Visitas de hoje (1)*");
    expect(texto).toContain("https://x/corretor/leads/1");
    expect(texto).not.toContain("Esperando sua resposta");
  });

  it("corta cada seção no teto e diz quantos sobraram", () => {
    const muitos = Array.from({ length: MAXIMO_POR_SECAO + 3 }, (_, i) => ({
      titulo: `Pessoa ${i}`,
      link: `https://x/${i}`,
    }));
    const texto = montarResumoDoDia({ ...vazio, novos: muitos }, "https://x")!;
    expect(texto).toContain(`*Leads novos (24h) (${MAXIMO_POR_SECAO + 3})*`);
    expect(texto).toContain("e mais 3");
    expect(texto).not.toContain(`Pessoa ${MAXIMO_POR_SECAO}`);
  });
});
