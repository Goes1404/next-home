import { describe, expect, it } from "vitest";
import {
  dentroDoHorarioDeAviso,
  horaEmSaoPaulo,
  precisaAvisar,
  textoDoAvisoSemResposta,
} from "./clienteSemResposta";

const agora = new Date("2026-10-06T15:00:00Z"); // 12h em São Paulo
const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();

describe("precisaAvisar", () => {
  it("abaixo de 30 minutos ainda é conversa normal", () => {
    expect(precisaAvisar({ inicioDaEspera: minutosAtras(20), ultimaRespostaNossa: null, avisadoEm: null, agora }).avisar).toBe(false);
  });

  it("30 minutos sem resposta e nunca avisado: avisa", () => {
    const r = precisaAvisar({ inicioDaEspera: minutosAtras(35), ultimaRespostaNossa: minutosAtras(60), avisadoEm: null, agora });
    expect(r).toEqual({ avisar: true, minutos: 35 });
  });

  it("uma vez por espera: avisado depois da última resposta nossa não avisa de novo", () => {
    expect(
      precisaAvisar({ inicioDaEspera: minutosAtras(90), ultimaRespostaNossa: minutosAtras(120), avisadoEm: minutosAtras(50), agora }).avisar,
    ).toBe(false);
  });

  it("sem resposta nossa nenhuma, o aviso anterior vale para sempre", () => {
    expect(precisaAvisar({ inicioDaEspera: minutosAtras(90), ultimaRespostaNossa: null, avisadoEm: minutosAtras(50), agora }).avisar).toBe(false);
  });

  it("depois que alguém respondeu, uma espera nova ganha aviso novo", () => {
    expect(
      precisaAvisar({ inicioDaEspera: minutosAtras(40), ultimaRespostaNossa: minutosAtras(60), avisadoEm: minutosAtras(300), agora }).avisar,
    ).toBe(true);
  });

  it("mais de 24 horas não é notícia de agora", () => {
    expect(precisaAvisar({ inicioDaEspera: minutosAtras(25 * 60), ultimaRespostaNossa: null, avisadoEm: null, agora }).avisar).toBe(false);
  });

  it("data inválida não vira aviso", () => {
    expect(precisaAvisar({ inicioDaEspera: "lixo", ultimaRespostaNossa: null, avisadoEm: null, agora }).avisar).toBe(false);
  });
});

describe("horário do aviso", () => {
  it("usa a hora de São Paulo, não a do servidor", () => {
    // 01h UTC = 22h de Brasília do dia anterior.
    expect(horaEmSaoPaulo(new Date("2026-10-07T01:00:00Z"))).toBe(22);
  });

  it("das 7h às 21h59", () => {
    expect(dentroDoHorarioDeAviso(new Date("2026-10-06T10:00:00Z"))).toBe(true); // 7h
    expect(dentroDoHorarioDeAviso(new Date("2026-10-07T00:59:00Z"))).toBe(true); // 21h59
    expect(dentroDoHorarioDeAviso(new Date("2026-10-07T01:00:00Z"))).toBe(false); // 22h
    expect(dentroDoHorarioDeAviso(new Date("2026-10-06T09:59:00Z"))).toBe(false); // 6h59
  });
});

describe("texto do aviso", () => {
  it("uma pessoa: diz quando a IA está desligada", () => {
    const t = textoDoAvisoSemResposta([{ nome: "Ana", minutos: 45, iaDesligada: true, link: "https://x/c" }], "https://x");
    expect(t).toContain("Ana escreveu há 45 min");
    expect(t).toContain("IA está desligada");
    expect(t).toContain("https://x/c");
  });

  it("várias pessoas: uma mensagem só, a mais antiga primeiro", () => {
    const t = textoDoAvisoSemResposta(
      [
        { nome: "Bia", minutos: 40, iaDesligada: false, link: "l1" },
        { nome: "Caio", minutos: 200, iaDesligada: true, link: "l2" },
      ],
      "https://x",
    );
    expect(t.startsWith("💬 2 pessoas")).toBe(true);
    expect(t.indexOf("Caio")).toBeLessThan(t.indexOf("Bia"));
    expect(t).toContain("há 3h (IA desligada)");
  });

  it("teto na lista", () => {
    const muitas = Array.from({ length: 9 }, (_, i) => ({ nome: `P${i}`, minutos: 40 + i, iaDesligada: false, link: "l" }));
    expect(textoDoAvisoSemResposta(muitas, "https://x")).toContain("e mais 3 pessoas");
  });
});
