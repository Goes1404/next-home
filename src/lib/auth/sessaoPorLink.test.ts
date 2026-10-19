import { describe, expect, it } from "vitest";
import { JANELA_DO_LINK_S, sessaoAbertaPorLink } from "./sessaoPorLink";

const AGORA = 1_792_448_121;

describe("sessaoAbertaPorLink", () => {
  it("o link do convite e da recuperação gravam otp (medido no Auth local) e valem por 15 minutos", () => {
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: AGORA }] }, AGORA)).toBe(true);
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: AGORA - JANELA_DO_LINK_S }] }, AGORA)).toBe(true);
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: AGORA - JANELA_DO_LINK_S - 1 }] }, AGORA)).toBe(false);
  });

  it("os nomes que versões do GoTrue já gravaram também valem", () => {
    for (const method of ["recovery", "invite", "magiclink"]) {
      expect(sessaoAbertaPorLink({ amr: [{ method, timestamp: AGORA - 10 }] }, AGORA), method).toBe(true);
    }
  });

  it("login com senha não é link, nem se a pessoa entrou agora", () => {
    expect(sessaoAbertaPorLink({ amr: [{ method: "password", timestamp: AGORA }] }, AGORA)).toBe(false);
  });

  it("basta uma entrada de link recente na lista", () => {
    const amr = [
      { method: "password", timestamp: AGORA - 3600 },
      { method: "otp", timestamp: AGORA - 120 },
    ];
    expect(sessaoAbertaPorLink({ amr }, AGORA)).toBe(true);
  });

  it("sem amr, amr torto ou timestamp no futuro distante não vale", () => {
    expect(sessaoAbertaPorLink(null, AGORA)).toBe(false);
    expect(sessaoAbertaPorLink({}, AGORA)).toBe(false);
    expect(sessaoAbertaPorLink({ amr: "otp" }, AGORA)).toBe(false);
    expect(sessaoAbertaPorLink({ amr: [null, { method: "otp" }, { timestamp: AGORA }] }, AGORA)).toBe(false);
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: String(AGORA) }] }, AGORA)).toBe(false);
    // Relógio do servidor um minuto atrás do Auth ainda aceita; uma hora, não.
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: AGORA + 60 }] }, AGORA)).toBe(true);
    expect(sessaoAbertaPorLink({ amr: [{ method: "otp", timestamp: AGORA + 3600 }] }, AGORA)).toBe(false);
  });
});
