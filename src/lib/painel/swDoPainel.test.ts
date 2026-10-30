import { describe, expect, it } from "vitest";
import { avisarServiceWorkers, ehRegistroDoPainel, esperarAtivo, inscricaoDoPainel } from "./swDoPainel";

/**
 * O service worker do painel (30/10/2026): mensagens chegam mesmo sem
 * controlador e a inscrição de push do registro ANTIGO (`/corretor/`)
 * continua achada depois do registro novo (`/corretor`).
 */
const worker = (nome: string, caixa: string[]) => ({ postMessage: (m: { tipo: string }) => caixa.push(`${nome}:${m.tipo}`) });
const registro = (scope: string, extra: Record<string, unknown> = {}) =>
  ({ scope, active: null, installing: null, waiting: null, pushManager: { getSubscription: async () => null }, ...extra }) as never;

describe("swDoPainel", () => {
  it("reconhece o escopo novo e o antigo, e nada mais", () => {
    expect(ehRegistroDoPainel("https://a.app/corretor")).toBe(true);
    expect(ehRegistroDoPainel("https://a.app/corretor/")).toBe(true);
    expect(ehRegistroDoPainel("https://a.app/corretores/")).toBe(false);
    expect(ehRegistroDoPainel("https://a.app/")).toBe(false);
  });

  it("limpar-dados chega ao worker ativo de cada registro mesmo com controller nulo", async () => {
    const caixa: string[] = [];
    const n = await avisarServiceWorkers(
      { tipo: "limpar-dados" },
      {
        controller: null,
        getRegistrations: async () => [
          registro("https://a.app/corretor", { active: worker("novo", caixa) }),
          registro("https://a.app/corretor/", { active: worker("antigo", caixa) }),
          registro("https://a.app/x/", { active: worker("alheio", caixa) }),
        ],
      },
    );
    expect(n).toBe(2);
    expect(caixa.sort()).toEqual(["antigo:limpar-dados", "novo:limpar-dados"]);
  });

  it("o controller que também é o ativo recebe uma vez só", async () => {
    const caixa: string[] = [];
    const w = worker("unico", caixa);
    await avisarServiceWorkers({ tipo: "limpar-dados" }, { controller: w, getRegistrations: async () => [registro("https://a.app/corretor", { active: w })] });
    expect(caixa).toEqual(["unico:limpar-dados"]);
  });

  it("acha a inscrição de push do registro antigo (avisos de quem já ligou não somem)", async () => {
    const inscricao = { endpoint: "https://push/1" };
    const achada = await inscricaoDoPainel({
      controller: null,
      getRegistrations: async () => [
        registro("https://a.app/corretor"),
        registro("https://a.app/corretor/", { pushManager: { getSubscription: async () => inscricao } }),
      ],
    });
    expect(achada).toBe(inscricao);
  });

  it("sem service worker no navegador: nada quebra", async () => {
    expect(await avisarServiceWorkers({ tipo: "limpar-dados" }, undefined)).toBe(0);
    expect(await inscricaoDoPainel(undefined)).toBeNull();
  });

  it("esperarAtivo resolve quando o worker instalado ativa", async () => {
    let ouvinte: () => void = () => {};
    const w = { state: "installing", addEventListener: (_: string, f: () => void) => (ouvinte = f) };
    const p = esperarAtivo(registro("https://a.app/corretor", { installing: w }));
    w.state = "activated";
    ouvinte();
    await expect(p).resolves.toBeUndefined();
  });
});
