import { describe, expect, it } from "vitest";
import { formatarLembreteWhatsapp, situacaoDoLembrete } from "./lembretes";

describe("situação do lembrete (fuso de São Paulo)", () => {
  // 2026-09-06 15:00 em SP = 18:00 UTC.
  const agora = new Date("2026-09-06T18:00:00Z");

  it("hora que passou é vencido, mesmo que seja hoje", () => {
    expect(situacaoDoLembrete("2026-09-06T12:00:00-03:00", agora)).toBe("vencido");
  });

  it("mais tarde no MESMO dia de SP é 'hoje'", () => {
    expect(situacaoDoLembrete("2026-09-06T20:00:00-03:00", agora)).toBe("hoje");
  });

  it("depois da meia-noite de SP é futuro — mesmo quando o UTC ainda diz hoje", () => {
    // 2026-09-07 00:30 em SP = 2026-09-07T03:30Z; para o UTC de referência
    // (18h) ainda parece "hoje +9h", mas o dia de SP virou.
    expect(situacaoDoLembrete("2026-09-07T00:30:00-03:00", agora)).toBe("futuro");
  });
});

describe("mensagem de WhatsApp do lembrete", () => {
  it("leva o texto, o lead e o autor quando a nota veio de um colega", () => {
    const m = formatarLembreteWhatsapp({
      texto: "Ligar para confirmar a visita de sábado",
      leadNome: "Priscila Andrade",
      autorNome: "Matheus",
    });
    expect(m).toContain("⏰ *Lembrete*");
    expect(m).toContain("Ligar para confirmar a visita de sábado");
    expect(m).toContain("👤 Priscila Andrade");
    expect(m).toContain("Anotado por Matheus");
  });

  it("nota própria sem lead sai limpa — sem rodapé vazio", () => {
    const m = formatarLembreteWhatsapp({ texto: "Revisar a tabela nova" });
    expect(m.trim().endsWith("Revisar a tabela nova")).toBe(true);
  });
});
