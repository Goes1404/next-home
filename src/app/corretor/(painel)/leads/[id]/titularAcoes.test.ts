import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O pedido do titular (LGPD art. 18), na ficha do lead (0202): o gestor
 * registra "apagar meus dados", o banco apaga o lead e as sobras dele
 * (`apagar_dados_do_titular`, medido em `dadosDoGrupo.db.test.ts`) e só
 * DEPOIS os arquivos da pasta do lead no Storage somem — com a pasta do lead
 * que o banco acabou de confirmar ser do grupo do gestor.
 */

const LEAD = "4f6c2b1e-1111-4222-8333-944455556666";
const OUTRA_FICHA = "4f6c2b1e-2222-4222-8333-944455556666";

let guarda: { corretor?: { id: string; grupoId: string }; erro?: string };
let respostaDoRpc: { data: unknown; error: { message: string } | null };
let chamadasDoRpc: { nome: string; args: unknown }[];
let pastas: Record<string, { name: string; id: string | null }[]>;
let removidos: string[];
let falhaAoRemover: boolean;

vi.mock("@/lib/guardas", () => ({ exigirGestorNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nome: string, args: unknown) => {
      chamadasDoRpc.push({ nome, args });
      return respostaDoRpc;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: (bucket: string) => ({
        list: async (pasta: string, opcoes?: { limit?: number; offset?: number }) => {
          const tudo = pastas[`${bucket}/${pasta}`] ?? [];
          const de = opcoes?.offset ?? 0;
          return { data: tudo.slice(de, de + (opcoes?.limit ?? 100)), error: null };
        },
        remove: async (caminhos: string[]) => {
          if (falhaAoRemover) return { data: null, error: { message: "fora do ar" } };
          removidos.push(...caminhos.map((c) => `${bucket}/${c}`));
          return { data: [], error: null };
        },
      }),
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { apagarDadosDoTitular } = await import("./titularAcoes");

beforeEach(() => {
  guarda = { corretor: { id: "gestor-1", grupoId: "g1" } };
  respostaDoRpc = { data: { apagados: { conversas: 1 } }, error: null };
  chamadasDoRpc = [];
  removidos = [];
  falhaAoRemover = false;
  pastas = {
    [`documentos-clientes/${LEAD}`]: [
      { name: "rg.jpg", id: "a1" },
      { name: "whatsapp", id: null },
    ],
    [`documentos-clientes/${LEAD}/whatsapp`]: [{ name: "m1-foto.jpg", id: "a2" }],
  };
});

describe("apagar os dados do titular", () => {
  it("apaga pelo banco e depois a pasta inteira do lead no Storage", async () => {
    const r = await apagarDadosDoTitular(LEAD);
    expect(r.ok).toMatch(/apagados/);
    expect(chamadasDoRpc).toEqual([{ nome: "apagar_dados_do_titular", args: { p_lead: LEAD } }]);
    expect(removidos.sort()).toEqual([
      `documentos-clientes/${LEAD}/rg.jpg`,
      `documentos-clientes/${LEAD}/whatsapp/m1-foto.jpg`,
    ]);
  });

  it("apaga também a pasta das outras fichas da mesma pessoa que o banco apagou", async () => {
    respostaDoRpc = { data: { apagados: { fichas: 2 }, leads: [LEAD, OUTRA_FICHA] }, error: null };
    pastas[`documentos-clientes/${OUTRA_FICHA}`] = [{ name: "cpf.pdf", id: "b1" }];
    const r = await apagarDadosDoTitular(LEAD);
    expect(r.ok).toMatch(/2 fichas/);
    expect(removidos).toContain(`documentos-clientes/${OUTRA_FICHA}/cpf.pdf`);
    expect(removidos).toContain(`documentos-clientes/${LEAD}/rg.jpg`);
  });

  it("id que não é de lead na resposta do banco não vira pasta", async () => {
    respostaDoRpc = { data: { apagados: { fichas: 1 }, leads: ["../outro", LEAD] }, error: null };
    pastas["documentos-clientes/../outro"] = [{ name: "x.pdf", id: "z" }];
    await apagarDadosDoTitular(LEAD);
    expect(removidos.some((c) => c.includes("outro"))).toBe(false);
  });

  it("pasta com mais de 1000 arquivos sai inteira (a listagem pagina)", async () => {
    pastas[`documentos-clientes/${LEAD}/whatsapp`] = Array.from({ length: 1500 }, (_, i) => ({ name: `m${i}.jpg`, id: `w${i}` }));
    await apagarDadosDoTitular(LEAD);
    expect(removidos.filter((c) => c.includes("/whatsapp/"))).toHaveLength(1500);
  });

  it("só o gestor: o corretor não chega ao banco", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a imobiliária." };
    expect(await apagarDadosDoTitular(LEAD)).toEqual({ erro: guarda.erro });
    expect(chamadasDoRpc).toEqual([]);
  });

  it("id torto não vai ao banco", async () => {
    expect((await apagarDadosDoTitular("../outro")).erro).toBeTruthy();
    expect(chamadasDoRpc).toEqual([]);
  });

  it("se o banco recusa, nenhum arquivo é tocado", async () => {
    respostaDoRpc = { data: null, error: { message: "lead_nao_encontrado" } };
    const r = await apagarDadosDoTitular(LEAD);
    expect(r.erro).toMatch(/não encontrado/);
    expect(removidos).toEqual([]);
  });

  it("se o Storage falha, o lead já foi apagado e a tela diz o que sobrou", async () => {
    falhaAoRemover = true;
    const r = await apagarDadosDoTitular(LEAD);
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/arquivos/);
  });
});
