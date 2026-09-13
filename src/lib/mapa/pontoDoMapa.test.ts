import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { pontoDoMapa } from "./ponto";

/**
 * O globo e o mapa recebem PONTOS, não o catálogo (F3 do roadmap de
 * performance, 13/09/2026).
 *
 * A home serializava os 25 imóveis inteiros no HTML para um client
 * component desenhar 25 pinos: 252 KB de RSC, 86 KB de gzip na página. A
 * regressão volta com um `empreendimentos={todos}` inocente — build, tipos
 * e tela seguem verdes, porque `Empreendimento` continua sendo um
 * `PontoDoMapa` válido para o TypeScript. Por isso a guarda lê o código.
 */

const RAIZ = join(__dirname, "..", "..", "..");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ler(rel: string): string {
  return semComentarios(readFileSync(join(RAIZ, "src", rel), "utf8"));
}

describe("o globo e o mapa recebem pontos, não o catálogo", () => {
  it("o ponto leva só o que o cartão e o pino leem", () => {
    const e = {
      slug: "x",
      nome: "X",
      bairro: "B",
      cidade: "C",
      endereco: "Rua 1",
      lat: -23.5,
      lng: -46.8,
      status: "em_construcao",
      tipo: "apartamento",
      precoAPartir: 350000,
      capa: { tipo: "foto", url: "u", alt: "a", largura: 10, altura: 10, blurDataUrl: "data:" },
      corretor: { nome: "N", creci: "1", whatsapp: "55", fotoUrl: null, videoUrl: null, fundoTipo: "video", fundoFotoUrl: null },
      galeria: [],
      descricao: "muito longa",
      lazer: ["piscina"],
      tipologias: [],
    } as unknown as Empreendimento;

    const p = pontoDoMapa(e);
    expect(Object.keys(p).sort()).toEqual(
      ["bairro", "capa", "cidade", "corretor", "endereco", "lat", "lng", "nome", "precoAPartir", "slug", "status", "tipo"].sort(),
    );
    expect(p.capa).toEqual({ url: "u", alt: "a", blurDataUrl: "data:" });
    expect(p.corretor).toEqual({ whatsapp: "55" });
    expect("galeria" in p).toBe(false);
    expect("descricao" in p).toBe(false);
  });

  it("as páginas passam pontosDoMapa(), nunca o catálogo", () => {
    for (const rel of ["app/(institucional)/page.tsx", "app/(vitrine)/mapa/page.tsx"]) {
      const fonte = ler(rel);
      expect(fonte, rel).toContain("pontosDoMapa(");
      expect(fonte, rel).not.toMatch(/empreendimentos=\{(todos|todosEmpreendimentos)\}/);
    }
  });

  it("os componentes do mapa não conhecem o tipo Empreendimento", () => {
    for (const rel of [
      "components/mapa/GloboOuMapa.tsx",
      "components/mapa/MapaEmpreendimentos.tsx",
      "components/mapa/MapaInterativoClient.tsx",
      "components/mapa/CardFlutuanteImovel.tsx",
    ]) {
      const fonte = ler(rel);
      expect(fonte, rel).not.toMatch(/\bEmpreendimento\b/);
      expect(fonte, rel).toContain("PontoDoMapa");
    }
  });

  it("o globo só nasce perto da viewport e dorme fora dela", () => {
    expect(ler("components/mapa/GloboOuMapa.tsx")).toMatch(/\{perto && \(\s*<Globo/);
    const globo = ler("components/mapa/GloboImoveis.tsx");
    expect(globo).toContain("IntersectionObserver");
    expect(globo).toMatch(/if \(!visivel\.current && !mergulho\.current\)/);
  });

  it("o laço das camadas e o header só trabalham quando algo rolou", () => {
    const camadas = ler("components/motion/controladorCamadas.ts");
    const tique = camadas.slice(camadas.indexOf("function aoTique()"));
    expect(tique.indexOf("return;")).toBeLessThan(tique.indexOf("getBoundingClientRect"));
    const header = ler("components/motion/HeaderCondensado.tsx");
    expect(header).toMatch(/if \(y === ultimoLido && largura === ultimaLargura\) return;/);
  });
});
