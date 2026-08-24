import { describe, expect, it } from "vitest";
import { afirmaPrazo, removerPrazoInventado } from "./prazoEntrega";
import type { Empreendimento } from "@/lib/types";

const imovel = (extra: Partial<Empreendimento>) =>
  ({
    nome: "Canvas",
    slug: "canvas",
    status: "em_construcao",
    entregaPrevista: null,
    ...extra,
  }) as unknown as Empreendimento;

const SEM_DATA = [imovel({}), imovel({ slug: "bosque", status: "pronto_para_morar" })];
const COM_DATA = [imovel({ entregaPrevista: "dez/2027" })];

describe("Prazo de entrega inventado", () => {
  /*
   * A frase real que o eval pegou. O cadastro não tem data nenhuma, então
   * "prevista para breve" saiu da cabeça do modelo — e prazo é a promessa
   * mais cara deste negócio: o cliente rescinde aluguel contando com ela.
   */
  it("corta a promessa de entrega quando o cadastro não tem data", () => {
    const r = removerPrazoInventado(
      "Você prefere algo pronto para morar? --- Tenho o Canvas em construção, com entrega prevista para breve --- Quer conhecer o decorado?",
      SEM_DATA,
    );
    expect(r.removeu).toBe(true);
    expect(r.texto).not.toMatch(/entrega/i);
    expect(r.texto).toContain("Quer conhecer o decorado?");
  });

  /*
   * Havendo data cadastrada, não dá para atribuir a frase ao imóvel certo
   * sem adivinhar — e adivinhar apagaria informação verdadeira.
   */
  it("não mexe quando existe data no cadastro", () => {
    const texto = "O Canvas tem entrega prevista para dezembro de 2027.";
    expect(removerPrazoInventado(texto, COM_DATA)).toEqual({ texto, removeu: false });
  });

  /** "Pronto para morar" é STATUS do cadastro, não promessa de data. */
  it("não confunde status com prazo", () => {
    const texto = "O Bosque AlphaGran está pronto para morar, em condomínio fechado.";
    expect(removerPrazoInventado(texto, SEM_DATA)).toEqual({ texto, removeu: false });
    expect(afirmaPrazo("está pronto para morar")).toBe(false);
  });

  /** Rule 17: "apresentação digital" não é entrega de imóvel. */
  it("não confunde entrega de material com entrega de obra", () => {
    expect(afirmaPrazo("posso te mandar a entrega digital do material")).toBe(false);
  });

  it("pega as variações que aparecem na prática", () => {
    for (const t of [
      "a obra termina no ano que vem",
      "as chaves em janeiro",
      "fica pronto em 2027",
      "será entregue no fim do ano",
    ]) {
      expect(afirmaPrazo(t), t).toBe(true);
    }
  });

  /*
   * Se a resposta INTEIRA era promessa de prazo, sobra nada — e mandar
   * silêncio é pior. Devolve uma frase honesta que promete conferir.
   */
  it("devolve frase honesta quando não sobra nada", () => {
    const r = removerPrazoInventado("A entrega está prevista para breve.", SEM_DATA);
    expect(r.removeu).toBe(true);
    expect(r.texto).toMatch(/confirmar o prazo/i);
  });
});
