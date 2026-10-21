import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O clique num imóvel da seleção: a Next Home segue para a página do imóvel
 * no próprio endereço; o grupo sem site vai para a ficha pública do painel.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: () => {},
}));

const TOKEN = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const NEXT_HOME = "00000000-0000-0000-0000-000000000001";

let linkDoBanco: { grupo_id: string; corretor_id: string } | null;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => {
        const cadeia: Record<string, unknown> = {};
        cadeia.eq = () => cadeia;
        cadeia.maybeSingle = () => Promise.resolve({ data: linkDoBanco, error: null });
        return cadeia;
      },
    }),
  }),
}));
vi.mock("@/lib/crm/eventosDoLink", () => ({ registrarEventoDoLink: vi.fn() }));
vi.mock("@/lib/crm/linksDoCliente", () => ({ linkValido: () => true }));
vi.mock("@/lib/catalogo/cache", () => ({
  corretoresPublicos: async () => [{ id: "c1", slug: "ana" }],
}));
vi.mock("@/lib/imovelPublico/ler", () => ({
  linkPublicoDoImovel: async (p: { grupoId: string; slug: string; corretorSlug?: string | null }) =>
    `https://astroimob.vercel.app/imovel/imobsol/${p.slug}${p.corretorSlug ? `?c=${p.corretorSlug}` : ""}`,
}));

const { GET } = await import("./route");

async function destino(caminho: string): Promise<string | null> {
  const r = await GET(new Request(`https://astroimob.vercel.app${caminho}`), {
    params: Promise.resolve({ token: TOKEN, slug: "vitra" }),
  });
  return r.headers.get("location");
}

beforeEach(() => {
  linkDoBanco = null;
});

describe("seleção do cliente: o clique no imóvel", () => {
  it("grupo 1: a página do imóvel no próprio endereço, como sempre", async () => {
    linkDoBanco = { grupo_id: NEXT_HOME, corretor_id: "c1" };
    expect(await destino(`/selecao/${TOKEN}/ir/vitra`)).toBe("https://astroimob.vercel.app/empreendimentos/vitra");
  });

  it("grupo sem site: a ficha pública, com o corretor da seleção", async () => {
    linkDoBanco = { grupo_id: OUTRO, corretor_id: "c1" };
    expect(await destino(`/selecao/${TOKEN}/ir/vitra`)).toBe("https://astroimob.vercel.app/imovel/imobsol/vitra?c=ana");
    // A prévia do corretor também vai para a ficha.
    expect(await destino(`/selecao/${TOKEN}/ir/vitra?previa=1`)).toBe("https://astroimob.vercel.app/imovel/imobsol/vitra?c=ana");
  });

  it("token que não existe: o destino de sempre, sem travar", async () => {
    expect(await destino(`/selecao/${TOKEN}/ir/vitra`)).toBe("https://astroimob.vercel.app/empreendimentos/vitra");
  });
});
