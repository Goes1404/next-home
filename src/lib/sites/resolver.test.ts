import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O resolvedor: os endereços da Next Home não pagam consulta; o resto
 * pergunta a `site_do_endereco`; erro do banco lança (nunca vira "endereço
 * desconhecido", que serviria a página neutra no lugar do site do cliente).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const rpc = vi.fn();
const lerGrupo = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc,
    from: (tabela: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => lerGrupo(tabela) }) }),
    }),
  }),
}));

const { resolverSite, ehEnderecoDaNextHome } = await import("./resolver");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

const OUTRO = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  rpc.mockReset();
  lerGrupo.mockReset();
  lerGrupo.mockResolvedValue({ data: {}, error: null });
  delete process.env.DOMINIO_DA_PLATAFORMA;
  delete process.env.VERCEL_ENV;
});

describe("resolverSite", () => {
  it("os endereços da Next Home e a máquina local não consultam o banco", async () => {
    for (const host of ["www.nexthomeimoveis.com", "NextHomeImoveis.com", "next-home-drab.vercel.app", "localhost:3000"]) {
      const s = await resolverSite(host);
      expect(s?.grupoId, host).toBe(GRUPO_NEXT_HOME_ID);
      expect(s?.marca.ehNextHome).toBe(true);
    }
    expect(rpc).not.toHaveBeenCalled();
    // E nem lê o "Meu site": o grupo 1 não usa os campos novos.
    expect(lerGrupo).not.toHaveBeenCalled();
  });

  it("grupo 1 por endereço do banco também não lê nem usa o Meu site", async () => {
    rpc.mockResolvedValue({ data: [{ grupo_id: GRUPO_NEXT_HOME_ID, nome: "Next Home", host_principal: "nexthomeimoveis.com" }], error: null });
    const s = await resolverSite("outro.nexthomeimoveis.com");
    expect(lerGrupo).not.toHaveBeenCalled();
    expect(s?.marca).toMatchObject({ cor: null, logoUrl: null, titulo: null });
  });

  it("outro grupo lê o Meu site e a marca leva os campos preenchidos", async () => {
    rpc.mockResolvedValue({ data: [{ grupo_id: OUTRO, nome: "Imobiliária Sol", host_principal: "imobsol.com.br" }], error: null });
    lerGrupo.mockResolvedValue({
      data: {
        logo_url: "https://x.supabase.co/l.png",
        creci: "999",
        creci_tipo: "J",
        site_cor: "#1f6f5c",
        site_capa_url: null,
        site_titulo: "Olá",
        site_frase: null,
        site_sobre: "Sobre nós",
        site_whatsapp: "5511999998888",
        site_email: null,
        site_endereco: { logradouro: "Av. 1", bairro: "Centro", cidade: "Barueri", uf: "SP", cep: "06404-326" },
        site_instagram: null,
        site_facebook: null,
      },
      error: null,
    });
    const s = await resolverSite("imobsol.com.br");
    expect(lerGrupo).toHaveBeenCalledWith("grupos");
    expect(s?.marca).toMatchObject({ cor: "#1f6f5c", titulo: "Olá", sobre: "Sobre nós", creci: "999-J", logoUrl: "https://x.supabase.co/l.png" });
    expect(s?.marca.endereco?.cidade).toBe("Barueri");
  });

  it("antes da 0209 (coluna inexistente) o site segue como estava", async () => {
    rpc.mockResolvedValue({ data: [{ grupo_id: OUTRO, nome: "Imobiliária Sol", host_principal: "imobsol.com.br" }], error: null });
    lerGrupo.mockResolvedValue({ data: null, error: { code: "42703", message: "column does not exist" } });
    const s = await resolverSite("imobsol.com.br");
    expect(s?.marca).toMatchObject({ cor: null, titulo: null, sobre: null, creci: null });
  });

  it("erro de leitura do Meu site LANÇA (não serve o padrão no lugar do site do cliente)", async () => {
    rpc.mockResolvedValue({ data: [{ grupo_id: OUTRO, nome: "Imobiliária Sol", host_principal: "imobsol.com.br" }], error: null });
    lerGrupo.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(resolverSite("imobsol.com.br")).rejects.toThrow(/boom/);
  });

  it("domínio de outro grupo vem do banco, com a marca neutra e o endereço principal", async () => {
    rpc.mockResolvedValue({
      data: [{ grupo_id: OUTRO, nome: "Imobiliária Sol", host_principal: "imobsol.com.br" }],
      error: null,
    });
    const s = await resolverSite("www.imobsol.com.br");
    expect(rpc).toHaveBeenCalledWith("site_do_endereco", {
      p_host: "www.imobsol.com.br",
      p_dominio_da_plataforma: null,
    });
    expect(s).toMatchObject({ grupoId: OUTRO, host: "www.imobsol.com.br" });
    expect(s?.marca).toMatchObject({ ehNextHome: false, nome: "Imobiliária Sol", url: "https://imobsol.com.br" });
  });

  it("passa o domínio da plataforma quando ele existe", async () => {
    process.env.DOMINIO_DA_PLATAFORMA = "Plataforma.com.br";
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await resolverSite("sol.plataforma.com.br")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("site_do_endereco", {
      p_host: "sol.plataforma.com.br",
      p_dominio_da_plataforma: "plataforma.com.br",
    });
  });

  it("host desconhecido, inválido ou o segmento sem endereço dão nulo", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await resolverSite("naoexiste.com.br")).toBeNull();
    expect(await resolverSite("desconhecido")).toBeNull();
    expect(await resolverSite("a/b")).toBeNull();
    expect(await resolverSite(null)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do banco lança em vez de virar página neutra", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } });
    await expect(resolverSite("imobsol2.com.br")).rejects.toThrow(/imobsol2\.com\.br/);
  });
});

describe("ehEnderecoDaNextHome", () => {
  it("preview da Vercel é da Next Home só no ambiente de preview", () => {
    expect(ehEnderecoDaNextHome("next-home-abc123.vercel.app")).toBe(false);
    process.env.VERCEL_ENV = "preview";
    expect(ehEnderecoDaNextHome("next-home-abc123.vercel.app")).toBe(true);
    expect(ehEnderecoDaNextHome("imobsol.com.br")).toBe(false);
  });
});
