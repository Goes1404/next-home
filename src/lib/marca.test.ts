import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerMarca } from "./marca";

describe("marca da instalação", () => {
  it("sem variável, nada sobrepõe o padrão", () => {
    expect(lerMarca(undefined)).toEqual({});
    expect(lerMarca("não é json")).toEqual({});
    expect(lerMarca("[1,2]")).toEqual({});
  });
  it("lê os campos válidos e descarta o resto", () => {
    const m = lerMarca(
      JSON.stringify({
        nome: "Casa Azul",
        wordmark: ["Casa", "Azul"],
        whatsapp: [{ numero: "(11) 99999-0000", label: "x" }, { numero: "5511988887777", label: "(11) 98888-7777" }],
        social: { instagram: "http://inseguro.com", facebook: "https://fb.com/casa" },
        endereco: { logradouro: "Rua A", bairro: "B", cidade: "C", uf: "SP", cep: "0", lat: "x", lng: 1 },
        lixo: true,
      }),
    );
    expect(m.nome).toBe("Casa Azul");
    expect(m.wordmark).toEqual(["Casa", "Azul"]);
    expect(m.whatsapp).toEqual([{ numero: "5511988887777", label: "(11) 98888-7777" }]);
    expect(m.social).toEqual({ facebook: "https://fb.com/casa" });
    expect(m.endereco).toBeUndefined();
    expect("lixo" in m).toBe(false);
  });
  it("o logotipo em texto não volta a ser escrito à mão", () => {
    for (const f of ["src/components/layout/Footer.tsx", "src/components/layout/SiteHeader.tsx", "src/app/corretor/(painel)/layout.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Next<span/);
    }
  });
});
