import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O andamento dos pedidos de contratação na plataforma (29/10/2026): a
 * guarda vem antes do banco; status desconhecido, id inválido e "convertido"
 * sem a conta criada são recusados; o vínculo com a conta não some quando o
 * status volta.
 */

const PEDIDO = "00000000-0000-4000-8000-0000000000a1";
const GRUPO = "00000000-0000-4000-8000-0000000000b2";
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

const { atualizarPedido } = await import("./pedidosAcoes");

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const linha = () => banco.tabelas.pedidos_de_contratacao[0];

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  guarda = { userId: "u-admin" };
  chavesCriadas = 0;
  banco = bancoFalso({
    pedidos_de_contratacao: [{ id: PEDIDO, status: "novo", observacao: null, grupo_criado_id: null }],
  });
});

describe("atualizarPedido", () => {
  it("quem não administra a plataforma é barrado antes de a chave existir", async () => {
    guarda = { erro: NEGADO };
    const r = await atualizarPedido(undefined, form({ id: PEDIDO, status: "descartado" }));
    expect(r).toEqual({ ok: false, erro: NEGADO });
    expect(chavesCriadas).toBe(0);
    expect(linha().status).toBe("novo");
  });

  it("muda o status e grava a observação", async () => {
    const r = await atualizarPedido(undefined, form({ id: PEDIDO, status: "em_contato", observacao: "  ligar depois das 18h " }));
    expect(r).toEqual({ ok: true });
    expect(linha()).toMatchObject({ status: "em_contato", observacao: "ligar depois das 18h", grupo_criado_id: null });
  });

  it("convertido pede a conta criada, e grava o vínculo", async () => {
    expect(await atualizarPedido(undefined, form({ id: PEDIDO, status: "convertido" }))).toMatchObject({ ok: false });
    expect(linha().status).toBe("novo");
    const r = await atualizarPedido(undefined, form({ id: PEDIDO, status: "convertido", grupo: GRUPO }));
    expect(r).toEqual({ ok: true });
    expect(linha()).toMatchObject({ status: "convertido", grupo_criado_id: GRUPO });
  });

  it("voltar o status sem escolher conta não apaga o vínculo", async () => {
    await atualizarPedido(undefined, form({ id: PEDIDO, status: "convertido", grupo: GRUPO }));
    await atualizarPedido(undefined, form({ id: PEDIDO, status: "em_contato" }));
    expect(linha()).toMatchObject({ status: "em_contato", grupo_criado_id: GRUPO });
  });

  it("recusa status desconhecido, id e conta inválidos, observação longa demais", async () => {
    for (const campos of [
      { id: PEDIDO, status: "pago" },
      { id: "1; drop table", status: "novo" },
      { id: PEDIDO, status: "convertido", grupo: "x" },
      { id: PEDIDO, status: "novo", observacao: "a".repeat(2001) },
    ] as Record<string, string>[]) {
      expect(await atualizarPedido(undefined, form(campos))).toMatchObject({ ok: false });
    }
    expect(linha().status).toBe("novo");
    expect(chavesCriadas).toBe(0);
  });

  it("pedido que não existe", async () => {
    const r = await atualizarPedido(undefined, form({ id: "00000000-0000-4000-8000-0000000000ff", status: "novo" }));
    expect(r).toEqual({ ok: false, erro: "Pedido não encontrado." });
  });
});
