import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A logo do grupo pela plataforma (0208): só o administrador da plataforma,
 * grupo com id de verdade, e o rastro em `admin_eventos`. O envio ao Storage
 * e o formato do arquivo são medidos em `gravarLogo.test.ts`.
 */

const OPERADOR = "operador-1";
const G1 = "00000000-0000-4000-8000-0000000000aa";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
const gravadas: { grupo: string; arquivo: File | null }[] = [];
const tiradas: string[] = [];

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/marcaDoCrm/gravarLogo", () => ({
  gravarLogoDoGrupo: async (grupo: string, arquivo: File | null) => {
    gravadas.push({ grupo, arquivo });
    return { ok: true, url: "https://x.supabase.co/logo.png" };
  },
  tirarLogoDoGrupo: async (grupo: string) => {
    tiradas.push(grupo);
    return { ok: true, url: null };
  },
}));

const { trocarLogoDoGrupo, tirarLogoDoGrupoNaPlataforma } = await import("./acoes");

function formulario(): FormData {
  const f = new FormData();
  f.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));
  return f;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { userId: OPERADOR };
  gravadas.length = 0;
  tiradas.length = 0;
  banco = bancoFalso({ grupos: [{ id: G1 }], admin_eventos: [] });
});

describe("trocarLogoDoGrupo", () => {
  it("o operador troca a logo e fica o evento", async () => {
    const r = await trocarLogoDoGrupo(G1, formulario());
    expect(r).toEqual({ ok: true, url: "https://x.supabase.co/logo.png" });
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].grupo).toBe(G1);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        grupo_id: G1,
        acao: "logo_do_grupo_alterada",
        ator_plataforma_user_id: OPERADOR,
        detalhes: expect.objectContaining({ origem: "plataforma", mudanca: "trocada" }),
      }),
    );
  });

  it("quem não é administrador da plataforma é recusado antes de qualquer gravação", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    expect(await trocarLogoDoGrupo(G1, formulario())).toEqual({ ok: false, erro: guarda.erro });
    expect(gravadas).toHaveLength(0);
    expect(banco.tabelas.admin_eventos).toHaveLength(0);
  });

  it("id torto não chega ao banco", async () => {
    expect(await trocarLogoDoGrupo("nao-e-uuid", formulario())).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(gravadas).toHaveLength(0);
  });
});

describe("tirarLogoDoGrupoNaPlataforma", () => {
  it("tira a logo e deixa o evento", async () => {
    expect(await tirarLogoDoGrupoNaPlataforma(G1)).toEqual({ ok: true, url: null });
    expect(tiradas).toEqual([G1]);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({ acao: "logo_do_grupo_alterada", detalhes: expect.objectContaining({ mudanca: "removida" }) }),
    );
  });

  it("sem ser administrador, nada acontece", async () => {
    guarda = { erro: "negado" };
    expect(await tirarLogoDoGrupoNaPlataforma(G1)).toEqual({ ok: false, erro: "negado" });
    expect(tiradas).toHaveLength(0);
  });
});
