import { describe, expect, it } from "vitest";
import { mesmoNumero, numeroDoJid, participantesDaResposta } from "./participantesDoGrupo";

// Os formatos abaixo são os que a Evolution v2 é conhecida por devolver em
// `GET /group/participants/{instance}?groupJid=`. Não foram colhidos de um
// número real: a leitura tem de aguentar todos e, na dúvida, devolver
// `numero: null` (nunca inventar o número).

describe("numeroDoJid", () => {
  it("tira os dígitos de um JID de pessoa", () => {
    expect(numeroDoJid("5511987654321@s.whatsapp.net")).toBe("5511987654321");
    expect(numeroDoJid("5511987654321@c.us")).toBe("5511987654321");
  });

  it("ignora o sufixo de aparelho (:12)", () => {
    expect(numeroDoJid("5511987654321:12@s.whatsapp.net")).toBe("5511987654321");
  });

  it("não tem número em @lid, em grupo nem em vazio", () => {
    expect(numeroDoJid("123456789012345@lid")).toBeNull();
    expect(numeroDoJid("120363000000000000@g.us")).toBeNull();
    expect(numeroDoJid("")).toBeNull();
    expect(numeroDoJid(null)).toBeNull();
    expect(numeroDoJid(undefined)).toBeNull();
    expect(numeroDoJid("@s.whatsapp.net")).toBeNull();
    expect(numeroDoJid("abc@s.whatsapp.net")).toBeNull();
    expect(numeroDoJid("5511987654321")).toBeNull();
  });
});

describe("participantesDaResposta", () => {
  it("lê a lista dentro de { participants }", () => {
    const r = participantesDaResposta({
      participants: [{ id: "5511987654321@s.whatsapp.net", admin: null }],
    });
    expect(r).toEqual([{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }]);
  });

  it("lê a lista quando a resposta é o array puro", () => {
    const r = participantesDaResposta([{ id: "5511987654321@s.whatsapp.net" }]);
    expect(r).toEqual([{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }]);
  });

  it("id @lid com phoneNumber traz o número do par", () => {
    const r = participantesDaResposta({
      participants: [
        { id: "123456789012345@lid", phoneNumber: "5511987654321@s.whatsapp.net", admin: "admin" },
      ],
    });
    expect(r).toEqual([{ id: "123456789012345@lid", numero: "5511987654321" }]);
  });

  it("id @lid com jid alternativo traz o número do par", () => {
    const r = participantesDaResposta([
      { id: "123456789012345@lid", jid: "5511987654321@s.whatsapp.net" },
    ]);
    expect(r).toEqual([{ id: "123456789012345@lid", numero: "5511987654321" }]);
  });

  it("phoneNumber só com dígitos também vale", () => {
    const r = participantesDaResposta([{ id: "123456789012345@lid", phoneNumber: "5511987654321" }]);
    expect(r).toEqual([{ id: "123456789012345@lid", numero: "5511987654321" }]);
  });

  it("@lid sem número fica com numero null", () => {
    expect(participantesDaResposta([{ id: "123456789012345@lid" }])).toEqual([
      { id: "123456789012345@lid", numero: null },
    ]);
  });

  it("número alternativo que não é número de pessoa não vale", () => {
    const r = participantesDaResposta([
      { id: "123456789012345@lid", phoneNumber: "123456789012345@lid", jid: "120363000000000000@g.us" },
    ]);
    expect(r).toEqual([{ id: "123456789012345@lid", numero: null }]);
  });

  it("id com número ganha de campo alternativo divergente", () => {
    const r = participantesDaResposta([
      { id: "5511987654321@s.whatsapp.net", phoneNumber: "5521999999999@s.whatsapp.net" },
    ]);
    expect(r).toEqual([{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }]);
  });

  it("ignora lixo sem quebrar", () => {
    const r = participantesDaResposta({
      participants: [
        null,
        undefined,
        7,
        "texto",
        [],
        {},
        { id: "" },
        { id: 42 },
        { id: "sem-arroba" },
        { id: "5511987654321@s.whatsapp.net" },
      ],
    });
    expect(r).toEqual([{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }]);
  });

  it("resposta que não é lista vira lista vazia", () => {
    expect(participantesDaResposta(null)).toEqual([]);
    expect(participantesDaResposta("erro")).toEqual([]);
    expect(participantesDaResposta({})).toEqual([]);
    expect(participantesDaResposta({ participants: "x" })).toEqual([]);
  });

  it("mistura de formatos na mesma lista", () => {
    const r = participantesDaResposta({
      participants: [
        { id: "5511987654321@s.whatsapp.net", admin: null },
        { id: "123456789012345@lid", phoneNumber: "5511912345678@s.whatsapp.net", admin: "admin" },
        { id: "999999999999999@lid" },
      ],
    });
    expect(r.map((p) => p.numero)).toEqual(["5511987654321", "5511912345678", null]);
  });
});

describe("mesmoNumero", () => {
  it("com e sem o 55", () => {
    expect(mesmoNumero("5511987654321", "11987654321")).toBe(true);
    expect(mesmoNumero("11987654321", "5511987654321")).toBe(true);
  });

  it("com e sem o 9 do celular", () => {
    expect(mesmoNumero("551187654321", "5511987654321")).toBe(true);
    expect(mesmoNumero("1187654321", "11987654321")).toBe(true);
    expect(mesmoNumero("5511987654321", "551187654321")).toBe(true);
  });

  it("números diferentes", () => {
    expect(mesmoNumero("5511987654321", "5511987654322")).toBe(false);
    expect(mesmoNumero("5511987654321", "5521987654321")).toBe(false);
  });

  it("formatação: +, espaços, traços e parênteses", () => {
    expect(mesmoNumero("+55 (11) 98765-4321", "11987654321")).toBe(true);
    expect(mesmoNumero("+55 11 98765-4321", "55-11-98765-4321")).toBe(true);
  });

  it("fixo (sem 9) não casa com celular de outro número", () => {
    expect(mesmoNumero("1134567890", "11934567890")).toBe(false);
    expect(mesmoNumero("551134567890", "5511934567890")).toBe(false);
    expect(mesmoNumero("1134567890", "1134567890")).toBe(true);
  });

  it("DDD 55 não é confundido com o código do país", () => {
    expect(mesmoNumero("55991234567", "5555991234567")).toBe(true);
    expect(mesmoNumero("55991234567", "11991234567")).toBe(false);
  });

  it("vazio ou sem dígitos nunca casa", () => {
    expect(mesmoNumero("", "")).toBe(false);
    expect(mesmoNumero("", "5511987654321")).toBe(false);
    expect(mesmoNumero("5511987654321", "")).toBe(false);
    expect(mesmoNumero("abc", "abc")).toBe(false);
  });
});
