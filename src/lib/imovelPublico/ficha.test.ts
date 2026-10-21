import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ficha pública: 404 (nulo) para grupo inexistente, imóvel de outro grupo ou
 * não publicado; o corretor só vale do mesmo grupo; sem corretor, sem botão.
 */

vi.mock("server-only", () => ({}));

const GRUPO_A = "22222222-2222-2222-2222-222222222222";
const GRUPO_B = "33333333-3333-3333-3333-333333333333";

const grupos: Record<string, { id: string; nome: string } | null> = {
  imobsol: { id: GRUPO_A, nome: "Imobsol" },
  outra: { id: GRUPO_B, nome: "Outra" },
  nexthome: { id: "00000000-0000-0000-0000-000000000001", nome: "Next Home" },
};
const lerGrupoPorSlug = vi.fn(async (slug: string) => grupos[slug] ?? null);
vi.mock("./ler", () => ({ lerGrupoPorSlug: (s: string) => lerGrupoPorSlug(s) }));

// Só o grupo A publica "vitra"; o grupo B publica "eternity".
const publicados: Record<string, string[]> = { [GRUPO_A]: ["vitra"], [GRUPO_B]: ["eternity"] };
const getEmpreendimentoBySlug = vi.fn(async (grupoId: string, slug: string) =>
  (publicados[grupoId] ?? []).includes(slug) ? { slug, nome: `Imóvel ${slug}` } : null,
);
const equipe: Record<string, { slug: string; nome: string; whatsapp: string }[]> = {
  [GRUPO_A]: [{ slug: "ana", nome: "Ana Souza", whatsapp: "(11) 99999-0001" }],
  [GRUPO_B]: [{ slug: "beto", nome: "Beto Lima", whatsapp: "11988880002" }],
};
const getCorretorPorSlug = vi.fn(async (grupoId: string, slug: string) => (equipe[grupoId] ?? []).find((c) => c.slug === slug) ?? null);
vi.mock("@/lib/queries", () => ({
  getEmpreendimentoBySlug: (g: string, s: string) => getEmpreendimentoBySlug(g, s),
  getCorretorPorSlug: (g: string, s: string) => getCorretorPorSlug(g, s),
}));
vi.mock("@/lib/marcaDoCrm/ler", () => ({
  lerMarcaDoCrm: async (grupoId: string) => ({ grupoId, nome: grupoId === GRUPO_A ? "Imobsol" : "Outra" }),
}));

const { lerFichaPublica, linkDoWhatsappDaFicha } = await import("./ficha");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lerFichaPublica", () => {
  it("mostra o imóvel publicado do grupo da URL, com a marca dele", async () => {
    const f = await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "vitra" });
    expect(f?.imovel.slug).toBe("vitra");
    expect(f?.marca.nome).toBe("Imobsol");
    expect(f?.corretor).toBeNull();
    expect(getEmpreendimentoBySlug).toHaveBeenCalledWith(GRUPO_A, "vitra");
  });

  it("recusa imóvel de OUTRO grupo e imóvel não publicado (mesmo resultado)", async () => {
    expect(await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "eternity" })).toBeNull();
    expect(await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "rascunho" })).toBeNull();
  });

  it("grupo inexistente ou a Next Home (que tem site) dão nulo", async () => {
    expect(await lerFichaPublica({ grupoSlug: "nao-existe", imovelSlug: "vitra" })).toBeNull();
    expect(await lerFichaPublica({ grupoSlug: "nexthome", imovelSlug: "vitra" })).toBeNull();
    expect(getEmpreendimentoBySlug).not.toHaveBeenCalled();
  });

  it("?c= de corretor do mesmo grupo vale; o de outro grupo é ignorado", async () => {
    const certo = await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "vitra", corretorSlug: "ana" });
    expect(certo?.corretor?.slug).toBe("ana");

    const alheio = await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "vitra", corretorSlug: "beto" });
    expect(alheio?.corretor).toBeNull();
    expect(getCorretorPorSlug).toHaveBeenCalledWith(GRUPO_A, "beto");
  });

  it("?c= que não é slug nem consulta", async () => {
    const f = await lerFichaPublica({ grupoSlug: "imobsol", imovelSlug: "vitra", corretorSlug: "a b&c" });
    expect(f?.corretor).toBeNull();
    expect(getCorretorPorSlug).not.toHaveBeenCalled();
  });
});

describe("linkDoWhatsappDaFicha", () => {
  it("abre o WhatsApp do corretor com a mensagem que cita o imóvel", () => {
    const link = linkDoWhatsappDaFicha({ nome: "Ana Souza", whatsapp: "(11) 99999-0001" }, "Vitra");
    expect(link).toContain("https://wa.me/11999990001?text=");
    expect(decodeURIComponent(link!.split("text=")[1])).toBe("Oi, Ana! Vi o Vitra e quero saber mais.");
  });

  it("sem corretor ou sem número, sem botão", () => {
    expect(linkDoWhatsappDaFicha(null, "Vitra")).toBeNull();
    expect(linkDoWhatsappDaFicha({ nome: "Ana", whatsapp: "" }, "Vitra")).toBeNull();
  });
});
