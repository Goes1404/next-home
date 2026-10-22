import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copiarTexto } from "./copiarTexto";

/**
 * `navigator.clipboard.writeText` devolve uma promessa que pode ser
 * RECUSADA (aba sem foco, permissão negada, página fora de HTTPS, navegador
 * antigo sem a API). Sem esperar a promessa, a tela dizia "Copiado!" com a
 * área de transferência vazia — e o operador colava nada no WhatsApp.
 */

describe("copiarTexto", () => {
  it("só diz que copiou quando a área de transferência aceitou", async () => {
    const gravados: string[] = [];
    expect(await copiarTexto("https://link", { writeText: async (t) => void gravados.push(t) })).toBe(true);
    expect(gravados).toEqual(["https://link"]);
  });

  it("recusa do navegador vira false, sem lançar", async () => {
    const recusa = { writeText: async () => Promise.reject(new DOMException("Document is not focused.", "NotAllowedError")) };
    expect(await copiarTexto("https://link", recusa)).toBe(false);
  });

  it("navegador sem a API vira false", async () => {
    expect(await copiarTexto("https://link", undefined)).toBe(false);
  });
});

describe("tela de novo grupo (convite criado)", () => {
  const fonte = readFileSync("src/app/plataforma/grupos/novo/componentes.tsx", "utf8");

  it("copia pelo helper, e não pela API crua sem esperar", () => {
    expect(fonte).not.toMatch(/navigator\.clipboard/);
    expect(fonte).toMatch(/await copiarTexto\(/);
  });

  it("na falha, o link fica selecionável e a tela diz como copiar", () => {
    expect(fonte).toMatch(/select-all/);
    expect(fonte).toMatch(/Não deu para copiar/);
  });
});
