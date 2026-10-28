import { describe, expect, it } from "vitest";
import { montarAvisoNoGrupo, TEXTO_AVISO_NO_GRUPO_PADRAO, validarModeloDoAviso } from "./avisoNoGrupoTexto";

const vars = {
  corretor: "André",
  cliente: "Marina Silva",
  telefone: "(11) 99999-0000",
  origem: "pelo site",
  imovel: "Aretz Residence",
};

describe("relatório do lead no grupo", () => {
  it("sem modelo, sai o texto de sempre", () => {
    expect(montarAvisoNoGrupo(null, vars)).toBe(
      [
        "📥 *Novo lead distribuído*",
        "*Corretor:* André",
        "*Cliente:* Marina Silva",
        "*WhatsApp:* (11) 99999-0000",
        "*Origem:* pelo site",
        "*Imóvel:* Aretz Residence",
        "Abra o CRM para atender e registrar o contato.",
      ].join("\n"),
    );
  });

  it("modelo da imobiliária troca os marcadores", () => {
    expect(montarAvisoNoGrupo("🔥 {cliente} quer o {imovel}! Liga já, {corretor}: {telefone}", vars)).toBe(
      "🔥 Marina Silva quer o Aretz Residence! Liga já, André: (11) 99999-0000",
    );
  });

  it("linha com marcador sem valor sai inteira; cliente e telefone têm reserva", () => {
    const texto = montarAvisoNoGrupo(TEXTO_AVISO_NO_GRUPO_PADRAO, { corretor: "André", origem: null, imovel: "" });
    expect(texto).not.toContain("Origem");
    expect(texto).not.toContain("Imóvel");
    expect(texto).toContain("*Cliente:* Cliente novo");
    expect(texto).toContain("*WhatsApp:* não informado");
  });

  it("quebra de linha dentro do valor não desmonta o relatório", () => {
    expect(montarAvisoNoGrupo("{cliente}", { cliente: "Marina\nSilva" })).toBe("Marina Silva");
  });

  it("valida o modelo: marcador desconhecido, tamanho e vazio/padrão viram nulo", () => {
    expect(validarModeloDoAviso("Oi {nome}")).toEqual({ ok: false, erro: "Marcador desconhecido: {nome}." });
    expect(validarModeloDoAviso("x".repeat(1001)).ok).toBe(false);
    expect(validarModeloDoAviso("   ")).toEqual({ ok: true, modelo: null });
    expect(validarModeloDoAviso(TEXTO_AVISO_NO_GRUPO_PADRAO)).toEqual({ ok: true, modelo: null });
    expect(validarModeloDoAviso("Lead: {cliente}\r\n{telefone}")).toEqual({ ok: true, modelo: "Lead: {cliente}\n{telefone}" });
  });
});
