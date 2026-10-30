import { describe, expect, it, vi } from "vitest";
import type { Acao } from "../executar";
import { AINDA_NAO } from "../ferramentas";
import { ACOES_FOTO, acaoDaFoto, ORIGEM_DA_FOTO, telefoneInteiro } from "./foto";

const ctx = { corretorId: "c1", grupoId: "g1", papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };

/** O `cadastrar_lead` da Frente B, falso: anota o que recebeu. */
function cadastroFalso() {
  const cadastro = {
    preparar: vi.fn<Acao["preparar"]>(async (_c, a) => ({
      tipo: "proposta",
      resumo: `Cadastrar ${String(a.nome)}, ${String(a.telefone)}`,
      dados: { nome: a.nome, telefone: "5511987654321" },
    })),
    executar: vi.fn<Acao["executar"]>(async (_c, d) => ({ ok: true, texto: `${String(d.nome)} cadastrado.`, desfazer: { leadId: "l1" } })),
    desfazer: vi.fn<NonNullable<Acao["desfazer"]>>(async () => ({ ok: true, texto: "Cadastro desfeito." })),
  };
  return cadastro;
}

describe("cadastrar_lead_da_foto", () => {
  it("está entre as ações da frente", () => {
    expect(Object.keys(ACOES_FOTO)).toEqual(["cadastrar_lead_da_foto"]);
  });

  it("sem o cadastrar_lead da Frente B: ainda não sei, nada proposto", async () => {
    const r = await acaoDaFoto(() => undefined).preparar(ctx, { nome: "João", telefone: "11 98765-4321" });
    expect(r).toEqual({ tipo: "resposta", resultado: { aindaNao: true, mensagem: AINDA_NAO } });
  });

  it("delega ao cadastrar_lead com o que foi lido; interesse vira observação", async () => {
    const cadastro = cadastroFalso();
    const acao = acaoDaFoto(() => cadastro);
    const r = await acao.preparar(ctx, { nome: " João Pereira ", telefone: "(11) 98765-4321", interesse: "2 dorms em Alphaville" });
    expect(cadastro.preparar).toHaveBeenCalledWith(ctx, {
      nome: "João Pereira",
      telefone: "(11) 98765-4321",
      origem: ORIGEM_DA_FOTO,
      observacao: "Interesse (lido na foto): 2 dorms em Alphaville",
    });
    expect(r).toEqual({
      tipo: "proposta",
      resumo: "Cadastrar João Pereira, (11) 98765-4321 (lido da foto)",
      dados: { nome: "João Pereira", telefone: "5511987654321" },
    });

    // O "sim" e o desfazer passam pelos do cadastro, com os dados resolvidos.
    expect(await acao.executar(ctx, { nome: "João Pereira" })).toMatchObject({ ok: true, desfazer: { leadId: "l1" } });
    expect(cadastro.executar).toHaveBeenCalledWith(ctx, { nome: "João Pereira" });
    expect(await acao.desfazer!(ctx, { leadId: "l1" })).toEqual({ ok: true, texto: "Cadastro desfeito." });
  });

  it("pergunta do cadastro (lead de outro corretor, duplicado) volta como está", async () => {
    const cadastro = cadastroFalso();
    cadastro.preparar.mockResolvedValueOnce({ tipo: "resposta", resultado: { erro: "Esse telefone já é lead da Ana." } });
    const r = await acaoDaFoto(() => cadastro).preparar(ctx, { nome: "João", telefone: "11987654321" });
    expect(r).toEqual({ tipo: "resposta", resultado: { erro: "Esse telefone já é lead da Ana." } });
  });

  it("sem nome, sem telefone ou com telefone pela metade: não cadastra", async () => {
    const cadastro = cadastroFalso();
    const acao = acaoDaFoto(() => cadastro);
    for (const argumentos of [
      { telefone: "11 98765-4321" },
      { nome: "João" },
      { nome: "João", telefone: "4321" },
      { nome: "João", telefone: "98765-4321" },
    ]) {
      const r = await acao.preparar(ctx, argumentos);
      expect(r.tipo, JSON.stringify(argumentos)).toBe("resposta");
    }
    expect(cadastro.preparar).not.toHaveBeenCalled();
  });

  it("telefone inteiro: DDD + número, com ou sem o 55", () => {
    expect(telefoneInteiro("11 98765-4321")).toBe(true);
    expect(telefoneInteiro("+55 (11) 98765-4321")).toBe(true);
    expect(telefoneInteiro("11 3456-7890")).toBe(true);
    expect(telefoneInteiro("98765-4321")).toBe(false);
    expect(telefoneInteiro("0000")).toBe(false);
    expect(telefoneInteiro("55 11 98765-4321 0")).toBe(false);
  });

  it("sem cadastro na hora do sim: não grava", async () => {
    expect(await acaoDaFoto(() => undefined).executar(ctx, {})).toEqual({ ok: false, texto: AINDA_NAO });
  });
});
