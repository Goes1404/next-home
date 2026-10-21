import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * A logo pelo gestor do próprio grupo (0208): o grupo é o da sessão, só gestor
 * grava, e o rastro fica em `admin_eventos` com o gestor como autor.
 */

const GRUPO_DO_GESTOR = "00000000-0000-4000-8000-0000000000aa";

let banco: BancoFalso;
let guarda: { corretor: { id: string; grupoId: string } } | { erro: string };
const gravadas: string[] = [];
const tiradas: string[] = [];

vi.mock("@/lib/guardas", () => ({ exigirGestorNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/marcaDoCrm/gravarLogo", () => ({
  gravarLogoDoGrupo: async (grupo: string) => {
    gravadas.push(grupo);
    return { ok: true, url: "https://x.supabase.co/logo.png" };
  },
  tirarLogoDoGrupo: async (grupo: string) => {
    tiradas.push(grupo);
    return { ok: true, url: null };
  },
}));

const { trocarLogoDaCasa, tirarLogoDaCasa } = await import("./acoes");

function formulario(): FormData {
  const f = new FormData();
  f.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));
  return f;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { corretor: { id: "gestor-1", grupoId: GRUPO_DO_GESTOR } };
  gravadas.length = 0;
  tiradas.length = 0;
  banco = bancoFalso({ admin_eventos: [] });
});

describe("logo da casa pelo gestor", () => {
  it("grava no grupo da SESSÃO (o navegador não escolhe o grupo) e registra o gestor", async () => {
    const f = formulario();
    f.set("grupoId", "00000000-0000-4000-8000-0000000000bb"); // lixo do navegador: ignorado
    expect(await trocarLogoDaCasa(f)).toEqual({ ok: true, url: "https://x.supabase.co/logo.png" });
    expect(gravadas).toEqual([GRUPO_DO_GESTOR]);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        grupo_id: GRUPO_DO_GESTOR,
        acao: "logo_do_grupo_alterada",
        ator_id: "gestor-1",
        detalhes: expect.objectContaining({ origem: "gestor", mudanca: "trocada" }),
      }),
    );
  });

  it("corretor que não é gestor é recusado antes de gravar", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a imobiliária." };
    expect(await trocarLogoDaCasa(formulario())).toEqual({ ok: false, erro: guarda.erro });
    expect(await tirarLogoDaCasa()).toEqual({ ok: false, erro: guarda.erro });
    expect(gravadas).toHaveLength(0);
    expect(tiradas).toHaveLength(0);
    expect(banco.tabelas.admin_eventos).toHaveLength(0);
  });

  it("tirar a logo age no grupo da sessão e deixa o evento", async () => {
    expect(await tirarLogoDaCasa()).toEqual({ ok: true, url: null });
    expect(tiradas).toEqual([GRUPO_DO_GESTOR]);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({ ator_id: "gestor-1", detalhes: expect.objectContaining({ mudanca: "removida" }) }),
    );
  });
});
