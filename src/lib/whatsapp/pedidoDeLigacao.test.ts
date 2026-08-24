import { describe, expect, it } from "vitest";
import { clientePediuLigacao } from "./pedidoDeLigacao";
import { aplicarTemplate, nomeUtilDoLead } from "./campaignQueue";

describe("Cliente pediu ligação", () => {
  /** O trace real que originou a checagem (conversa …6256, 23/08 00:01). */
  it("pega o 'me liga' que a IA prometeu atender sem avisar ninguém", () => {
    expect(clientePediuLigacao("me liga")).toBe(true);
  });

  it("pega as variações que aparecem no WhatsApp", () => {
    for (const t of [
      "Me liga aí quando puder",
      "vc pode me ligar?",
      "consegue ligar pra mim hoje?",
      "prefiro falar por telefone",
      "melhor resolver por telefone",
      "me manda uma ligação depois",
      "qual seu telefone?",
    ]) {
      expect(clientePediuLigacao(t), t).toBe(true);
    }
  });

  /*
   * Alerta que dispara à toa deixa de ser lido — o erro já cometido em
   * `evolucaoConversa.ts`, que mandava aviso quase toda resposta.
   */
  it("não confunde com 'ligar' que não é telefone", () => {
    for (const t of [
      "vou ligar para o banco amanhã e te falo",
      "preciso ligar para a construtora antes",
      "esqueci de ligar o ar condicionado",
      "quero ver a planta do 3 dormitórios",
      "pode mandar por aqui mesmo",
    ]) {
      expect(clientePediuLigacao(t), t).toBe(false);
    }
  });

  it("mensagem vazia não é pedido", () => {
    expect(clientePediuLigacao("")).toBe(false);
    expect(clientePediuLigacao("   ")).toBe(false);
  });
});

describe("Nome do lead em mensagem de campanha", () => {
  /*
   * Saiu assim para um cliente de verdade: "Olá, Contato sem nome. É um
   * prazer me apresentar…". O rótulo interno da importação atravessou o
   * template e chegou ao WhatsApp.
   */
  it("trata o rótulo interno da importação como ausência de nome", () => {
    expect(nomeUtilDoLead("Contato sem nome")).toBeNull();
    expect(nomeUtilDoLead("contato sem nome")).toBeNull();
  });

  it("trata telefone e vazio como ausência de nome", () => {
    expect(nomeUtilDoLead("(11) 99999-9999")).toBeNull();
    expect(nomeUtilDoLead("5511999999999")).toBeNull();
    expect(nomeUtilDoLead("")).toBeNull();
    expect(nomeUtilDoLead(null)).toBeNull();
    expect(nomeUtilDoLead("A")).toBeNull();
  });

  it("preserva nome de gente", () => {
    expect(nomeUtilDoLead("  Fernanda  ")).toBe("Fernanda");
    expect(nomeUtilDoLead("Gabriely Bonfim")).toBe("Gabriely Bonfim");
  });

  it("o template não cumprimenta ninguém pelo rótulo interno", () => {
    const texto = aplicarTemplate({
      mensagemBase: "Olá, {nome}. Temos novidades em {imovel}.",
      nomeLead: "Contato sem nome",
    });
    expect(texto).not.toContain("Contato sem nome");
    expect(texto).toContain("Tudo bem?");
  });
});
