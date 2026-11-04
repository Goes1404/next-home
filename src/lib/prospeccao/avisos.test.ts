import { describe, expect, it } from "vitest";
import { avisoDeAbertura, paraEncerrar, resumoDoDia } from "./avisos";
import { followupDevido, proximaAcao, semResposta } from "./funil";

const agora = new Date("2026-11-10T12:00:00Z");
const base = {
  nome: "Padaria X",
  etapa: "enviado",
  nao_contatar: false,
  enviado_em: "2026-11-09T12:00:00Z",
  ultima_visita_em: null as string | null,
  visitas: 0,
  updated_at: "2026-11-09T12:00:00Z",
  followup_em: null as string | null,
};

describe("aviso de abertura", () => {
  const loja = { id: "abc", nome: "Padaria X", etapa: "enviado", nao_contatar: false };

  it("avisa a primeira abertura de loja abordada", () => {
    const a = avisoDeAbertura(loja, [], agora);
    expect(a?.titulo).toBe("Padaria X abriu a amostra");
    expect(a?.url).toBe("/plataforma/prospeccao/abc");
  });

  it("não avisa loja ainda não abordada (somos nós olhando)", () => {
    expect(avisoDeAbertura({ ...loja, etapa: "novo" }, [], agora)).toBeNull();
    expect(avisoDeAbertura({ ...loja, nao_contatar: true }, [], agora)).toBeNull();
  });

  it("não repete em menos de 12 h, avisa a volta depois disso", () => {
    expect(avisoDeAbertura(loja, ["2026-11-10T08:00:00Z"], agora)).toBeNull();
    expect(avisoDeAbertura(loja, ["2026-11-09T08:00:00Z"], agora)?.titulo).toBe("Padaria X voltou à amostra");
  });
});

describe("régua do follow-up", () => {
  it("follow-up no 3º dia, ou no 1º se abriu", () => {
    expect(followupDevido(base, agora)).toBe(false);
    expect(followupDevido({ ...base, enviado_em: "2026-11-07T11:00:00Z" }, agora)).toBe(true);
    expect(followupDevido({ ...base, ultima_visita_em: "2026-11-10T09:00:00Z", visitas: 1 }, agora)).toBe(true);
    expect(followupDevido({ ...base, enviado_em: "2026-11-07T11:00:00Z", followup_em: "2026-11-10T09:00:00Z" }, agora)).toBe(false);
  });

  it("encerra 4 dias depois do follow-up, salvo se abriu há pouco", () => {
    const velho = { ...base, enviado_em: "2026-11-01T12:00:00Z", followup_em: "2026-11-05T12:00:00Z" };
    expect(semResposta(velho, agora)).toBe(true);
    expect(paraEncerrar([velho, base], agora)).toHaveLength(1);
    expect(semResposta({ ...velho, ultima_visita_em: "2026-11-09T12:00:00Z", visitas: 1 }, agora)).toBe(false);
    expect(proximaAcao({ ...velho, followup_em: "2026-11-09T12:00:00Z" }, agora)).toBe("Follow-up enviado: aguardando");
  });
});

describe("resumo do dia", () => {
  it("junta o que fazer hoje numa notificação", () => {
    const r = resumoDoDia(
      [
        { ...base, nome: "A", etapa: "novo", enviado_em: null },
        { ...base, nome: "B", ultima_visita_em: "2026-11-10T09:00:00Z", visitas: 1 },
        { ...base, nome: "C", enviado_em: "2026-11-06T12:00:00Z" },
        { ...base, nome: "D", etapa: "respondeu" },
      ],
      agora,
    );
    expect(r?.corpo).toBe("1 respondeu e espera você · 1 abriu a amostra (B) · 2 follow-ups para mandar · 1 loja nova para abordar.");
  });

  it("não manda nada quando não há o que fazer", () => {
    expect(resumoDoDia([{ ...base, etapa: "perdido" }], agora)).toBeNull();
  });
});
