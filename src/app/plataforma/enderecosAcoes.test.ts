import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O endereço do site de um grupo, pela plataforma (0201 + 0209): só o
 * administrador da plataforma, host validado, host de outro grupo traduzido,
 * principal único, e o rastro em `admin_eventos`.
 */

const OPERADOR = "operador-1";
const G1 = "00000000-0000-4000-8000-0000000000aa";
const G2 = "00000000-0000-4000-8000-0000000000bb";
const NEXT_HOME = "00000000-0000-0000-0000-000000000001";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("server-only", () => ({}));

const { ligarEnderecoDoSite, removerEnderecoDoSite } = await import("./enderecosAcoes");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.DOMINIO_DA_PLATAFORMA;
  guarda = { userId: OPERADOR };
  banco = bancoFalso({
    grupos: [{ id: G1 }, { id: G2 }],
    enderecos_do_site: [{ host: "ja-usado.com.br", grupo_id: G2, tipo: "proprio", principal: true }],
    admin_eventos: [],
  });
});

describe("ligarEnderecoDoSite", () => {
  it("o primeiro endereço do grupo vira principal e fica o evento", async () => {
    expect(await ligarEnderecoDoSite(G1, { host: "https://WWW.ImobSol.com.br/", tipo: "proprio", principal: false })).toEqual({ ok: true });
    expect(banco.tabelas.enderecos_do_site).toContainEqual(
      expect.objectContaining({ host: "www.imobsol.com.br", grupo_id: G1, tipo: "proprio", principal: true }),
    );
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        grupo_id: G1,
        acao: "endereco_do_site_ligado",
        ator_plataforma_user_id: OPERADOR,
        detalhes: expect.objectContaining({ host: "www.imobsol.com.br", principal: true }),
      }),
    );
  });

  it("novo principal solta o antigo (um principal por grupo)", async () => {
    await ligarEnderecoDoSite(G1, { host: "a.imobsol.com.br", tipo: "proprio", principal: true });
    await ligarEnderecoDoSite(G1, { host: "b.imobsol.com.br", tipo: "gratuito", principal: true });
    const do1 = banco.tabelas.enderecos_do_site.filter((e) => e.grupo_id === G1);
    expect(do1.filter((e) => e.principal).map((e) => e.host)).toEqual(["b.imobsol.com.br"]);
    expect(do1).toHaveLength(2);
  });

  it("só o administrador da plataforma: gestor ou corretor é recusado antes de qualquer gravação", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    expect(await ligarEnderecoDoSite(G1, { host: "x.com.br", tipo: "proprio", principal: true })).toEqual({ ok: false, erro: guarda.erro });
    expect(await removerEnderecoDoSite(G2, "ja-usado.com.br")).toEqual({ ok: false, erro: guarda.erro });
    expect(banco.consultas).toHaveLength(0);
    expect(banco.tabelas.enderecos_do_site).toHaveLength(1);
  });

  it("recusa host inválido, com a razão", async () => {
    for (const host of ["", "localhost", "a b.com", "x.com:8080", "user@x.com", "x..com"]) {
      const r = await ligarEnderecoDoSite(G1, { host, tipo: "proprio", principal: false });
      expect(r.ok, host).toBe(false);
    }
    expect(banco.tabelas.enderecos_do_site).toHaveLength(1);
  });

  it("recusa endereço da plataforma, da Next Home e do painel", async () => {
    process.env.DOMINIO_DA_PLATAFORMA = "plataforma.com.br";
    for (const host of ["www.nexthomeimoveis.com", "astroimob.vercel.app", "plataforma.com.br", "sol.plataforma.com.br"]) {
      const r = await ligarEnderecoDoSite(G1, { host, tipo: "proprio", principal: false });
      expect(r, host).toMatchObject({ ok: false, erro: expect.stringContaining("plataforma") });
    }
    expect(banco.tabelas.enderecos_do_site).toHaveLength(1);
  });

  it("host já usado por outro grupo vira mensagem clara (a PK recusa)", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela) as Record<string, unknown>;
      if (tabela === "enderecos_do_site") {
        q.insert = () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
      }
      return q as ReturnType<typeof original>;
    };
    const r = await ligarEnderecoDoSite(G1, { host: "ja-usado.com.br", tipo: "proprio", principal: true });
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("já está ligado") });
    expect(banco.tabelas.admin_eventos).toHaveLength(0);
  });

  it("tipo fora da lista, grupo torto e grupo inexistente são recusados; a Next Home não se mexe aqui", async () => {
    expect((await ligarEnderecoDoSite(G1, { host: "x.com.br", tipo: "qualquer" as never, principal: false })).ok).toBe(false);
    expect(await ligarEnderecoDoSite("nao-e-uuid", { host: "x.com.br", tipo: "proprio", principal: false })).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(await ligarEnderecoDoSite("00000000-0000-4000-8000-0000000000cc", { host: "x.com.br", tipo: "proprio", principal: false })).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect((await ligarEnderecoDoSite(NEXT_HOME, { host: "x.com.br", tipo: "proprio", principal: false })).ok).toBe(false);
    expect(banco.tabelas.enderecos_do_site).toHaveLength(1);
  });
});

describe("removerEnderecoDoSite", () => {
  it("tira o endereço do grupo e deixa o evento", async () => {
    expect(await removerEnderecoDoSite(G2, "JA-USADO.com.br")).toEqual({ ok: true });
    expect(banco.tabelas.enderecos_do_site).toHaveLength(0);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({ grupo_id: G2, acao: "endereco_do_site_removido", ator_plataforma_user_id: OPERADOR }),
    );
  });

  it("não tira o endereço de OUTRO grupo", async () => {
    expect(await removerEnderecoDoSite(G1, "ja-usado.com.br")).toEqual({ ok: false, erro: "Endereço não encontrado neste grupo." });
    expect(banco.tabelas.enderecos_do_site).toHaveLength(1);
  });

  it("a Next Home e o id torto não passam", async () => {
    expect((await removerEnderecoDoSite(NEXT_HOME, "www.nexthomeimoveis.com")).ok).toBe(false);
    expect((await removerEnderecoDoSite("x", "a.com.br")).ok).toBe(false);
  });
});
