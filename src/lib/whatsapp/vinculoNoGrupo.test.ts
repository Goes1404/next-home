import { describe, expect, it } from "vitest";
import { lidDoCorretor, mensagemDaSincronizacao, planejarVinculos } from "./vinculoNoGrupo";

const chave = (nome: string) => nome.trim().toUpperCase();
const grupoDaAna = { jid: "1@g.us", nome: "Ana & Aretz" };
const grupoDoBeto = { jid: "2@g.us", nome: "Beto & Aretz" };

describe("planejarVinculos", () => {
  it("um corretor, um grupo", () => {
    const ana = { id: "a", nome: "Ana", whatsapp: "11987654321" };
    const beto = { id: "b", nome: "Beto", whatsapp: "11911112222" };
    const plano = planejarVinculos(
      [ana, beto],
      new Map([
        ["ANA", grupoDaAna],
        ["BETO", grupoDoBeto],
      ]),
      chave,
    );
    expect(plano.vinculos).toEqual([
      { corretor: ana, grupo: grupoDaAna },
      { corretor: beto, grupo: grupoDoBeto },
    ]);
    expect(plano.semGrupo).toEqual([]);
    expect(plano.repetidos).toEqual([]);
  });

  it("grupo que serve a dois corretores não vincula nenhum dos dois", () => {
    const ana1 = { id: "a1", nome: "Ana", whatsapp: "11987654321" };
    const ana2 = { id: "a2", nome: " ana ", whatsapp: "11922223333" };
    const beto = { id: "b", nome: "Beto", whatsapp: "11911112222" };
    const plano = planejarVinculos(
      [ana1, ana2, beto],
      new Map([
        ["ANA", grupoDaAna],
        ["BETO", grupoDoBeto],
      ]),
      chave,
    );
    expect(plano.vinculos).toEqual([{ corretor: beto, grupo: grupoDoBeto }]);
    expect(plano.repetidos).toEqual([{ grupo: grupoDaAna, corretores: [ana1, ana2] }]);
  });

  it("corretor sem grupo no padrão vai para semGrupo", () => {
    const caio = { id: "c", nome: "Caio", whatsapp: null };
    const plano = planejarVinculos([caio], new Map(), chave);
    expect(plano.semGrupo).toEqual([caio]);
    expect(plano.vinculos).toEqual([]);
  });
});

describe("lidDoCorretor", () => {
  it("acha o @lid pelo número do corretor, com ou sem 55 e 9", () => {
    const lista = [
      { id: "111@lid", numero: "5511911112222" },
      { id: "222@lid", numero: "5511987654321" },
    ];
    expect(lidDoCorretor(lista, "(11) 98765-4321")).toEqual({ achou: "lid", lid: "222@lid" });
    expect(lidDoCorretor(lista, "551187654321")).toEqual({ achou: "lid", lid: "222@lid" });
  });

  it("participante com o próprio número no id não tem @lid a guardar", () => {
    const lista = [{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }];
    expect(lidDoCorretor(lista, "11987654321")).toEqual({ achou: "sem_lid" });
  });

  it("@lid sem número na lista nunca é atribuído (sem o par, não grava)", () => {
    const lista = [{ id: "333@lid", numero: null }];
    expect(lidDoCorretor(lista, "11987654321")).toEqual({ achou: "nao" });
  });

  it("corretor fora do grupo, sem número ou ambíguo: não grava", () => {
    const lista = [{ id: "111@lid", numero: "5511911112222" }];
    expect(lidDoCorretor(lista, "11987654321")).toEqual({ achou: "nao" });
    expect(lidDoCorretor(lista, null)).toEqual({ achou: "nao" });
    expect(lidDoCorretor(lista, "")).toEqual({ achou: "nao" });
    const ambiguo = [
      { id: "111@lid", numero: "5511987654321" },
      { id: "222@lid", numero: "5511987654321" },
    ];
    expect(lidDoCorretor(ambiguo, "11987654321")).toEqual({ achou: "nao" });
  });
});

describe("mensagemDaSincronizacao", () => {
  it("mantém as mensagens de antes quando não há repetido", () => {
    expect(mensagemDaSincronizacao({ vinculados: 2, semGrupo: 0, repetidos: [] })).toBe("2 grupo(s) vinculado(s).");
    expect(mensagemDaSincronizacao({ vinculados: 2, semGrupo: 1, repetidos: [] })).toBe(
      "2 grupo(s) vinculado(s); 1 sem grupo no padrão.",
    );
    expect(mensagemDaSincronizacao({ vinculados: 0, semGrupo: 3, repetidos: [] })).toBe(
      "Nenhum grupo no padrão NOME & ARETZ foi encontrado.",
    );
  });

  it("avisa em português simples o grupo que serve a mais de um corretor", () => {
    const m = mensagemDaSincronizacao({ vinculados: 1, semGrupo: 0, repetidos: [{ grupoNome: "Ana & Aretz" }] });
    expect(m).toContain("1 grupo(s) vinculado(s).");
    expect(m).toContain(
      "O grupo Ana & Aretz serve a mais de um corretor; renomeie para ter um grupo por corretor.",
    );
    expect(m).not.toMatch(/jid|lid/i);
  });
});
