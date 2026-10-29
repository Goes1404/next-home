import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sessão do painel: quem é o corretor logado e de que grupo ele é.
 *
 * O banco já recusa corretor desativado (`grupo_atual()`, `corretor_atual()`
 * e `eh_gestor()` filtram `ativo`, 0190). Esta é a outra metade: sem ela, o
 * painel abriria para o desativado e cada consulta voltaria vazia, sem
 * explicação. Desativado cai na tela de conta sem vínculo, como quem não tem
 * cadastro.
 */

let linha: Record<string, unknown> | null = null;
/** O que a leitura de `grupos` devolve; uma função que lança simula rede/erro. */
let grupo: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: null, error: null });
let selectDeCorretores = "";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "usuario-1" } } }) },
    from: (tabela: string) => {
      if (tabela === "grupos") {
        return { select: () => ({ maybeSingle: () => grupo() }) };
      }
      return {
        select: (colunas: string) => {
          selectDeCorretores = colunas;
          return { eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) };
        },
      };
    },
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
    grupo = async () => ({ data: null, error: null });
    selectDeCorretores = "";
  });

  it("devolve o grupo do corretor logado", async () => {
    linha = corretor({ grupo_id: "grupo-b" });
    const eu = await getCorretorLogado();
    expect(eu?.grupoId).toBe("grupo-b");
    expect(eu?.papel).toBe("corretor");
  });

  it("traz o tipo do grupo, para o menu esconder o que é de equipe", async () => {
    linha = corretor({ grupo_id: "grupo-b" });
    grupo = async () => ({ data: { id: "grupo-b", tipo: "independente" }, error: null });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("independente");

    grupo = async () => ({ data: { id: "grupo-b", tipo: "imobiliaria" }, error: null });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("imobiliaria");
  });

  it("sem a linha do grupo, o menu fica como antes (imobiliária)", async () => {
    linha = corretor();
    grupo = async () => ({ data: null, error: null });
    expect((await getCorretorLogado())?.tipoDoGrupo).toBe("imobiliaria");
  });

  // A consulta crítica da sessão (68 chamadores) não pode depender da
  // leitura do tipo, que só serve ao menu: um embed que desse erro voltaria
  // `data: null` e o painel inteiro viraria "conta sem vínculo".
  it("a consulta de corretores não embute grupos", async () => {
    linha = corretor();
    await getCorretorLogado();
    expect(selectDeCorretores).not.toMatch(/grupos?\s*[:(]/);
    expect(selectDeCorretores).toContain("grupo_id");
  });

  it("erro ao ler o grupo não derruba a sessão: o menu fica como antes", async () => {
    linha = corretor();
    grupo = async () => ({ data: null, error: { code: "PGRST201", message: "ambíguo" } });
    const eu = await getCorretorLogado();
    expect(eu?.slug).toBe("fulana");
    expect(eu?.tipoDoGrupo).toBe("imobiliaria");

    grupo = async () => {
      throw new Error("fetch failed");
    };
    const deNovo = await getCorretorLogado();
    expect(deNovo?.slug).toBe("fulana");
    expect(deNovo?.tipoDoGrupo).toBe("imobiliaria");
  });

  it("traz o ramo do grupo (0244), para o painel ser o CRM do negócio", async () => {
    linha = corretor({ grupo_id: "grupo-b" });
    grupo = async () => ({ data: { id: "grupo-b", tipo: "imobiliaria", ramo: "advocacia", ramo_descricao: null }, error: null });
    const eu = await getCorretorLogado();
    expect(eu?.ramo).toBe("advocacia");
    expect(eu?.ramoDescricao).toBeNull();

    grupo = async () => ({ data: { id: "grupo-b", tipo: "independente", ramo: "outro", ramo_descricao: " Pet  shop " }, error: null });
    expect(await getCorretorLogado()).toMatchObject({ ramo: "outro", ramoDescricao: "Pet shop", tipoDoGrupo: "independente" });
  });

  it("sem a coluna ramo (antes da 0244), o tipo continua valendo e o ramo é imobiliária", async () => {
    linha = corretor({ grupo_id: "grupo-b" });
    let chamadas = 0;
    grupo = async () => {
      chamadas += 1;
      // A 1ª leitura (com ramo) falha como antes da migration; a 2ª (só o tipo) responde.
      return chamadas === 1
        ? { data: null, error: { code: "42703", message: "column grupos.ramo does not exist" } }
        : { data: { id: "grupo-b", tipo: "independente" }, error: null };
    };
    const eu = await getCorretorLogado();
    expect(eu?.tipoDoGrupo).toBe("independente");
    expect(eu?.ramo).toBe("imobiliaria");
  });

  it("linha de outro grupo não decide o menu", async () => {
    linha = corretor({ grupo_id: "grupo-a" });
    grupo = async () => ({ data: { id: "grupo-b", tipo: "independente" }, error: null });
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
