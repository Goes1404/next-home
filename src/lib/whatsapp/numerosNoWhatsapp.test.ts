import { describe, expect, it } from "vitest";
import { lerRespostaDeNumeros } from "./numerosNoWhatsapp";

describe("lerRespostaDeNumeros", () => {
  it("lê exists por número", () => {
    const r = lerRespostaDeNumeros(["5511999990001", "5511999990002"], [
      { exists: true, jid: "5511999990001@s.whatsapp.net", number: "5511999990001" },
      { exists: false, jid: "5511999990002@s.whatsapp.net", number: "5511999990002" },
    ]);
    expect(r.get("5511999990001")).toBe(true);
    expect(r.get("5511999990002")).toBe(false);
  });

  it("casa o celular com e sem o nono dígito", () => {
    const r = lerRespostaDeNumeros(["5511999990001"], [{ exists: true, jid: "551199990001@s.whatsapp.net", number: "551199990001" }]);
    expect(r.get("5511999990001")).toBe(true);
  });

  it("resposta torta ou de outro número vira 'não sei'", () => {
    expect(lerRespostaDeNumeros(["5511999990001"], { erro: 1 }).size).toBe(0);
    expect(lerRespostaDeNumeros(["5511999990001"], [{ exists: false, number: "5521888880000" }]).size).toBe(0);
    expect(lerRespostaDeNumeros(["5511999990001"], [{ number: "5511999990001" }]).size).toBe(0);
  });
});
