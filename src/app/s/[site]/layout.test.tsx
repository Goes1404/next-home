import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { marcaDoGrupo } from "@/lib/sites/marca";
import { SITE_EM_BRANCO } from "@/lib/sites/siteEditavel";

/**
 * O layout do site com as cores de "Meu site" (0209 e 0210): o grupo 1 sai
 * IGUAL com e sem cores editadas (nenhuma tag a mais), e o outro grupo leva o
 * CSS das cores, só quando escolheu alguma.
 */

let marcaAtual: ReturnType<typeof marcaDoGrupo> | null = null;

vi.mock("@/lib/sites/resolver", () => ({
  resolverSite: async () => (marcaAtual ? { grupoId: marcaAtual.grupoId, host: "x.com.br", marca: marcaAtual } : null),
}));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => <footer /> }));

const { default: SiteLayout } = await import("./layout");

const CORES = {
  ...SITE_EM_BRANCO,
  cor: "#1d4ed8",
  corSecundaria: "#0369a1",
  corFundo: "#f3f7fd",
  corTexto: "#0f1f3d",
};

async function html(marca: ReturnType<typeof marcaDoGrupo> | null): Promise<string> {
  marcaAtual = marca;
  const el = await SiteLayout({ children: <main>conteudo</main>, params: Promise.resolve({ site: "x.com.br" }) });
  return renderToStaticMarkup(el);
}

describe("SiteLayout", () => {
  it("grupo 1: o HTML é o mesmo, com ou sem cores editadas, e não tem tag de estilo", async () => {
    const entrada = { grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://x.com.br" };
    const sem = await html(marcaDoGrupo(entrada));
    const com = await html(marcaDoGrupo({ ...entrada, personalizacao: CORES }));
    expect(com).toBe(sem);
    expect(sem).not.toContain("<style");
    expect(sem).not.toContain("--color-");
  });

  it("outro grupo sem cor nenhuma: nenhuma tag de estilo", async () => {
    const entrada = { grupoId: "g-2", nome: "Sol", url: "https://sol.com.br" };
    expect(await html(marcaDoGrupo({ ...entrada, personalizacao: SITE_EM_BRANCO }))).not.toContain("<style");
  });

  it("outro grupo com cores: o CSS vai em :root, com acento, realce, fundo e texto", async () => {
    const entrada = { grupoId: "g-2", nome: "Sol", url: "https://sol.com.br" };
    const saida = await html(marcaDoGrupo({ ...entrada, personalizacao: CORES }));
    expect(saida).toContain("<style>:root{");
    expect(saida).toContain("--color-acento:#1d4ed8");
    expect(saida).toContain("--color-realce:");
    expect(saida).toContain("--color-fundo:#f3f7fd");
    expect(saida).toContain("--color-titulo:#0f1f3d");
    expect(saida).toContain("conteudo");
  });
});

describe("SiteLayout: modo escuro (0212)", () => {
  const entrada = { grupoId: "g-2", nome: "Aretz", url: "https://aretz.com.br" };
  const SO_ESCURO = {
    corEscuro: "#d4a64b",
    corSecundariaEscuro: "#e8c77e",
    corFundoEscuro: "#0e1a10",
    corTextoEscuro: "#f3ebd6",
  };
  const ESCURO = { ...SITE_EM_BRANCO, ...SO_ESCURO };

  it("grupo 1: as cores do escuro não mudam nada (HTML igual, sem tag de estilo)", async () => {
    const g1 = { grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://x.com.br" };
    const sem = await html(marcaDoGrupo(g1));
    const com = await html(marcaDoGrupo({ ...g1, personalizacao: { ...CORES, ...SO_ESCURO } }));
    expect(com).toBe(sem);
    expect(sem).not.toContain("<style");
  });

  it("só cores do escuro: o CSS é só do tema escuro e o seletor não é escondido", async () => {
    const saida = await html(marcaDoGrupo({ ...entrada, personalizacao: ESCURO }));
    expect(saida).toContain('<style>:root[data-tema="escuro"]{');
    expect(saida).toContain("--color-fundo:#0e1a10");
    expect(saida).not.toContain("radiogroup");
  });

  it("claro e escuro: cada tema com as suas", async () => {
    const saida = await html(marcaDoGrupo({ ...entrada, personalizacao: { ...CORES, ...SO_ESCURO } }));
    expect(saida).toContain(':root:not([data-tema="escuro"]){');
    expect(saida).toContain("--color-fundo:#f3f7fd");
    expect(saida).toContain("--color-fundo:#0e1a10");
    expect(saida).not.toContain("radiogroup");
  });
});

describe("SiteLayout: fundo fixo escuro trava o tema escuro (Aretz, 26/10/2026)", () => {
  const entrada = { grupoId: "g-2", nome: "Aretz", url: "https://aretz.com.br" };
  const ESCURO_FIXO = { ...SITE_EM_BRANCO, cor: "#c49c4e", corSecundaria: "#e2c584", corFundo: "#0e1a10", corTexto: "#f9fbf8" };

  it("fundo escuro fixo: script põe data-tema escuro e a barra na cor do fundo", async () => {
    const saida = await html(marcaDoGrupo({ ...entrada, personalizacao: ESCURO_FIXO }));
    expect(saida).toContain('h.setAttribute("data-tema","escuro")');
    expect(saida).toContain('setAttribute("content","#0e1a10")');
  });

  it("fundo claro fixo: nada de script", async () => {
    expect(await html(marcaDoGrupo({ ...entrada, personalizacao: CORES }))).not.toContain("<script");
  });

  it("com cores do modo escuro: o visitante escolhe, nada de script", async () => {
    const saida = await html(marcaDoGrupo({ ...entrada, personalizacao: { ...ESCURO_FIXO, corFundoEscuro: "#0e1a10" } }));
    expect(saida).not.toContain("<script");
  });

  it("grupo 1: nunca", async () => {
    const g1 = { grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://x.com.br" };
    expect(await html(marcaDoGrupo({ ...g1, personalizacao: ESCURO_FIXO }))).not.toContain("<script");
  });
});
