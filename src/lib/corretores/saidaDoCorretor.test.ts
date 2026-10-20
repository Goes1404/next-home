import { describe, expect, it } from "vitest";
import { fraseDoDesfecho, frasesDaDivisao, traduzirErroDaSaida } from "./saidaDoCorretor";

describe("textos da saída do corretor", () => {
  it("conta os dois lados com concordância", () => {
    expect(frasesDaDivisao("Ana", { doCorretor: 1, daImobiliaria: 3 })).toEqual({
      daCasa: "3 leads vieram da imobiliária e ficam com ela.",
      dele: "1 lead foi trazido por Ana. Ele leva só a ficha (sem as conversas).",
    });
    expect(frasesDaDivisao("Ana", { doCorretor: 0, daImobiliaria: 1 })).toEqual({
      daCasa: "1 lead veio da imobiliária e fica com ela.",
      dele: "Ana não trouxe nenhum lead por conta própria.",
    });
  });

  it("traduz os erros da função do banco", () => {
    expect(traduzirErroDaSaida("destino_invalido")).toMatch(/corretor ativo/);
    expect(traduzirErroDaSaida("sem_permissao")).toMatch(/administra/);
    expect(traduzirErroDaSaida("Could not find the function public.devolver_leads_da_imobiliaria")).toMatch(/0200/);
    expect(traduzirErroDaSaida("timeout")).toMatch(/Tente de novo/);
  });

  it("diz quem ficou sem destino", () => {
    expect(fraseDoDesfecho(4, 0)).toBe("4 leads passaram para a equipe.");
    expect(fraseDoDesfecho(1, 1)).toBe(
      "1 lead passou para a equipe. 1 lead ficou sem destino: não há corretor ativo que atenda a região.",
    );
  });
});
