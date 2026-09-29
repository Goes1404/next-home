import { describe, expect, it } from "vitest";
import { iaPrometeuRetorno } from "./promessaDeRetorno";

/*
 * Frases reais do eval de conversa de 28/09/2026: todas prometiam que o
 * corretor traria a resposta, e nenhuma avisava o corretor.
 */
describe("a IA prometeu que o corretor vai responder", () => {
  it("reconhece as promessas que saíram no eval", () => {
    for (const frase of [
      "A metragem exata do Acervo varia conforme a planta, confirmo com o corretor e te trago essa informação.",
      "Não tenho a planta do Vitra, vou confirmar com o corretor e te retorno assim que possível.",
      "Sobre desconto, confirmo com o corretor e te trago.",
      "Isso eu não tenho aqui com certeza. Já pedi para o corretor e te respondo assim que ele me passar.",
      "Ainda não tenho essa resposta certinha. Assim que o corretor me confirmar, te mando aqui mesmo.",
    ]) {
      expect(iaPrometeuRetorno(frase), frase).toBe(true);
    }
  });

  it("citar o corretor sem prometer nada não é promessa", () => {
    for (const frase of [
      "Na visita você conhece o corretor e ele te mostra o decorado.",
      "Sábado às 10h com o Eduardo, que é o corretor responsável.",
      "O valor exato quem fecha é o corretor, na visita.",
    ]) {
      expect(iaPrometeuRetorno(frase), frase).toBe(false);
    }
  });
});
