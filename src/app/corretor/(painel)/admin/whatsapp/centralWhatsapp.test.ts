import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * Comandos pelo WhatsApp (0249): só o gestor liga, e só no grupo dele. A
 * chave de serviço enxerga todos os grupos; o id vem da guarda, nunca do
 * navegador.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
let guarda: { erro: string } | { erro?: undefined; corretor: { id: string; papel: string; grupoId: string } };

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({}));
vi.mock("@/lib/guardas", () => ({ exigirGestorNaAcao: async () => guarda }));

const { configurarCentralWhatsapp } = await import("./acoes");

const ligado = (id: string) => banco.tabelas.grupos.find((g) => g.id === id)?.central_whatsapp_ativo;

describe("configurarCentralWhatsapp", () => {
  beforeEach(() => {
    banco = bancoFalso({
      grupos: [
        { id: GRUPO_A, central_whatsapp_ativo: false },
        { id: GRUPO_B, central_whatsapp_ativo: false },
      ],
    });
  });

  it("corretor sem papel de gestor não liga", async () => {
    guarda = { erro: "Apenas o gestor pode fazer isso." };
    const r = await configurarCentralWhatsapp(true);
    expect(r.erro).toBeTruthy();
    expect(ligado(GRUPO_A)).toBe(false);
    expect(ligado(GRUPO_B)).toBe(false);
  });

  it("o gestor liga e desliga só o grupo dele", async () => {
    guarda = { corretor: { id: "gestor-b", papel: "gestor", grupoId: GRUPO_B } };
    expect((await configurarCentralWhatsapp(true)).ok).toBeTruthy();
    expect(ligado(GRUPO_B)).toBe(true);
    expect(ligado(GRUPO_A)).toBe(false);

    await configurarCentralWhatsapp(false);
    expect(ligado(GRUPO_B)).toBe(false);
  });
});
