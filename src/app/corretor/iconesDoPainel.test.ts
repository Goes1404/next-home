import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { ICONES_ASTROIMOB, CAMINHO_DO_MANIFESTO_DO_PAINEL, MANIFESTO_DA_PLATAFORMA } from "@/lib/marcaDoCrm/icones";
import { APP_DO_IPHONE, META_DO_IPHONE } from "@/lib/marcaDoCrm/iphone";
import { MARCA_NEXT_HOME, marcaDoCrm } from "@/lib/marcaDoCrm/marca";

/**
 * O que o `<head>` do painel e do login declara de ícone e manifesto, por
 * endereço e por grupo. Next Home: nada declarado (os arquivos do raiz valem).
 */
let host = "nexthomeimoveis.com";
let marca = MARCA_NEXT_HOME as ReturnType<typeof marcaDoCrm>;
let corSite: string | null = null;

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }), cookies: async () => new Map() }));
vi.mock("@/lib/marcaDoCrm/doPainel", () => ({ marcaDoPainel: async () => marca }));
vi.mock("@/lib/sites/siteDoGrupo", () => ({ lerSiteDoGrupo: async () => ({ cor: corSite }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => null }));
vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaPagina: async () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/termos/aceite", () => ({ aceitouTermosVigentes: async () => true }));

const aretz = (logo: string | null) => marcaDoCrm("g-2", { nome: "Aretz Imobi", ia_nome_da_casa: null, logo_url: logo });

beforeEach(() => {
  host = "nexthomeimoveis.com";
  marca = MARCA_NEXT_HOME;
  corSite = null;
});

describe("layout do painel", () => {
  it("Next Home: não declara ícone nem manifesto", async () => {
    const { generateMetadata } = await import("./(painel)/layout");
    const m = await generateMetadata();
    expect(m).not.toHaveProperty("icons");
    expect(m).not.toHaveProperty("manifest");
  });

  it("outro grupo com logo: a logo e o manifesto do grupo", async () => {
    marca = aretz("https://x.supabase.co/logo.png");
    const { generateMetadata } = await import("./(painel)/layout");
    const m = await generateMetadata();
    expect(m.icons).toEqual({ icon: [{ url: "https://x.supabase.co/logo.png" }], apple: [{ url: "https://x.supabase.co/logo.png" }] });
    expect(m.manifest).toBe(CAMINHO_DO_MANIFESTO_DO_PAINEL);
  });

  it("outro grupo sem logo: o ícone da Astro Soluções", async () => {
    marca = aretz(null);
    const { generateMetadata } = await import("./(painel)/layout");
    expect((await generateMetadata()).icons).toBe(ICONES_ASTROIMOB);
  });
});

describe("login e telas de /corretor", () => {
  it("em astroimob.vercel.app: ícone e manifesto do app da Astro Soluções, nunca o da Next Home", async () => {
    host = "astroimob.vercel.app";
    const { generateMetadata } = await import("./layout");
    // + o app do iPhone (29/10/2026): sem barra do Safari e com telas de abertura.
    expect(await generateMetadata()).toEqual({ icons: ICONES_ASTROIMOB, manifest: MANIFESTO_DA_PLATAFORMA, appleWebApp: APP_DO_IPHONE, other: META_DO_IPHONE });
  });

  it("no endereço da Next Home: nada declarado", async () => {
    const { generateMetadata } = await import("./layout");
    expect(await generateMetadata()).toEqual({});
  });
});

describe("plataforma", () => {
  it("em astroimob.vercel.app: ícone da Astro Soluções; na Next Home: sem ícone", async () => {
    const { generateMetadata } = await import("../plataforma/layout");
    host = "astroimob.vercel.app";
    expect((await generateMetadata()).icons).toBe(ICONES_ASTROIMOB);
    host = "nexthomeimoveis.com";
    expect(await generateMetadata()).not.toHaveProperty("icons");
  });
});

describe("GET /api/painel/manifest", () => {
  it("outro grupo: nome, logo e cor dele; resposta privada que varia por cookie", async () => {
    marca = aretz("https://x.supabase.co/logo.png");
    corSite = "#b91c1c";
    const { GET } = await import("../api/painel/manifest/route");
    const r = await GET();
    const m = await r.json();
    expect(m).toMatchObject({ name: "Aretz Imobi", start_url: "/corretor", theme_color: "#b91c1c" });
    expect(m.icons[0].src).toBe("https://x.supabase.co/logo.png");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Cookie");
  });

  it("grupo sem logo e sem cor: ícones e cor da Astro Soluções", async () => {
    marca = aretz(null);
    const { GET } = await import("../api/painel/manifest/route");
    const m = await (await GET()).json();
    expect(m.theme_color).toBe("#0f2547");
    expect(m.icons[0].src).toBe("/icones/astroimob-192.png");
  });

  it("Next Home: o manifesto de sempre", async () => {
    const { GET } = await import("../api/painel/manifest/route");
    const m = await (await GET()).json();
    expect(m.name).toBe((await import("@/lib/site")).site.nomeCompleto);
    expect(m.display).toBe("browser");
    expect(marca.grupoId).toBe(GRUPO_NEXT_HOME_ID);
  });
});
