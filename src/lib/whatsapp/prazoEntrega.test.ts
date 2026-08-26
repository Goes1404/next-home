import { describe, expect, it } from "vitest";
import {
  afirmaPrazo,
  blocoSemPrazoCadastrado,
  catalogoTemPrazo,
  removerPrazoInventado,
} from "./prazoEntrega";
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

  /*
   * Os falsos positivos que o eval de 26/08 expôs. Todos são frases que a
   * IA DEVE poder dizer — e que o detector antigo cortava, porque acusava
   * qualquer aparição da palavra "entrega".
   *
   * O caso 1 é literal: a resposta bruta da rodada julgada. O guardrail
   * apagou a ressalva e o eval registrou "inventou prazo de entrega" numa
   * frase que não promete data nenhuma.
   */
  it("NÃO acusa quem fala de entrega sem prometer data", () => {
    for (const t of [
      "O Vitra é pronto para morar, mas entrega imediata depende da unidade.",
      "Não tenho a data de entrega aqui, eu confirmo com você.",
      "A entrega depende da unidade escolhida.",
      "Vou confirmar o prazo de entrega com a construtora.",
      "Esse está em obra e eu não afirmo prazo sem checar.",
    ]) {
      expect(afirmaPrazo(t), t).toBe(false);
    }
  });

  /*
   * A regra 23b manda dizer que NÃO atende ao prazo do cliente — e sem
   * inventar a data que falta. Punir isso empurrava a IA para o silêncio
   * justamente onde a honestidade importa.
   */
  it("NÃO acusa a recusa honesta que o prompt exige", () => {
    for (const t of [
      "Não fica pronto em 15 dias, é obra em andamento.",
      "Para janeiro não tenho nada pronto, o que tenho é em construção.",
    ]) {
      expect(afirmaPrazo(t), t).toBe(false);
    }
  });

  it("continua pegando a promessa de verdade, com ou sem data exata", () => {
    for (const t of [
      "A entrega está prevista para breve.",
      "As chaves saem em março.",
      "Fica pronto em 12 meses.",
      "A obra termina no primeiro semestre.",
    ]) {
      expect(afirmaPrazo(t), t).toBe(true);
    }
  });

  /* A frase inteira segue sendo cortada — remover só a data deixaria "a
     entrega está prevista para", que parece defeito de software. */
  it("o corte continua sendo por frase, não por palavra", () => {
    const r = removerPrazoInventado(
      "O Canvas é ótimo. --- A entrega está prevista para breve. --- Quer conhecer?",
      SEM_DATA,
    );
    expect(r.removeu).toBe(true);
    expect(r.texto).toContain("O Canvas é ótimo.");
    expect(r.texto).toContain("Quer conhecer?");
    expect(r.texto).not.toMatch(/prevista/i);
  });
});

describe("prazo do CLIENTE não é promessa nossa", () => {
  it("avaliar o prazo que o cliente pediu é honesto, não afirmação de entrega", () => {
    for (const t of [
      "Janeiro é um prazo apertado para obra, mas temos opções prontas.",
      "15 dias é um prazo curto para quem está esperando obra.",
    ]) {
      expect(afirmaPrazo(t), t).toBe(false);
    }
  });

  it("mas o prazo DE ENTREGA com data continua sendo acusado", () => {
    expect(afirmaPrazo("O prazo de entrega é dezembro de 2027.")).toBe(true);
    // A frase real da rodada de 26/08 — esta promete e o cadastro não tem data.
    expect(afirmaPrazo("Posso te mostrar opções que entregam até o fim do ano.")).toBe(true);
  });
});

describe("o prompt avisa o que ela NÃO sabe (v24)", () => {
  it("o bloco proíbe a promessa vaga e libera o que é honesto", () => {
    const b = blocoSemPrazoCadastrado();
    expect(b).toContain("VOCÊ NÃO TEM ESSA INFORMAÇÃO");
    expect(b).toContain("PROIBIDO prometer prazo");
    // O que ela PODE dizer precisa estar junto: bloco que só proíbe empurra
    // a IA para o silêncio, e silêncio sobre prazo também perde o cliente.
    expect(b).toContain("PODE dizer");
    expect(b).toContain("confirma com a construtora");
  });

  it("só entra quando NENHUM imóvel tem data — senão seria mentira", () => {
    expect(catalogoTemPrazo(SEM_DATA)).toBe(false);
    expect(catalogoTemPrazo(COM_DATA)).toBe(true);
  });
});
