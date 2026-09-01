import { describe, expect, it } from "vitest";
import {
  bairrosDoCandidato,
  contarPendentes,
  organizarFila,
  precisaConferir,
  resumoDoCandidato,
  statusDoCandidato,
  type Candidato,
} from "./filaDeCandidatos";

function candidato(over: Partial<Candidato> & { nome: string }): Candidato {
  return {
    id: over.nome,
    refExterna: over.nome.toLowerCase().replace(/\s+/g, "-"),
    bairro: null,
    statusObra: null,
    dormitorios: null,
    area: null,
    link: null,
    decisao: "pendente",
    motivo: null,
    ...over,
  };
}

describe("organizarFila", () => {
  it("põe quem precisa de conferência na frente do resto", () => {
    const fila = organizarFila([
      candidato({ nome: "Amáz Alphaville" }),
      candidato({
        nome: "Royal Barueri",
        motivo: "nome PARECIDO com um do catálogo — conferir se é o mesmo imóvel",
      }),
      candidato({ nome: "Beyond Residence" }),
    ]);

    expect(fila.pendentes.map((c) => c.nome)).toEqual([
      "Royal Barueri",
      "Amáz Alphaville",
      "Beyond Residence",
    ]);
  });

  it("separa a lista de trabalho dos que já saíram da fila", () => {
    const fila = organizarFila([
      candidato({ nome: "Serenne", decisao: "cadastrar" }),
      candidato({ nome: "Terrah", decisao: "descartado", motivo: "não é da nossa carteira" }),
      candidato({ nome: "Vista Alphagran", decisao: "ja_temos" }),
      candidato({ nome: "Dellagio" }),
    ]);

    expect(fila.paraCadastrar.map((c) => c.nome)).toEqual(["Serenne"]);
    expect(fila.resolvidos.map((c) => c.nome)).toEqual(["Terrah", "Vista Alphagran"]);
    expect(fila.pendentes.map((c) => c.nome)).toEqual(["Dellagio"]);
  });

  it("ordena por nome com as regras do português — acento não joga para o fim", () => {
    const fila = organizarFila([
      candidato({ nome: "Beyond Residence" }),
      candidato({ nome: "Amáz Alphaville" }),
      candidato({ nome: "Arbórea Alphagran" }),
    ]);

    expect(fila.pendentes.map((c) => c.nome)).toEqual([
      "Amáz Alphaville",
      "Arbórea Alphagran",
      "Beyond Residence",
    ]);
  });
});

describe("precisaConferir", () => {
  it("só vale para quem ainda está pendente", () => {
    const jaDecidido = candidato({
      nome: "Dom Barueri",
      decisao: "descartado",
      motivo: "nome PARECIDO com um do catálogo — conferido, é outro imóvel",
    });

    // Já foi conferido: manter o aviso empurraria de volta para o topo de
    // uma fila em que ele nem está mais.
    expect(precisaConferir(jaDecidido)).toBe(false);
  });

  it("não reage a motivo de outra natureza", () => {
    expect(
      precisaConferir(
        candidato({ nome: "Terra Alta", motivo: "nome idêntico ao do catálogo (conferido)" }),
      ),
    ).toBe(false);
  });
});

describe("resumoDoCandidato", () => {
  it("junta o que existe e não deixa separador solto quando falta campo", () => {
    expect(
      resumoDoCandidato(
        candidato({ nome: "Serenne", bairro: "Vila Nossa Senhora da Escada", area: "49 e 53 m²" }),
      ),
    ).toBe("Vila Nossa Senhora da Escada · 49 e 53 m²");

    expect(resumoDoCandidato(candidato({ nome: "Sem nada" }))).toBe("");
  });
});

describe("contarPendentes", () => {
  it("conta só o que ainda espera decisão", () => {
    expect(
      contarPendentes([
        candidato({ nome: "a" }),
        candidato({ nome: "b", decisao: "cadastrar" }),
        candidato({ nome: "c", decisao: "ja_temos" }),
        candidato({ nome: "d" }),
      ]),
    ).toBe(2);
  });
});

describe("statusDoCandidato", () => {
  it("traduz o texto da fonte para o enum do cadastro", () => {
    expect(statusDoCandidato("Em construção")).toBe("em_construcao");
    expect(statusDoCandidato("Lançamento")).toBe("lancamento");
    expect(statusDoCandidato("Pronto para morar")).toBe("pronto_para_morar");
  });

  it("não depende de acento nem de caixa", () => {
    expect(statusDoCandidato("EM CONSTRUCAO")).toBe("em_construcao");
    expect(statusDoCandidato("  lancamento ")).toBe("lancamento");
  });

  it("cai no default da coluna quando não reconhece", () => {
    // Errar aqui é barato: o formulário mostra o estágio num select e o
    // corretor corrige antes de criar. Chutar "pronto para morar" seria caro.
    expect(statusDoCandidato("Obras avançadas")).toBe("lancamento");
    expect(statusDoCandidato(null)).toBe("lancamento");
  });
});

describe("bairrosDoCandidato", () => {
  it("separa o que a fonte manda numa string só", () => {
    expect(
      bairrosDoCandidato(candidato({ nome: "Royal", bairro: "Aldeia, Nova Aldeinha, Vila Militar" })),
    ).toEqual(["Aldeia", "Nova Aldeinha", "Vila Militar"]);
  });

  it("devolve lista vazia quando não há bairro", () => {
    expect(bairrosDoCandidato(candidato({ nome: "Sem bairro" }))).toEqual([]);
  });
});
