import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { linhaDoEndereco, marcaDoGrupo, redesDaMarca } from "./marca";
import { SITE_EM_BRANCO, type SiteEditavel } from "./siteEditavel";

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

const PREENCHIDO: SiteEditavel = {
  logoUrl: "https://x.supabase.co/logo.png",
  cor: "#1f6f5c",
  capaUrl: "https://x.supabase.co/capa.jpg",
  titulo: "Título do grupo",
  frase: "Frase do grupo",
  sobre: "Sobre o grupo",
  whatsapp: "5511999998888",
  email: "contato@sol.com.br",
  endereco: { logradouro: "Av. Sol, 1", bairro: "Centro", cidade: "Barueri", uf: "SP", cep: "06404-326" },
  instagram: "https://www.instagram.com/sol/",
  facebook: "https://www.facebook.com/sol",
  creci: "12345",
  creciTipo: "J",
};

describe("marcaDoGrupo com o que o gestor editou (0209)", () => {
  it("GRUPO 1 INALTERADO: nenhum campo de 'Meu site' muda a marca da Next Home", () => {
    const entrada = { grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://qualquer.com" };
    const sem = marcaDoGrupo(entrada);
    const com = marcaDoGrupo({ ...entrada, personalizacao: PREENCHIDO });
    // Igualdade campo a campo e do JSON inteiro (o que o site e o JSON-LD leem).
    expect(com).toEqual(sem);
    expect(JSON.stringify(com)).toBe(JSON.stringify(sem));
    expect(com).toMatchObject({ logoUrl: null, cor: null, capaUrl: null, titulo: null, frase: null, sobre: null, email: null });
    expect(com.nome).toBe(site.nome);
    expect(com.descricao).toBe(site.descricao);
    expect(com.creci).toBe(site.creci);
    expect(com.whatsapp).toEqual(site.whatsapp.map((w) => ({ ...w })));
    expect(com.endereco).toBe(site.endereco);
    expect(com.social).toBe(site.social);
    const texto = JSON.stringify(com);
    for (const dado of ["Título do grupo", "contato@sol.com.br", "5511999998888", "Av. Sol", "#1f6f5c"]) {
      expect(texto, dado).not.toContain(dado);
    }
  });

  it("outro grupo sem nada preenchido cai no comportamento de hoje", () => {
    const base = marcaDoGrupo({ grupoId: OUTRO, nome: "Imobiliária Sol", url: "https://imobsol.com.br" });
    const vazio = marcaDoGrupo({ grupoId: OUTRO, nome: "Imobiliária Sol", url: "https://imobsol.com.br", personalizacao: { ...SITE_EM_BRANCO } });
    expect(vazio).toEqual(base);
    expect(base).toMatchObject({ logoUrl: null, cor: null, capaUrl: null, titulo: null, frase: null, sobre: null, email: null, creci: null, endereco: null, social: null, whatsapp: [] });
  });

  it("outro grupo preenchido usa o que o gestor editou", () => {
    const m = marcaDoGrupo({ grupoId: OUTRO, nome: "Imobiliária Sol", url: "https://imobsol.com.br", personalizacao: PREENCHIDO });
    expect(m).toMatchObject({
      ehNextHome: false,
      logoUrl: PREENCHIDO.logoUrl,
      cor: "#1f6f5c",
      capaUrl: PREENCHIDO.capaUrl,
      titulo: "Título do grupo",
      frase: "Frase do grupo",
      descricao: "Frase do grupo",
      sobre: "Sobre o grupo",
      email: "contato@sol.com.br",
      creci: "12345-J",
      whatsapp: [{ numero: "5511999998888", label: "(11) 99999-8888" }],
    });
    expect(linhaDoEndereco(m)).toBe("Av. Sol, 1 — Centro, Barueri/SP");
    expect(m.endereco?.lat).toBeUndefined();
    expect(redesDaMarca(m).map((r) => r.label)).toEqual(["Instagram", "Facebook"]);
    // Nada da Next Home vaza para o preenchido.
    const texto = JSON.stringify(m);
    for (const proibido of [site.creci, site.endereco.logradouro, ...site.whatsapp.map((w) => w.numero)]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it("o CRECI já com o tipo não leva o tipo duas vezes", () => {
    const m = marcaDoGrupo({ grupoId: OUTRO, nome: "Sol", url: "https://x.com.br", personalizacao: { ...SITE_EM_BRANCO, creci: "12345-J", creciTipo: "J" } });
    expect(m.creci).toBe("12345-J");
  });
});
