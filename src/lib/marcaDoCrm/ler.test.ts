import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A leitura da marca do grupo: o grupo 1 nunca consulta; os outros leem UMA
 * linha, com cache de 60 s; falha vira o nome genérico e não fica no cache.
 */

vi.mock("server-only", () => ({}));

type Resposta = { data: unknown; error: { code?: string; message: string } | null };
let respostas: Resposta[];
const consultas: { tabela: string; colunas: string }[] = [];

function consulta(tabela: string, colunas: string) {
  consultas.push({ tabela, colunas });
  const pronta = () => Promise.resolve(respostas.shift() ?? { data: null, error: null });
  const cadeia: Record<string, unknown> = {};
  cadeia.eq = () => cadeia;
  cadeia.maybeSingle = pronta;
  return cadeia;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: (tabela: string) => ({ select: (colunas: string) => consulta(tabela, colunas) }) }),
}));

const { lerMarcaDoCrm, lerEnderecoDoCliente, esquecerMarcasLidas } = await import("./ler");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");
const { site } = await import("@/lib/site");

const OUTRO = "22222222-2222-2222-2222-222222222222";
const OUTRO_2 = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  respostas = [];
  consultas.length = 0;
  esquecerMarcasLidas();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lerMarcaDoCrm", () => {
  it("o grupo 1 não consulta o banco: é a marca da Next Home", async () => {
    const m = await lerMarcaDoCrm(GRUPO_NEXT_HOME_ID);
    expect(m.nome).toBe("Next Home");
    expect(m.wordmark).toEqual(["Next", "Home"]);
    expect(m.logoUrl).toBeNull();
    expect(consultas).toHaveLength(0);
  });

  it("outro grupo: nome da casa da IA, senão o do grupo; logo do grupo", async () => {
    respostas.push({ data: { nome: "Imobiliária Sol", ia_nome_da_casa: "Sol Imóveis", logo_url: "https://x.supabase.co/l.png" }, error: null });
    const m = await lerMarcaDoCrm(OUTRO);
    expect(m.nome).toBe("Sol Imóveis");
    expect(m.logoUrl).toBe("https://x.supabase.co/l.png");
    expect(consultas).toEqual([{ tabela: "grupos", colunas: "nome, ia_nome_da_casa, logo_url" }]);
  });

  it("cache: o mesmo grupo é lido uma vez só; outro grupo é outra leitura", async () => {
    respostas.push({ data: { nome: "Sol", ia_nome_da_casa: null, logo_url: null }, error: null });
    respostas.push({ data: { nome: "Lua", ia_nome_da_casa: null, logo_url: null }, error: null });
    expect((await lerMarcaDoCrm(OUTRO)).nome).toBe("Sol");
    expect((await lerMarcaDoCrm(OUTRO)).nome).toBe("Sol");
    expect((await lerMarcaDoCrm(OUTRO_2)).nome).toBe("Lua");
    expect(consultas).toHaveLength(2);
  });

  it("o cache vence em 60 s", async () => {
    respostas.push({ data: { nome: "Sol", ia_nome_da_casa: null, logo_url: null }, error: null });
    respostas.push({ data: { nome: "Sol Nova", ia_nome_da_casa: null, logo_url: null }, error: null });
    const t0 = 1_000_000;
    expect((await lerMarcaDoCrm(OUTRO, t0)).nome).toBe("Sol");
    expect((await lerMarcaDoCrm(OUTRO, t0 + 59_000)).nome).toBe("Sol");
    expect((await lerMarcaDoCrm(OUTRO, t0 + 61_000)).nome).toBe("Sol Nova");
  });

  it("falha do banco: nome genérico, nunca o da Next Home, e a falha não fica no cache", async () => {
    respostas.push({ data: null, error: { code: "XX000", message: "caiu" } });
    const m = await lerMarcaDoCrm(OUTRO);
    expect(m.nome).toBe("Imobiliária");
    expect(m.nome).not.toMatch(/Next ?Home/);
    respostas.push({ data: { nome: "Sol", ia_nome_da_casa: null, logo_url: null }, error: null });
    expect((await lerMarcaDoCrm(OUTRO)).nome).toBe("Sol");
  });

  it("antes da 0208 (coluna logo_url ausente, 42703) lê só os nomes", async () => {
    respostas.push({ data: null, error: { code: "42703", message: "column logo_url does not exist" } });
    respostas.push({ data: { nome: "Sol", ia_nome_da_casa: null }, error: null });
    const m = await lerMarcaDoCrm(OUTRO);
    expect(m.nome).toBe("Sol");
    expect(m.logoUrl).toBeNull();
    expect(consultas.map((c) => c.colunas)).toEqual(["nome, ia_nome_da_casa, logo_url", "nome, ia_nome_da_casa"]);
  });
});

describe("lerEnderecoDoCliente", () => {
  it("grupo 1: site.url, sem consulta", async () => {
    expect(await lerEnderecoDoCliente(GRUPO_NEXT_HOME_ID)).toBe(site.url.replace(/\/+$/, ""));
    expect(consultas).toHaveLength(0);
  });

  it("outro grupo com site: o endereço principal; sem site, o painel", async () => {
    respostas.push({ data: { host: "imobsol.com.br" }, error: null });
    expect(await lerEnderecoDoCliente(OUTRO)).toBe("https://imobsol.com.br");
    respostas.push({ data: null, error: null });
    expect(await lerEnderecoDoCliente(OUTRO_2)).toBe("https://astroimob.vercel.app");
  });

  it("erro de leitura cai no painel (o link continua abrindo)", async () => {
    respostas.push({ data: null, error: { message: "caiu" } });
    expect(await lerEnderecoDoCliente(OUTRO)).toBe("https://astroimob.vercel.app");
  });
});
