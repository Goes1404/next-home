import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A cobrança manual na plataforma (fase 2C): registrar e remover pagamento,
 * ajustar mensalidade e vencimento, suspender e reativar à mão.
 *
 * Cliente falso para o banco; a unicidade por competência e os CHECKs são
 * medidos em `src/lib/planos/cobranca.db.test.ts`. O que se prova aqui é a
 * ordem (guarda, validação, banco) e o rastro em `admin_eventos`.
 */

const OPERADOR = "operador-1";
const G1 = "00000000-0000-4000-8000-0000000000aa";
const G2 = "00000000-0000-4000-8000-0000000000bb";
const PAGAMENTO = "00000000-0000-4000-8000-0000000000cc";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { ajustarCobrancaDoGrupo, reativarGrupo, registrarPagamento, removerPagamento, suspenderGrupo } = await import(
  "./cobrancaAcoes"
);

const PEDIDO = { competencia: "2026-09", valor: "299,90", pagoEm: "2026-09-12", observacao: "  pix  " };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { userId: OPERADOR };
  banco = bancoFalso({
    grupos: [
      { id: G1, plano: "essencial", situacao: "ativo", cancelado_em: null },
      { id: G2, plano: "essencial", situacao: "suspenso", cancelado_em: null },
    ],
    pagamentos_do_grupo: [
      { id: PAGAMENTO, grupo_id: G1, competencia: "2026-08-01", valor: "250.00", pago_em: "2026-08-10", observacao: null },
    ],
    admin_eventos: [],
  });
});

describe("registrarPagamento", () => {
  it("grava o pagamento do grupo e deixa o evento", async () => {
    expect(await registrarPagamento(G1, PEDIDO)).toEqual({ ok: true });
    expect(banco.tabelas.pagamentos_do_grupo).toContainEqual(
      expect.objectContaining({
        grupo_id: G1,
        competencia: "2026-09-01",
        valor: 299.9,
        pago_em: "2026-09-12",
        registrado_por: OPERADOR,
        observacao: "pix",
      }),
    );
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        acao: "pagamento_registrado",
        grupo_id: G1,
        ator_plataforma_user_id: OPERADOR,
        detalhes: { origem: "plataforma", competencia: "2026-09-01", valor: 299.9, pago_em: "2026-09-12" },
      }),
    );
  });

  it("dado inválido volta com frase, antes do banco", async () => {
    const ruins = [
      { ...PEDIDO, valor: "-10" },
      { ...PEDIDO, valor: "dez" },
      { ...PEDIDO, competencia: "2026-13" },
      { ...PEDIDO, pagoEm: "2999-01-01" },
      { ...PEDIDO, observacao: "a".repeat(400) },
    ];
    for (const pedido of ruins) {
      const r = await registrarPagamento(G1, pedido);
      expect(r.ok, JSON.stringify(pedido)).toBe(false);
    }
    expect(banco.consultas).toEqual([]);
  });

  it("grupo que não existe e id fora do formato não gravam nada", async () => {
    expect(await registrarPagamento("00000000-0000-4000-8000-0000000000ff", PEDIDO)).toEqual({
      ok: false,
      erro: "Grupo não encontrado.",
    });
    expect(await registrarPagamento("grupo-1; drop", PEDIDO)).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(1);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("competência repetida diz o que fazer, sem vazar a mensagem do banco", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "pagamentos_do_grupo") return q;
      return { ...q, insert: () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } }) } as unknown as typeof q;
    };
    const r = await registrarPagamento(G1, PEDIDO);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/já tem pagamento/) });
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });
});

describe("removerPagamento", () => {
  it("remove o registro do grupo e deixa o evento", async () => {
    expect(await removerPagamento(G1, PAGAMENTO)).toEqual({ ok: true });
    expect(banco.tabelas.pagamentos_do_grupo).toEqual([]);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        acao: "pagamento_removido",
        grupo_id: G1,
        detalhes: { origem: "plataforma", competencia: "2026-08-01", valor: 250, pago_em: "2026-08-10" },
      }),
    );
  });

  it("pagamento de OUTRO grupo não é removido pelo id", async () => {
    const r = await removerPagamento(G2, PAGAMENTO);
    expect(r).toEqual({ ok: false, erro: "Pagamento não encontrado." });
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(1);
  });
});

describe("ajustarCobrancaDoGrupo", () => {
  it("grava mensalidade e dia; mensalidade em branco volta a não definida", async () => {
    expect(await ajustarCobrancaDoGrupo(G1, { mensalidade: "1.299,00", diaDoVencimento: "15" })).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0]).toMatchObject({ mensalidade: 1299, dia_do_vencimento: 15 });
    expect(await ajustarCobrancaDoGrupo(G1, { mensalidade: "", diaDoVencimento: "15" })).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0].mensalidade).toBeNull();
  });

  it("dia 29 ou mensalidade ruim é recusado antes do banco", async () => {
    expect((await ajustarCobrancaDoGrupo(G1, { mensalidade: "100", diaDoVencimento: "29" })).ok).toBe(false);
    expect((await ajustarCobrancaDoGrupo(G1, { mensalidade: "cem", diaDoVencimento: "10" })).ok).toBe(false);
    expect(banco.consultas).toEqual([]);
  });
});

describe("suspender e reativar à mão", () => {
  it("suspende um grupo ativo e reativa um suspenso, com evento nos dois", async () => {
    expect(await suspenderGrupo(G1)).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0].situacao).toBe("suspenso");
    expect(await reativarGrupo(G2)).toEqual({ ok: true });
    expect(banco.tabelas.grupos[1].situacao).toBe("ativo");
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["grupo_suspenso", "grupo_reativado"]);
  });

  it("não suspende quem já está suspenso nem reativa quem está ativo", async () => {
    expect(await suspenderGrupo(G2)).toEqual({ ok: false, erro: expect.stringMatching(/ativo/) });
    expect(await reativarGrupo(G1)).toEqual({ ok: false, erro: expect.stringMatching(/suspenso/) });
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("grupo cancelado não suspende nem reativa", async () => {
    banco.tabelas.grupos[0].cancelado_em = "2026-10-01T00:00:00Z";
    expect((await suspenderGrupo(G1)).ok).toBe(false);
    expect(banco.tabelas.grupos[0].situacao).toBe("ativo");
  });
});

describe("quem não é administrador da plataforma", () => {
  it("não registra, não remove, não ajusta e não suspende: o banco nem é tocado", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const rs = [
      await registrarPagamento(G1, PEDIDO),
      await removerPagamento(G1, PAGAMENTO),
      await ajustarCobrancaDoGrupo(G1, { mensalidade: "1", diaDoVencimento: "1" }),
      await suspenderGrupo(G1),
      await reativarGrupo(G2),
    ];
    for (const r of rs) expect(r.ok).toBe(false);
    expect(banco.consultas).toEqual([]);
  });
});
