import { describe, expect, it } from "vitest";
import { ehIlustrativo, pedidoDeImagemDoCadastro } from "./pedidoDoCadastro";

const BASE = {
  pedido: "fachada ao entardecer, vista da rua",
  nome: "Vista AlphaGran",
  bairro: "Alphaville",
  cidade: "Barueri",
  status: "em_construcao",
  tipo: "apartamento",
} as const;

describe("pedidoDeImagemDoCadastro", () => {
  it("mantém o pedido do corretor como assunto, na frente", () => {
    expect(pedidoDeImagemDoCadastro(BASE)).toMatch(/^fachada ao entardecer, vista da rua\./);
  });

  it("junta o que o corretor já preencheu no cadastro", () => {
    const texto = pedidoDeImagemDoCadastro(BASE);
    expect(texto).toContain('Apartamento chamado "Vista AlphaGran"');
    expect(texto).toContain("em Alphaville, Barueri");
  });

  it("usa o RÓTULO do estágio, nunca o enum", () => {
    const texto = pedidoDeImagemDoCadastro(BASE);
    // `em_construcao` cru já fez o modelo dizer ao cliente que o imóvel
    // estava pronto para morar (MEMORIA, agosto/2026).
    expect(texto).toContain("Em construção");
    expect(texto).not.toContain("em_construcao");
  });

  it("avisa que é ilustrativa quando a obra não foi entregue", () => {
    expect(pedidoDeImagemDoCadastro(BASE)).toContain("Perspectiva ilustrativa");
  });

  it("não põe a ressalva de obra em imóvel pronto", () => {
    const texto = pedidoDeImagemDoCadastro({ ...BASE, status: "pronto_para_morar" });
    expect(texto).not.toContain("Perspectiva ilustrativa");
    expect(texto).toContain("Pronto para morar");
  });

  it("proíbe rosto e marca d'água em todo caso", () => {
    const texto = pedidoDeImagemDoCadastro({ ...BASE, status: "pronto_para_morar" });
    expect(texto).toContain("Sem pessoas com rosto reconhecível.");
    expect(texto).toContain("Sem texto, logotipo ou marca d'água");
  });

  it("a construtora entra só quando existe", () => {
    expect(pedidoDeImagemDoCadastro(BASE)).not.toContain("construtora");
    expect(pedidoDeImagemDoCadastro({ ...BASE, construtora: "P4 Engenharia" })).toContain(
      "da construtora P4 Engenharia",
    );
  });

  it("sem pedido não há imagem: devolve vazio", () => {
    expect(pedidoDeImagemDoCadastro({ ...BASE, pedido: "   " })).toBe("");
  });

  it("aguenta bairro e cidade em branco sem deixar vírgula solta", () => {
    const texto = pedidoDeImagemDoCadastro({ ...BASE, bairro: "", cidade: "" });
    expect(texto).not.toMatch(/em ,|, \./);
    expect(texto).toContain('Apartamento chamado "Vista AlphaGran"');
  });
});

describe("ehIlustrativo", () => {
  it("só 'pronto para morar' e 'últimas unidades' são obra existente", () => {
    expect(ehIlustrativo("pronto_para_morar")).toBe(false);
    expect(ehIlustrativo("ultimas_unidades")).toBe(false);
    expect(ehIlustrativo("lancamento")).toBe(true);
    expect(ehIlustrativo("em_construcao")).toBe(true);
  });
});
