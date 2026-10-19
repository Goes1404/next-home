import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * O ADM derruba o número de um corretor pela chave de serviço, que enxerga
 * todos os grupos. O id do corretor vem do navegador: sem conferir o grupo,
 * o gestor do grupo B derrubaria o WhatsApp de um corretor do grupo A (L16).
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const desconectarInstancia = vi.fn(async () => ({ ok: true }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({
  desconectarInstancia: (...args: unknown[]) => desconectarInstancia(...(args as [])),
}));
vi.mock("@/lib/guardas", () => ({
  exigirGestorNaAcao: async () => ({ corretor: { id: "gestor-b", papel: "gestor", grupoId: GRUPO_B } }),
}));

const { desconectarNumeroDoCorretor } = await import("./acoes");

describe("desconectarNumeroDoCorretor", () => {
  beforeEach(() => {
    desconectarInstancia.mockClear();
    banco = bancoFalso({
      corretores: [
        { id: "corretor-a", grupo_id: GRUPO_A },
        { id: "corretor-b", grupo_id: GRUPO_B },
      ],
      corretor_whatsapp_instancias: [
        { id: "inst-a", corretor_id: "corretor-a", grupo_id: GRUPO_A, instance_name: "a", status_conexao: "conectado" },
        { id: "inst-b", corretor_id: "corretor-b", grupo_id: GRUPO_B, instance_name: "b", status_conexao: "conectado" },
      ],
      admin_eventos: [],
    });
  });

  it("desconectarNumeroDoCorretor recusa corretor de outro grupo", async () => {
    const r = await desconectarNumeroDoCorretor("corretor-a");
    expect(r.erro).toBeTruthy();
    expect(desconectarInstancia).not.toHaveBeenCalled();
    expect(banco.tabelas.corretor_whatsapp_instancias.find((i) => i.id === "inst-a")?.status_conexao).toBe("conectado");
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("no próprio grupo o número cai (o teste acima não passa por acaso)", async () => {
    const r = await desconectarNumeroDoCorretor("corretor-b");
    expect(r.ok).toBeTruthy();
    expect(desconectarInstancia).toHaveBeenCalledWith("b");
    expect(banco.tabelas.corretor_whatsapp_instancias.find((i) => i.id === "inst-b")?.status_conexao).toBe("desconectado");
  });
});
