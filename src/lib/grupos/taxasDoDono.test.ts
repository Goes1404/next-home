// Guarda: quem atende em nome de um corretor lê as taxas do simulador pelo
// grupo DELE, não pelo grupo do site (0182).
//
// O webhook do WhatsApp responde pelo número de um corretor, e a seleção
// (`/selecao/<token>`) é o link que um corretor mandou. Com `grupoDoSite()`,
// o cliente de uma imobiliária ouviria as taxas de outra — e a regressão é
// calada: o simulador continua funcionando, só com o número errado. Por isso
// a guarda lê o código, como `escalaDoPainel.test.ts`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(__dirname, "..", "..", "..");
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

describe("taxas do simulador pelo grupo do dono", () => {
  it("o webhook lê as taxas pelo grupo da instância", () => {
    const rota = ler("src/app/api/webhooks/whatsapp/route.ts");
    expect(rota).toContain("getParametrosCredito(instancia.grupoId)");
    expect(rota).not.toMatch(/getParametrosCredito\(\s*grupoDoSite\(\)/);
  });

  it("a instância resolvida traz o grupo do banco", () => {
    const repositorio = ler("src/lib/whatsapp/repositorio.ts");
    const corpo = repositorio.slice(repositorio.indexOf("export async function resolverInstancia"));
    expect(corpo).toMatch(/\.select\(\s*"[^"]*\bgrupo_id\b/);
    expect(corpo).toContain("grupoId: data.grupo_id");
  });

  it("a seleção lê as taxas pelo grupo do link", () => {
    const pagina = ler("src/app/(institucional)/selecao/[token]/page.tsx");
    expect(pagina).toContain("getParametrosCredito(link.grupoId)");
    expect(pagina).not.toMatch(/getParametrosCredito\(\s*grupoDoSite\(\)/);

    const link = ler("src/lib/crm/linkPublico.ts");
    expect(link).toContain("grupoId: link.grupo_id");
  });
});
