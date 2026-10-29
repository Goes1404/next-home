import { describe, expect, it } from "vitest";
import { CHAVE_DA_ABERTURA, SCRIPT_DA_ABERTURA } from "./AberturaDoApp";

/**
 * A abertura animada só pode aparecer no APP instalado, uma vez por sessão,
 * e nunca para quem pediu menos movimento. Roda o script de verdade contra
 * um `window` falso.
 */
function rodar({ app, calmo = false, jaViu = false }: { app: boolean; calmo?: boolean; jaViu?: boolean }) {
  const atributos = new Map<string, string>();
  const sessao = new Map<string, string>(jaViu ? [[CHAVE_DA_ABERTURA, "1"]] : []);
  const documento = {
    documentElement: {
      setAttribute: (k: string, v: string) => atributos.set(k, v),
      removeAttribute: (k: string) => atributos.delete(k),
    },
    getElementById: () => ({ addEventListener: () => {} }),
  };
  const janela = {
    matchMedia: (q: string) => ({ matches: q.includes("standalone") ? app : q.includes("reduce") ? calmo : false }),
  };
  const fn = new Function("window", "document", "matchMedia", "sessionStorage", "setTimeout", SCRIPT_DA_ABERTURA);
  fn(janela, documento, janela.matchMedia, { getItem: (k: string) => sessao.get(k) ?? null, setItem: (k: string, v: string) => sessao.set(k, v) }, () => 0);
  return { abertura: atributos.get("data-abertura") ?? null, gravou: sessao.has(CHAVE_DA_ABERTURA) };
}

describe("abertura do app", () => {
  it("no app instalado, na primeira abertura da sessão: aparece e marca a sessão", () => {
    expect(rodar({ app: true })).toEqual({ abertura: "sim", gravou: true });
  });
  it("no navegador comum: nunca", () => {
    expect(rodar({ app: false }).abertura).toBeNull();
  });
  it("já vista nesta sessão: não repete", () => {
    expect(rodar({ app: true, jaViu: true }).abertura).toBeNull();
  });
  it("com menos movimento: não aparece", () => {
    expect(rodar({ app: true, calmo: true }).abertura).toBeNull();
  });
});
