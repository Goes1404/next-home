import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sessão do painel: quem é o corretor logado e de que grupo ele é.
 *
 * O banco já recusa corretor desativado (`grupo_atual()`, `corretor_atual()`
 * e `eh_gestor()` filtram `ativo`, 0181). Esta é a outra metade: sem ela, o
 * painel abriria para o desativado e cada consulta voltaria vazia, sem
 * explicação. Desativado cai na tela de conta sem vínculo, como quem não tem
 * cadastro.
 */

let linha: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "usuario-1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }),
      }),
    }),
  }),
}));

const { getCorretorLogado } = await import("./corretorSessao");

function corretor(campos: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "corretor-1",
    nome: "Fulana",
    slug: "fulana",
    creci: "123",
    whatsapp: "5511900000000",
    papel: "corretor",
    ativo: true,
    grupo_id: "00000000-0000-0000-0000-000000000001",
    ...campos,
  };
}

describe("getCorretorLogado", () => {
  beforeEach(() => {
    linha = null;
  });

  it("devolve o grupo do corretor logado", async () => {
    linha = corretor({ grupo_id: "grupo-b" });
    const eu = await getCorretorLogado();
    expect(eu?.grupoId).toBe("grupo-b");
    expect(eu?.papel).toBe("corretor");
  });

  it("traz o tipo do grupo, para o menu esconder o que é de equipe", async () => {
    linha = corretor({ grupo: { tipo: "independente" } });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("independente");

    linha = corretor({ grupo: { tipo: "imobiliaria" } });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("imobiliaria");
  });

  it("sem a linha do grupo, o menu fica como antes (imobiliária)", async () => {
    linha = corretor({ grupo: null });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("imobiliaria");
  });

  it("corretor desativado não tem sessão no painel", async () => {
    linha = corretor({ ativo: false, papel: "gestor" });
    expect(await getCorretorLogado()).toBeNull();
  });

  it("conta sem cadastro publicável continua sem sessão", async () => {
    linha = corretor({ slug: null });
    expect(await getCorretorLogado()).toBeNull();
  });
});
