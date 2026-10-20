import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * As portas públicas que não passam pelo segmento do site (`/api/leads`,
 * `/api/clique-whatsapp`, `/wa`) leem o grupo do ENDEREÇO da requisição
 * (fase 3). Endereço de outro grupo grava no grupo dele; endereço de nenhum
 * grupo não grava nada — e nunca cai na Next Home.
 */

const GRUPO_B = "00000000-0000-0000-0000-00000000000b";
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

let banco: BancoFalso;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/corretorAtivo", () => ({ getCorretorAtivo: async () => null }));
vi.mock("@/lib/sites/resolver", async () => {
  const { marcaDoGrupo } = await import("./marca");
  const sites: Record<string, string> = {
    "www.nexthomeimoveis.com": GRUPO_NEXT_HOME_ID,
    "imobiliariab.com.br": GRUPO_B,
  };
  return {
    resolverSite: async (host: string | null) => {
      const grupoId = host ? sites[host] : undefined;
      return grupoId
        ? { grupoId, host, marca: marcaDoGrupo({ grupoId, nome: "X", url: `https://${host}` }) }
        : null;
    },
  };
});

const { POST: postClique } = await import("@/app/api/clique-whatsapp/route");
const { GET: getPorteiro } = await import("@/app/wa/route");

beforeEach(() => {
  banco = bancoFalso({ cliques_whatsapp: [], corretores: [] });
});

function clique(host: string) {
  return postClique(
    new Request(`https://${host}/api/clique-whatsapp`, {
      method: "POST",
      headers: { host },
      body: JSON.stringify({ origem: "site/home" }),
    }),
  );
}

describe("portas públicas pelo endereço", () => {
  it("o clique no site de outro grupo é gravado no grupo dele", async () => {
    await clique("imobiliariab.com.br");
    await clique("www.nexthomeimoveis.com");
    expect(banco.tabelas.cliques_whatsapp.map((c) => c.grupo_id)).toEqual([GRUPO_B, GRUPO_NEXT_HOME_ID]);
  });

  it("endereço de nenhum grupo não grava nada", async () => {
    const r = await clique("naoexiste.com.br");
    expect(r.status).toBe(404);
    expect(banco.tabelas.cliques_whatsapp).toEqual([]);
  });

  it("o porteiro de um endereço sem grupo manda para a página neutra, sem sortear", async () => {
    const r = await getPorteiro(new Request("https://naoexiste.com.br/wa", { headers: { host: "naoexiste.com.br" } }));
    expect(r.status).toBe(302);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
    expect(banco.consultas).toEqual([]);
  });
});
