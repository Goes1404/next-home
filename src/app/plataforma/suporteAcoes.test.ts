import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O andamento dos chamados na plataforma (0240, 29/10/2026): a guarda vem
 * antes do banco; status desconhecido, id inválido e anotação longa demais
 * são recusados sem criar a chave.
 */

const CHAMADO = "00000000-0000-4000-8000-0000000000c1";
const NEGADO = "Esta ação é restrita a quem administra a plataforma.";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
let chavesCriadas: number;

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    chavesCriadas++;
    return banco.cliente;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { atualizarChamado } = await import("./suporteAcoes");

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const linha = () => banco.tabelas.chamados_de_suporte[0];

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  guarda = { userId: "u-admin" };
  chavesCriadas = 0;
  banco = bancoFalso({ chamados_de_suporte: [{ id: CHAMADO, status: "novo", resposta_interna: null }] });
});

describe("atualizarChamado", () => {
  it("quem não administra a plataforma é barrado antes de a chave existir", async () => {
    guarda = { erro: NEGADO };
    const r = await atualizarChamado(undefined, form({ id: CHAMADO, status: "resolvido" }));
    expect(r).toEqual({ ok: false, erro: NEGADO });
    expect(chavesCriadas).toBe(0);
    expect(linha().status).toBe("novo");
  });

  it("muda o status e grava a anotação interna", async () => {
    const r = await atualizarChamado(undefined, form({ id: CHAMADO, status: "em_atendimento", resposta_interna: " liguei às 15h " }));
    expect(r).toEqual({ ok: true });
    expect(linha()).toMatchObject({ status: "em_atendimento", resposta_interna: "liguei às 15h" });
  });

  it("anotação vazia vira nula", async () => {
    await atualizarChamado(undefined, form({ id: CHAMADO, status: "resolvido", resposta_interna: "   " }));
    expect(linha()).toMatchObject({ status: "resolvido", resposta_interna: null });
  });

  it("recusa status desconhecido, id inválido e anotação longa demais", async () => {
    for (const campos of [
      { id: CHAMADO, status: "fechado" },
      { id: "1; drop table", status: "novo" },
      { id: CHAMADO, status: "novo", resposta_interna: "a".repeat(2001) },
    ] as Record<string, string>[]) {
      expect(await atualizarChamado(undefined, form(campos))).toMatchObject({ ok: false });
    }
    expect(linha().status).toBe("novo");
    expect(chavesCriadas).toBe(0);
  });

  it("chamado que não existe", async () => {
    const r = await atualizarChamado(undefined, form({ id: "00000000-0000-4000-8000-0000000000ff", status: "novo" }));
    expect(r).toEqual({ ok: false, erro: "Chamado não encontrado." });
  });
});
