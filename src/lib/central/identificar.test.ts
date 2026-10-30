import { describe, expect, it } from "vitest";
import { bancoFalso } from "./bancoFalso";
import { identificarRemetente } from "./identificar";

const NEXT = { id: "g-next", nome: "Next Home", central_whatsapp_ativo: true };
const ARETZ = { id: "g-aretz", nome: "Aretz", central_whatsapp_ativo: true };
const DESLIGADA = { id: "g-off", nome: "Sem recurso", central_whatsapp_ativo: false };

function cenario(corretores: Record<string, unknown>[], extras: Record<string, Record<string, unknown>[]> = {}) {
  return bancoFalso({ grupos: [NEXT, ARETZ, DESLIGADA], corretores, central_escolha_de_grupo: [], ...extras });
}

const carol = { id: "c-carol", nome: "Carolini", papel: "corretor", grupo_id: "g-next", ativo: true, whatsapp: "5511987654321", whatsapp_lid: null };

describe("identificarRemetente", () => {
  it("número de ninguém: desconhecido", async () => {
    const { cliente } = cenario([carol]);
    expect(await identificarRemetente(cliente, { telefone: "5511900000000", lid: null })).toEqual({ tipo: "desconhecido" });
  });

  it("corretor desativado: inativo", async () => {
    const { cliente } = cenario([{ ...carol, ativo: false }]);
    expect((await identificarRemetente(cliente, { telefone: "5511987654321", lid: null })).tipo).toBe("inativo");
  });

  it("imobiliária com o recurso desligado: desligado", async () => {
    const { cliente } = cenario([{ ...carol, grupo_id: "g-off" }]);
    expect(await identificarRemetente(cliente, { telefone: "5511987654321", lid: null })).toEqual({ tipo: "desligado", grupoId: "g-off" });
  });

  it("corretor reconhecido, com papel e imobiliária", async () => {
    const { cliente } = cenario([carol]);
    expect(await identificarRemetente(cliente, { telefone: "5511987654321", lid: null })).toEqual({
      tipo: "pessoa",
      corretorId: "c-carol",
      grupoId: "g-next",
      papel: "corretor",
      nome: "Carolini",
      imobiliaria: "Next Home",
    });
  });

  it("o mesmo celular sem o nono dígito e sem o 55 é a mesma pessoa", async () => {
    const { cliente } = cenario([{ ...carol, whatsapp: "1187654321" }]);
    expect((await identificarRemetente(cliente, { telefone: "5511987654321", lid: null })).tipo).toBe("pessoa");
  });

  it("só o lid, sem número: reconhece pelo whatsapp_lid", async () => {
    const { cliente } = cenario([{ ...carol, whatsapp_lid: "1234567@lid" }]);
    expect((await identificarRemetente(cliente, { telefone: null, lid: "1234567@lid" })).tipo).toBe("pessoa");
  });

  it("em duas imobiliárias ligadas: pergunta; com a escolha guardada, segue", async () => {
    const naAretz = { ...carol, id: "c-carol-aretz", grupo_id: "g-aretz" };
    const { cliente, tabelas } = cenario([carol, naAretz]);
    const r = await identificarRemetente(cliente, { telefone: "5511987654321", lid: null });
    expect(r.tipo).toBe("escolher");
    expect(r.tipo === "escolher" && r.opcoes.map((o) => o.nome)).toEqual(["Aretz", "Next Home"]);

    tabelas.central_escolha_de_grupo.push({ telefone: "5511987654321", corretor_id: "c-carol-aretz" });
    const depois = await identificarRemetente(cliente, { telefone: "5511987654321", lid: null });
    expect(depois.tipo === "pessoa" && depois.grupoId).toBe("g-aretz");
  });

  it("em duas imobiliárias, só uma ligada: vai direto para a ligada", async () => {
    const naDesligada = { ...carol, id: "c-off", grupo_id: "g-off" };
    const { cliente } = cenario([carol, naDesligada]);
    const r = await identificarRemetente(cliente, { telefone: "5511987654321", lid: null });
    expect(r.tipo === "pessoa" && r.grupoId).toBe("g-next");
  });

  it("gestor é reconhecido como gestor", async () => {
    const { cliente } = cenario([{ ...carol, papel: "gestor" }]);
    const r = await identificarRemetente(cliente, { telefone: "5511987654321", lid: null });
    expect(r.tipo === "pessoa" && r.papel).toBe("gestor");
  });
});
