import { describe, expect, it } from "vitest";
import { caminhoDaArteGerada } from "./limpeza";

describe("caminhoDaArteGerada", () => {
  const id = "0b3c896e-c44e-43fe-b0ca-5ad3f59a5b9b";

  it("aceita somente a arte criada na pasta do corretor", () => {
    expect(caminhoDaArteGerada(`https://abc.supabase.co/storage/v1/object/public/empreendimentos/corretores/${id}/criacoes/arte.png`)).toBe(`corretores/${id}/criacoes/arte.png`);
  });

  it("recusa URL fora da área descartável", () => {
    expect(caminhoDaArteGerada(`https://abc.supabase.co/storage/v1/object/public/empreendimentos/corretores/${id}/referencias/foto.png`)).toBeNull();
    expect(caminhoDaArteGerada("https://exemplo.com/arquivo.png")).toBeNull();
  });
});
