import { describe, expect, it } from "vitest";
import { textoDeContingencia } from "./aiAgent";

const base = { nomeAssistente: "Sofia", nomeCorretor: "Bruna" };

describe("Texto de contingência para o cliente", () => {
  it("no primeiro contato, se apresenta", () => {
    const texto = textoDeContingencia({ ...base, temHistorico: false });
    expect(texto).toContain("Sofia");
  });

  it("no meio da conversa, NÃO se apresenta de novo nem cumprimenta do zero", () => {
    // O texto antigo era sempre "Olá! Recebi sua mensagem sobre nossos
    // imóveis..." — disparado por um timeout na quinta mensagem, fazia o
    // atendimento parecer ter reiniciado e ignorava a pergunta do cliente.
    const texto = textoDeContingencia({ ...base, temHistorico: true });
    expect(texto).not.toMatch(/^Olá/);
    expect(texto).not.toContain("Sou a Sofia");
  });

  it("nunca finge ter respondido a pergunta — só promete retorno", () => {
    for (const temHistorico of [true, false]) {
      const texto = textoDeContingencia({ ...base, temHistorico });
      expect(texto.toLowerCase()).toMatch(/instante|minutinho|j[áa] te respondo/);
    }
  });

  /*
   * A versão anterior deste teste EXIGIA o nome do corretor no texto
   * (`expect(texto).toContain("Bruna")`) — ou seja, travava por contrato a
   * própria falha que a regra 21 do prompt proíbe. Mesmo padrão dos
   * critérios do eval que reprovavam o comportamento certo: o teste foi
   * escrito quando a regra de negócio era outra, e ninguém revisita teste
   * ao mudar regra.
   *
   * Em produção foram 14 mensagens dizendo que a corretora "está
   * acompanhando" ou já foi avisada — a maior fonte isolada da violação,
   * e invisível para o prompt porque este texto é código.
   */
  it("NUNCA diz que o corretor vai responder — a regra 21 vale aqui também", () => {
    for (const temHistorico of [true, false]) {
      const texto = textoDeContingencia({ ...base, temHistorico });
      expect(texto).not.toContain("Bruna");
      expect(texto).not.toMatch(/avis(ei|ando)|acompanhando|entrar em contato|te responder em/i);
    }
  });
});
