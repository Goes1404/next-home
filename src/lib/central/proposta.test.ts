import { describe, expect, it } from "vitest";
import { criarExecutor, executarProposta, type Tratadores } from "./executar";
import { criarProposta, lerRespostaAProposta, propostaNoContexto, textoDaProposta } from "./proposta";

const CTX = { corretorId: "c1", grupoId: "g1", papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const AGORA = new Date("2026-10-30T15:00:00Z");
const depois = (min: number) => new Date(AGORA.getTime() + min * 60_000);

/** Uma ação falsa, de onda 0, só para exercitar o mecanismo (nenhuma real existe na onda 0). */
function tratadoresDeTeste() {
  const gravados: Record<string, unknown>[] = [];
  const tratadores: Tratadores = {
    consultas: {},
    acoes: {
      cadastrar_lead: {
        resumir: (a) => `Cadastrar ${String(a.nome)}`,
        executar: async (_ctx, a) => (gravados.push(a), { ok: true, texto: `${String(a.nome)} cadastrado.` }),
      },
      visita: {
        resumir: (a) => `Marcar visita com ${String(a.lead)} ${String(a.quando)}`,
        executar: async (_ctx, a) => (gravados.push(a), { ok: true, texto: "Visita marcada." }),
      },
    },
  };
  return { tratadores, gravados };
}

describe("ação vira proposta, nunca grava direto", () => {
  it("a ação monta o item e não roda", async () => {
    const { tratadores, gravados } = tratadoresDeTeste();
    const ex = criarExecutor(CTX, tratadores, 3);
    expect(await ex.executar("cadastrar_lead", { nome: "João" })).toMatchObject({ proposto: true, resumo: "Cadastrar João" });
    expect(gravados).toEqual([]);
    expect(ex.itensPropostos).toHaveLength(1);
  });

  it("pedido composto: uma proposta, itens numerados, um sim só", async () => {
    const { tratadores, gravados } = tratadoresDeTeste();
    const ex = criarExecutor(CTX, tratadores, 3);
    await ex.executar("cadastrar_lead", { nome: "João" });
    await ex.executar("visita", { lead: "João", quando: "amanhã 10h" });
    const p = criarProposta(ex.itensPropostos, AGORA);
    expect(textoDaProposta(p)).toBe(
      "Vou fazer isto:\n1) Cadastrar João\n2) Marcar visita com João amanhã 10h\n\nResponda *sim* para confirmar ou *não* para cancelar.",
    );
    expect(lerRespostaAProposta(p, "sim", depois(1))).toEqual({ tipo: "confirmar" });
    const r = await executarProposta(CTX, p.itens, tratadores);
    expect(r.map((x) => x.texto)).toEqual(["João cadastrado.", "Visita marcada."]);
    expect(gravados).toHaveLength(2);
  });
});

describe("o sim e o prazo de 1 hora", () => {
  const p = criarProposta([{ ferramenta: "cadastrar_lead", argumentos: {}, resumo: "Cadastrar João" }], AGORA);

  it("sim aos 45 min confirma (a proposta é guardada à parte do histórico de 30 min)", () => {
    expect(lerRespostaAProposta(p, "Sim", depois(45))).toEqual({ tipo: "confirmar" });
    expect(lerRespostaAProposta(p, "pode", depois(45))).toEqual({ tipo: "confirmar" });
  });

  it("sim depois de 1 hora: venceu", () => {
    expect(lerRespostaAProposta(p, "sim", depois(61))).toEqual({ tipo: "expirou" });
  });

  it("não cancela; correção ou outro pedido vão ao cérebro", () => {
    expect(lerRespostaAProposta(p, "não", depois(1))).toEqual({ tipo: "cancelar" });
    expect(lerRespostaAProposta(p, "não, a renda é 6 mil", depois(1))).toEqual({ tipo: "outro" });
    expect(lerRespostaAProposta(p, "quem eu ligo hoje?", depois(1))).toEqual({ tipo: "outro" });
  });

  it("o cérebro só vê a proposta enquanto ela vale", () => {
    expect(propostaNoContexto(p, depois(10))).toMatch(/Cadastrar João/);
    expect(propostaNoContexto(p, depois(61))).toBeNull();
  });
});

describe("o que não chegou e o que é só do gestor", () => {
  it("na onda 0, ação de onda futura responde ainda não, sem item", async () => {
    const { tratadores } = tratadoresDeTeste();
    const ex = criarExecutor(CTX, tratadores, 0);
    expect(await ex.executar("cadastrar_lead", { nome: "João" })).toMatchObject({ aindaNao: true });
    expect(ex.itensPropostos).toEqual([]);
  });

  it("corretor pedindo o que é do gestor: recusa", async () => {
    const ex = criarExecutor(CTX, { consultas: { relatorio_da_equipe: async () => "x" }, acoes: {} }, 3);
    expect(await ex.executar("relatorio_da_equipe", {})).toEqual({ erro: "Isso é só para o gestor da imobiliária." });
  });

  it("a ajuda responde na onda 0", async () => {
    const ex = criarExecutor(CTX);
    expect(await ex.executar("ajuda", {})).toMatchObject({ texto: expect.stringMatching(/O que você sabe fazer/) });
  });
});
