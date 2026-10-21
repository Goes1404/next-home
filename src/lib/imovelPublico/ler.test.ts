import { beforeEach, describe, expect, it, vi } from "vitest";

/** A leitura do link do imóvel: o grupo 1 não consulta; os outros leem slug e host (cache de 60 s). */

vi.mock("server-only", () => ({}));

let slugDoBanco: string | null = "imobsol";
const consultas: string[] = [];
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      select: () => {
        consultas.push(tabela);
        const cadeia: Record<string, unknown> = {};
        cadeia.eq = () => cadeia;
        cadeia.maybeSingle = () =>
          Promise.resolve(
            tabela === "grupos"
              ? { data: slugDoBanco ? { id: "g", nome: "Imobsol", slug: slugDoBanco } : null, error: null }
              : { data: null, error: null },
          );
        return cadeia;
      },
    }),
  }),
}));

const hostDoGrupo = vi.fn<(g: string) => Promise<string | null>>(async () => null);
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerHostDoGrupo: (g: string) => hostDoGrupo(g) }));

const { linkPublicoDoImovel, lerLinksDoImovel, esquecerSlugsDosGrupos } = await import("./ler");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");
const { site } = await import("@/lib/site");

const OUTRO = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  consultas.length = 0;
  slugDoBanco = "imobsol";
  hostDoGrupo.mockReset().mockResolvedValue(null);
  esquecerSlugsDosGrupos();
});

describe("linkPublicoDoImovel", () => {
  it("grupo 1: o link de sempre e nenhuma leitura", async () => {
    expect(await linkPublicoDoImovel({ grupoId: GRUPO_NEXT_HOME_ID, slug: "vitra", corretorSlug: "bruna" })).toBe(
      `${site.url}/empreendimentos/vitra`,
    );
    expect(consultas).toHaveLength(0);
    expect(hostDoGrupo).not.toHaveBeenCalled();
    expect(await lerLinksDoImovel(GRUPO_NEXT_HOME_ID)).toBeUndefined();
  });

  it("grupo com endereço principal: o site dele", async () => {
    hostDoGrupo.mockResolvedValue("imobsol.com.br");
    expect(await linkPublicoDoImovel({ grupoId: OUTRO, slug: "vitra" })).toBe("https://imobsol.com.br/empreendimentos/vitra");
  });

  it("grupo sem site: a ficha do painel com o corretor; o slug do grupo vai para o cache", async () => {
    const dado = { grupoId: OUTRO, slug: "vitra", corretorSlug: "ana" };
    expect(await linkPublicoDoImovel(dado)).toBe("https://astroimob.vercel.app/imovel/imobsol/vitra?c=ana");
    await linkPublicoDoImovel(dado);
    expect(consultas.filter((t) => t === "grupos")).toHaveLength(1);
  });

  it("leitura do slug que falha não vira link da Next Home", async () => {
    slugDoBanco = null;
    const link = await linkPublicoDoImovel({ grupoId: OUTRO, slug: "vitra", corretorSlug: "ana" });
    expect(link).not.toContain(site.url);
    expect(link).toBe("https://astroimob.vercel.app/empreendimentos/vitra");
  });
});
