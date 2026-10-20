import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { marcaDoGrupo } from "./marca";
import { metadadosDoSite } from "./metadados";

const casa = marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: site.url });
const outro = marcaDoGrupo({ grupoId: "44444444-4444-4444-4444-444444444444", nome: "Casa Azul", url: "https://casaazul.com.br" });

describe("metadadosDoSite", () => {
  it("o site de outro grupo tem base, título e Open Graph próprios, sem nada da Next Home", () => {
    const m = metadadosDoSite(outro);
    expect(String(m.metadataBase)).toBe("https://casaazul.com.br/");
    expect(m.title).toEqual({ default: "Casa Azul", template: "%s · Casa Azul" });
    expect(m.other).toBeUndefined();
    const texto = JSON.stringify(m).toLowerCase();
    for (const proibido of ["next home", "nexthome", "alphaville", "og-image"]) expect(texto).not.toContain(proibido);
  });

  it("a Next Home mantém o que o layout raiz dizia, com as etiquetas geo", () => {
    const m = metadadosDoSite(casa);
    expect(String(m.metadataBase)).toBe(new URL(site.url).toString());
    expect(m.title).toEqual({
      default: `${site.nomeCompleto} — Imobiliária em Alphaville e Barueri`,
      template: `%s · ${site.nome}`,
    });
    expect(m.other).toMatchObject({ "geo.region": "BR-SP" });
  });

  it("as etiquetas geo saíram do layout raiz (o other é mesclado entre layouts)", () => {
    const raiz = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(raiz).not.toMatch(/geo\.placename|geo\.position|ICBM/);
  });
});
