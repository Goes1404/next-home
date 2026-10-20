import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * Registrar e desfazer o cancelamento de um grupo pela plataforma (resposta
 * 7 do dono, 0202): marca `cancelado_em`, tira o grupo do ar (`encerrado`) e
 * deixa o evento no grupo. Dentro dos 90 dias dá para desfazer; depois que a
 * rotina apagou, não.
 */

const OPERADOR = "operador-1";
const G = "4f6c2b1e-1111-4222-8333-944455556666";
const NEXT_HOME = "00000000-0000-0000-0000-000000000001";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { registrarCancelamento, desfazerCancelamento } = await import("./acoes");

beforeEach(() => {
  guarda = { userId: OPERADOR };
  banco = bancoFalso({
    grupos: [
      { id: G, slug: "silva", situacao: "ativo", cancelado_em: null, dados_apagados_em: null },
      { id: NEXT_HOME, slug: "next-home", situacao: "ativo", cancelado_em: null, dados_apagados_em: null },
    ],
    admin_eventos: [],
  });
});

const grupo = (id = G) => banco.tabelas.grupos.find((g) => g.id === id)!;

describe("registrar o cancelamento", () => {
  it("marca a data, tira do ar e grava o evento no grupo", async () => {
    const r = await registrarCancelamento(G);
    expect(r).toEqual({ ok: true });
    expect(grupo().cancelado_em).toEqual(expect.any(String));
    expect(grupo().situacao).toBe("encerrado");
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: G,
        acao: "grupo_cancelado",
        ator_plataforma_user_id: OPERADOR,
        detalhes: expect.objectContaining({ origem: "plataforma", apagar_em: expect.any(String) }),
      }),
    ]);
  });

  it("recusa a Next Home sem ir ao banco", async () => {
    const r = await registrarCancelamento(NEXT_HOME);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/Next Home/) });
    expect(banco.consultas).toEqual([]);
  });

  it("recusa quem não é da plataforma", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    expect(await registrarCancelamento(G)).toEqual({ ok: false, erro: guarda.erro });
    expect(grupo().cancelado_em).toBeNull();
  });

  it("não cancela de novo um grupo já cancelado (a data dos 90 dias não se mexe)", async () => {
    grupo().cancelado_em = "2026-09-01T00:00:00Z";
    const r = await registrarCancelamento(G);
    expect(r.ok).toBe(false);
    expect(grupo().cancelado_em).toBe("2026-09-01T00:00:00Z");
  });
});

describe("desfazer o cancelamento", () => {
  it("volta o grupo ao ar e grava o evento", async () => {
    Object.assign(grupo(), { cancelado_em: "2026-10-01T00:00:00Z", situacao: "encerrado" });
    const r = await desfazerCancelamento(G);
    expect(r).toEqual({ ok: true });
    expect(grupo()).toMatchObject({ cancelado_em: null, situacao: "ativo" });
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["cancelamento_desfeito"]);
  });

  it("depois de apagado, não desfaz", async () => {
    Object.assign(grupo(), {
      cancelado_em: "2026-06-01T00:00:00Z",
      dados_apagados_em: "2026-09-01T00:00:00Z",
      situacao: "encerrado",
    });
    const r = await desfazerCancelamento(G);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/apagados/) });
    expect(grupo().situacao).toBe("encerrado");
  });

  it("volta à situação de antes do cancelamento (suspenso continua suspenso)", async () => {
    grupo().situacao = "suspenso";
    await registrarCancelamento(G);
    expect(grupo()).toMatchObject({ situacao: "encerrado", situacao_antes_do_cancelamento: "suspenso" });
    const r = await desfazerCancelamento(G);
    expect(r).toEqual({ ok: true });
    expect(grupo()).toMatchObject({ situacao: "suspenso", cancelado_em: null });
  });

  it("depois dos 90 dias, com a rotina ligada, não desfaz", async () => {
    vi.stubEnv("APAGAR_GRUPOS_CANCELADOS", "1");
    try {
      Object.assign(grupo(), { cancelado_em: "2026-01-01T00:00:00Z", situacao: "encerrado" });
      const r = await desfazerCancelamento(G);
      expect(r).toEqual({ ok: false, erro: expect.stringMatching(/90 dias/) });
      expect(grupo().cancelado_em).toBe("2026-01-01T00:00:00Z");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("depois dos 90 dias, com a rotina desligada (nada é apagado), ainda desfaz", async () => {
    Object.assign(grupo(), { cancelado_em: "2026-01-01T00:00:00Z", situacao: "encerrado" });
    expect(await desfazerCancelamento(G)).toEqual({ ok: true });
  });
});
