import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O link curto da vitrine (29/10/2026, 0245): traduz o código no token da
 * seleção e não decide mais nada — validade, grupo e medição são da página
 * da seleção.
 */

const TOKEN = "11111111-1111-4111-8111-111111111111";
let linhas: { codigo: string; token: string; tipo: string }[] = [];
const consultados: string[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, codigo: string) => {
          consultados.push(codigo);
          return { maybeSingle: async () => ({ data: linhas.find((l) => l.codigo === codigo) ?? null, error: null }) };
        },
      }),
    }),
  }),
}));

const { GET } = await import("./route");

const abrir = async (caminho: string, codigo: string) =>
  (await GET(new Request(`https://nexthomeimoveis.com${caminho}`), { params: Promise.resolve({ codigo }) })).headers.get(
    "location",
  );

beforeEach(() => {
  linhas = [
    { codigo: "AbCd2345", token: TOKEN, tipo: "selecao" },
    { codigo: "Prop2345", token: "22222222-2222-4222-8222-222222222222", tipo: "proposta" },
  ];
  consultados.length = 0;
});

describe("/v/<codigo>", () => {
  it("leva à seleção do token, no mesmo endereço", async () => {
    expect(await abrir("/v/AbCd2345", "AbCd2345")).toBe(`https://nexthomeimoveis.com/selecao/${TOKEN}`);
  });

  it("a prévia do corretor segue junto (e não conta abertura lá)", async () => {
    expect(await abrir("/v/AbCd2345?previa=1", "AbCd2345")).toBe(`https://nexthomeimoveis.com/selecao/${TOKEN}?previa=1`);
  });

  it("código inexistente, de outro tipo de link ou fora do formato: 404 da seleção, sem dizer qual", async () => {
    expect(await abrir("/v/Zzzz2345", "Zzzz2345")).toBe("https://nexthomeimoveis.com/selecao/x");
    expect(await abrir("/v/Prop2345", "Prop2345")).toBe("https://nexthomeimoveis.com/selecao/x");
    expect(await abrir("/v/x", "../../x")).toBe("https://nexthomeimoveis.com/selecao/x");
    // Fora do formato nem chega ao banco.
    expect(consultados).toEqual(["Zzzz2345", "Prop2345"]);
  });
});
