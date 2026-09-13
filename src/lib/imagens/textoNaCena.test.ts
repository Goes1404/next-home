import { describe, expect, it } from "vitest";
import { textosEntreAspas, TETO_DE_TEXTOS } from "./textoNaCena";

describe("textosEntreAspas", () => {
  it("acha a manchete ditada entre aspas retas", () => {
    expect(textosEntreAspas('fachada ao pôr do sol com a manchete "MUDE AINDA ESTE ANO"')).toEqual([
      "MUDE AINDA ESTE ANO",
    ]);
  });

  it("acha também com aspas curvas, que é o que o celular digita", () => {
    // O teclado do iOS e do Android troca " por “ ” sozinho. Aceitar só a
    // aspa reta faria a técnica falhar exatamente para quem usa o painel no
    // telefone, que é todo mundo aqui.
    expect(textosEntreAspas("arte com o texto “PRONTO PARA MORAR”")).toEqual(["PRONTO PARA MORAR"]);
  });

  it("devolve manchete e apoio, na ordem em que foram escritos", () => {
    expect(textosEntreAspas('post com "MANACÁ BARUERI" em cima e "63 e 81 m²" embaixo')).toEqual([
      "MANACÁ BARUERI",
      "63 e 81 m²",
    ]);
  });

  it("apóstrofo não é aspas", () => {
    // "d'água", "n'água" e aspas simples de ênfase apareceriam como texto
    // ditado — e o modelo desenharia uma palavra solta na peça.
    expect(textosEntreAspas("marca d'água discreta no canto")).toEqual([]);
    expect(textosEntreAspas("uma sala 'moderna' com luz natural")).toEqual([]);
  });

  it("pedido sem aspas nenhuma devolve lista vazia", () => {
    // É o caso comum, e é o que faz a ferramenta se comportar como o ChatGPT.
    expect(textosEntreAspas("um cachorro vestido de Papai Noel")).toEqual([]);
  });

  it("aspas vazias ou de um caractere não contam", () => {
    expect(textosEntreAspas('arte com "" e "a" no canto')).toEqual([]);
  });

  it("apara espaço nas beiradas e descarta duplicata", () => {
    expect(textosEntreAspas('"  ÚLTIMAS UNIDADES  " e de novo "ÚLTIMAS UNIDADES"')).toEqual([
      "ÚLTIMAS UNIDADES",
    ]);
  });

  it("teto de textos: peça com dez frases é layout, não imagem", () => {
    const dez = Array.from({ length: 10 }, (_, i) => `"TEXTO ${i}"`).join(" ");
    expect(textosEntreAspas(dez)).toHaveLength(TETO_DE_TEXTOS);
    expect(TETO_DE_TEXTOS).toBe(4);
  });

  it("aspas abertas e não fechadas não viram texto", () => {
    expect(textosEntreAspas('uma fachada com "MUDE AINDA')).toEqual([]);
  });
});
