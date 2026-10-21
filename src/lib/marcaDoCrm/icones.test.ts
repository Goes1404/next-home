import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifestoDaNextHome from "@/app/manifest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { ICONES_DA_NEXT_HOME, ICONES_NEUTROS, metadadosDoSite } from "@/lib/sites/metadados";
import { marcaDoGrupo } from "@/lib/sites/marca";
import { SITE_EM_BRANCO } from "@/lib/sites/siteEditavel";
import { COR_DA_ASTROIMOB, ICONES_ASTROIMOB, iconesDoGrupo, manifestoDoPainel } from "./icones";

const LOGO = "https://exemplo.supabase.co/storage/v1/object/public/logos/aretz.png";

describe("ícone do painel por grupo", () => {
  it("grupo com logo: a logo dele na aba e no apple-touch-icon", () => {
    expect(iconesDoGrupo({ logoUrl: LOGO })).toEqual({ icon: [{ url: LOGO }], apple: [{ url: LOGO }] });
  });

  it("grupo sem logo: o ícone da AstroImob, nunca o da Next Home", () => {
    const icones = iconesDoGrupo({ logoUrl: null });
    expect(icones).toBe(ICONES_ASTROIMOB);
    expect(JSON.stringify(icones)).not.toMatch(/\/icon\.png|apple-icon|favicon/);
  });

  it("os arquivos do ícone da AstroImob existem, com o tamanho declarado", async () => {
    const arquivos = [
      ["astroimob-180.png", "180x180"],
      ["astroimob-192.png", "192x192"],
      ["astroimob-512.png", "512x512"],
      ["astroimob-mascaravel-512.png", "512x512"],
    ];
    for (const [nome, tamanho] of arquivos) {
      const caminho = join(process.cwd(), "public/icones", nome);
      expect(existsSync(caminho), nome).toBe(true);
      const { width, height } = await sharp(caminho).metadata();
      expect(`${width}x${height}`, nome).toBe(tamanho);
    }
    expect(existsSync(join(process.cwd(), "public/icones/icone-astroimob.svg"))).toBe(true);
  });
});

describe("ícone do site público por grupo", () => {
  const entrada = { grupoId: "g-2", nome: "Aretz Imobi", url: "https://aretz.com.br" };

  it("outro grupo com logo: a logo dele; sem logo: o neutro", () => {
    const com = metadadosDoSite(marcaDoGrupo({ ...entrada, personalizacao: { ...SITE_EM_BRANCO, logoUrl: LOGO } }));
    expect(com.icons).toEqual({ icon: [{ url: LOGO }], apple: [{ url: LOGO }] });
    expect(com.manifest).toBeNull();
    const sem = metadadosDoSite(marcaDoGrupo({ ...entrada, personalizacao: SITE_EM_BRANCO }));
    expect(sem.icons).toEqual(ICONES_NEUTROS);
  });

  it("Next Home: as tags de sempre, mesmo que alguém grave logo no grupo 1", () => {
    const c = metadadosDoSite(
      marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: site.url, personalizacao: { ...SITE_EM_BRANCO, logoUrl: LOGO } }),
    );
    expect(c.icons).toEqual(ICONES_DA_NEXT_HOME);
    expect(c).not.toHaveProperty("manifest");
  });
});

describe("manifesto do painel por grupo", () => {
  it("nome, logo, cor do grupo, start_url no painel", () => {
    const m = manifestoDoPainel({ nome: "Aretz Imobi", logoUrl: LOGO, cor: "#1d4ed8" });
    expect(m).toMatchObject({
      name: "Aretz Imobi",
      short_name: "Aretz Imobi",
      start_url: "/corretor",
      display: "standalone",
      theme_color: "#1d4ed8",
    });
    expect(m.icons).toEqual([{ src: LOGO, sizes: "any", purpose: "any" }]);
  });

  it("sem logo: ícones da AstroImob (com mascarável); sem cor ou cor inválida: a da AstroImob", () => {
    const m = manifestoDoPainel({ nome: "Casa Azul Empreendimentos Ltda", logoUrl: null, cor: "azul" });
    expect(m.theme_color).toBe(COR_DA_ASTROIMOB);
    expect(m.short_name).toBe("Casa Azul Em");
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/next ?home|\/icon\.png/i);
  });

  it("a Next Home segue com o manifesto dela, sem start_url e no navegador", () => {
    const m = manifestoDaNextHome();
    expect(m.display).toBe("browser");
    expect(m).not.toHaveProperty("start_url");
    expect(m.icons?.map((i) => i.src)).toEqual(["/icon.png", "/icones/icone-512.png", "/icones/icone-mascaravel-512.png"]);
  });
});
