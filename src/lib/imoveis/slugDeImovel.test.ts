import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { slugificarImovel, slugLivre } from "./slugDeImovel";

describe("slugificarImovel", () => {
  it("segue a forma dos slugs que já estão no banco", () => {
    expect(slugificarImovel("Terra Alta Barueri")).toBe("terra-alta-barueri");
    expect(slugificarImovel("Vista AlphaGran")).toBe("vista-alphagran");
    expect(slugificarImovel("Arbórea Alphagran")).toBe("arborea-alphagran");
  });

  it("não deixa hífen sobrando nas pontas nem repetido no meio", () => {
    expect(slugificarImovel("  Dom Parque —  P4  ")).toBe("dom-parque-p4");
    expect(slugificarImovel("KA’A Home Boutique")).toBe("ka-a-home-boutique");
  });

  it("corta no limite sem terminar em hífen", () => {
    const gerado = slugificarImovel("A".repeat(58) + " Residencial Alphaville Tamboré");
    expect(gerado.length).toBeLessThanOrEqual(60);
    expect(gerado.endsWith("-")).toBe(false);
  });
});

/** A conferência do banco, de mentira: livre é o que não está no conjunto. */
const conferindo = (ocupados: string[]) => {
  const set = new Set(ocupados);
  return async (slug: string) => !set.has(slug);
};

describe("slugLivre", () => {
  it("usa a base quando ela está livre", async () => {
    expect(await slugLivre("Serenne", conferindo([]))).toBe("serenne");
  });

  it("numera a partir de 2 — o segundo imóvel de mesmo nome", async () => {
    expect(await slugLivre("Royal Barueri", conferindo(["royal-barueri"]))).toBe("royal-barueri-2");
    expect(await slugLivre("Royal Barueri", conferindo(["royal-barueri", "royal-barueri-2"]))).toBe(
      "royal-barueri-3",
    );
  });

  it("nome sem letra nenhuma não vira slug vazio", async () => {
    // Slug vazio produziria a URL da listagem, e o imóvel passaria a
    // responder no lugar de `/empreendimentos`.
    expect(await slugLivre("🏢 ///", conferindo([]))).toBe("imovel");
    expect(await slugLivre("🏢 ///", conferindo(["imovel"]))).toBe("imovel-2");
  });

  // A conferência é do banco, que olha todos os grupos (slug_de_imovel_livre,
  // 0183). Falha dela não vira "livre": quem chama recusa e pede de novo.
  it("erro da conferência sobe, em vez de virar slug livre", async () => {
    await expect(
      slugLivre("Serenne", async () => {
        throw new Error("rede");
      }),
    ).rejects.toThrow("rede");
  });
});

// Achado B da revisão final da fase 1: `empreendimentos.slug` é único na
// plataforma inteira, e a sessão do corretor só lê o próprio grupo (0184). Ler
// os slugs ocupados pela sessão diria "livre" para um slug do grupo A, e o
// insert bateria na chave global com "já existe" para um nome que ninguém do
// grupo usa.
describe("criarImovel confere o slug em todos os grupos", () => {
  const acao = readFileSync(
    join(process.cwd(), "src/app/corretor/(painel)/imoveis/novo/acoes.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("pela função slug_de_imovel_livre", () => {
    expect(acao).toMatch(/rpc\(\s*"slug_de_imovel_livre"/);
  });

  it("e não pelos slugs que a sessão enxerga", () => {
    expect(acao).not.toMatch(/from\("empreendimentos"\)\s*\.select\("slug"\)/);
  });
});
