import { describe, expect, it } from "vitest";
import {
  COMUNICADOS_POR_DIA,
  decidirEnvio,
  inicioDoDiaEmSaoPaulo,
  previsaoDaFila,
  primeiroNome,
  textoDoCorretor,
  validarTexto,
} from "./comunicadoRegras";

// Terça, 17/11/2026, 15h em São Paulo (18h UTC).
const TERCA_15H = new Date("2026-11-17T18:00:00Z");

describe("decidirEnvio", () => {
  const base = { agora: TERCA_15H, centralConectado: true, enviadosHoje: 0, ultimoEnvioEm: null };

  it("manda no horário comercial com o central conectado", () => {
    expect(decidirEnvio(base)).toEqual({ pode: true });
  });

  it("não manda com o central desconectado", () => {
    expect(decidirEnvio({ ...base, centralConectado: false })).toEqual({ pode: false, motivo: "central_fora" });
  });

  it("não manda de madrugada nem no domingo", () => {
    expect(decidirEnvio({ ...base, agora: new Date("2026-11-17T09:00:00Z") })).toEqual({ pode: false, motivo: "fora_do_horario" });
    expect(decidirEnvio({ ...base, agora: new Date("2026-11-22T18:00:00Z") })).toEqual({ pode: false, motivo: "fora_do_horario" });
  });

  it("para no teto do dia", () => {
    expect(decidirEnvio({ ...base, enviadosHoje: COMUNICADOS_POR_DIA })).toEqual({ pode: false, motivo: "teto_do_dia" });
    expect(decidirEnvio({ ...base, enviadosHoje: COMUNICADOS_POR_DIA - 1 })).toEqual({ pode: true });
  });

  it("espera pelo menos 4 min desde a última", () => {
    const tresMin = new Date(TERCA_15H.getTime() - 3 * 60 * 1000);
    const cincoMin = new Date(TERCA_15H.getTime() - 5 * 60 * 1000);
    expect(decidirEnvio({ ...base, ultimoEnvioEm: tresMin })).toEqual({ pode: false, motivo: "intervalo" });
    expect(decidirEnvio({ ...base, ultimoEnvioEm: cincoMin })).toEqual({ pode: true });
  });
});

describe("inicioDoDiaEmSaoPaulo", () => {
  it("é a meia-noite de São Paulo (03h UTC)", () => {
    expect(inicioDoDiaEmSaoPaulo(TERCA_15H).toISOString()).toBe("2026-11-17T03:00:00.000Z");
    // 01h UTC do dia 18 ainda é dia 17 em São Paulo.
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-18T01:00:00Z")).toISOString()).toBe("2026-11-17T03:00:00.000Z");
  });
});

describe("texto", () => {
  it("usa o primeiro nome, capitalizado", () => {
    expect(primeiroNome("  ANDRÉ souza ")).toBe("André");
    expect(primeiroNome("")).toBe("");
  });

  it("troca {nome} e varia o Oi pela ordem", () => {
    const modelo = "Oi, {nome}! Novidades.";
    expect(textoDoCorretor(modelo, "Ana Lima", 0)).toBe("Oi, Ana! Novidades.");
    expect(textoDoCorretor(modelo, "Bruno Reis", 1)).toBe("Olá, Bruno! Novidades.");
    expect(textoDoCorretor(modelo, "Paula", 2)).not.toBe(textoDoCorretor(modelo, "Paula", 1));
  });

  it("não mexe em texto que não começa com Oi", () => {
    expect(textoDoCorretor("Bom dia, {nome}.", "Ana", 1)).toBe("Bom dia, Ana.");
  });

  it("valida o tamanho", () => {
    expect(validarTexto("curto").ok).toBe(false);
    expect(validarTexto("x".repeat(2000)).ok).toBe(false);
    expect(validarTexto("Oi, {nome}! Tudo certo?")).toEqual({ ok: true, texto: "Oi, {nome}! Tudo certo?" });
  });

  it("estima a fila", () => {
    expect(previsaoDaFila(6)).toBe("cerca de 30 minutos, no horário comercial");
    expect(previsaoDaFila(25)).toBe("3 dias úteis (até 10 por dia)");
  });
});
