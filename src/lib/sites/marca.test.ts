import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { linhaDoEndereco, marcaDoGrupo, redesDaMarca } from "./marca";

const OUTRO = "11111111-1111-1111-1111-111111111111";

describe("marcaDoGrupo", () => {
  it("o grupo 1 tem a marca da Next Home, com o endereço canônico de site.url", () => {
    const m = marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://qualquer.com" });
    expect(m.ehNextHome).toBe(true);
    expect(m.nome).toBe(site.nome);
    expect(m.creci).toBe(site.creci);
    expect(m.url).toBe(site.url.replace(/\/+$/, ""));
    expect(linhaDoEndereco(m)).toContain(site.endereco.logradouro);
    expect(redesDaMarca(m).length).toBeGreaterThan(0);
  });

  it("outro grupo nunca leva contato da Next Home", () => {
    const m = marcaDoGrupo({ grupoId: OUTRO, nome: "Imobiliária Sol ", url: "https://imobsol.com.br/" });
    expect(m.ehNextHome).toBe(false);
    expect(m.nome).toBe("Imobiliária Sol");
    expect(m.url).toBe("https://imobsol.com.br");
    expect(m.creci).toBeNull();
    expect(m.endereco).toBeNull();
    expect(linhaDoEndereco(m)).toBeNull();
    expect(redesDaMarca(m)).toEqual([]);
    expect(m.regioes).toEqual([]);
    const texto = JSON.stringify(m);
    for (const proibido of [site.nome, site.creci, site.endereco.logradouro, ...site.whatsapp.map((w) => w.numero)]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it("nome vazio não deixa o site sem nome", () => {
    expect(marcaDoGrupo({ grupoId: OUTRO, nome: "  ", url: "https://x.com.br" }).nome).toBe("Imóveis");
  });
});
