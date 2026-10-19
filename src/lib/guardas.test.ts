import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As guardas da área da plataforma (fase 2A, Task 3).
 *
 * Quem decide é a SESSÃO, pelo banco: `eh_admin_da_plataforma()` lê
 * `administradores_da_plataforma` com o `auth.uid()` do JWT. Nunca a chave de
 * serviço (ela diria "sim" para qualquer um, porque ignora quem chama), e
 * nunca a ficha em `corretores`: o administrador da plataforma pode não ser
 * corretor de grupo nenhum, e `getCorretorLogado()` devolveria `null` para
 * ele.
 */

let usuario: string | null = "usuario-admin";
let respostaDoBanco: { data: unknown; error: unknown } = { data: true, error: null };
const rpcsChamadas: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: usuario ? { claims: { sub: usuario } } : null, error: null }),
    },
    rpc: async (nome: string) => {
      rpcsChamadas.push(nome);
      return respostaDoBanco;
    },
  }),
}));

// Quem chamar a ficha de corretor aqui erra: o administrador pode não ter uma.
const getCorretorLogado = vi.fn(async () => null);
vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("a guarda não pode decidir pela chave de serviço");
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { exigirAdminDaPlataformaNaPagina, exigirAdminDaPlataformaNaAcao } = await import("./guardas");

describe("guardas da plataforma", () => {
  beforeEach(() => {
    usuario = "usuario-admin";
    respostaDoBanco = { data: true, error: null };
    rpcsChamadas.length = 0;
    getCorretorLogado.mockClear();
  });

  it("guarda recusa quem não é administrador", async () => {
    respostaDoBanco = { data: false, error: null };
    await expect(exigirAdminDaPlataformaNaPagina()).rejects.toThrow("NEXT_NOT_FOUND");
    const acao = await exigirAdminDaPlataformaNaAcao();
    expect(acao).toHaveProperty("erro");
    expect(rpcsChamadas).toEqual(["eh_admin_da_plataforma", "eh_admin_da_plataforma"]);
  });

  it("recusa sem sessão, sem perguntar ao banco", async () => {
    usuario = null;
    await expect(exigirAdminDaPlataformaNaPagina()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await exigirAdminDaPlataformaNaAcao()).toHaveProperty("erro");
    expect(rpcsChamadas).toEqual([]);
  });

  it("erro do banco recusa (na dúvida, não é administrador)", async () => {
    respostaDoBanco = { data: null, error: { message: "falhou" } };
    await expect(exigirAdminDaPlataformaNaPagina()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await exigirAdminDaPlataformaNaAcao()).toHaveProperty("erro");
  });

  it("resposta que não é `true` recusa", async () => {
    respostaDoBanco = { data: "true", error: null };
    await expect(exigirAdminDaPlataformaNaPagina()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("aceita sem ficha de corretor", async () => {
    expect(await exigirAdminDaPlataformaNaPagina()).toEqual({ userId: "usuario-admin" });
    expect(await exigirAdminDaPlataformaNaAcao()).toEqual({ userId: "usuario-admin" });
    expect(getCorretorLogado).not.toHaveBeenCalled();
  });
});
