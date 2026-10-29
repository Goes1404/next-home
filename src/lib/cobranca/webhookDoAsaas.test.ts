import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import { processarEventoDoAsaas, tokenDoAsaasValido, type Aviso, type EventoDoAsaas } from "./webhookDoAsaas";

/**
 * O webhook do Asaas (29/10/2026, 0241): o token, o grupo achado pela
 * assinatura (ou pelo cliente), a competência pelo vencimento e a
 * idempotência por `asaas_pagamento_id` — o Asaas entrega "pelo menos uma
 * vez", e no cartão chegam CONFIRMED e RECEIVED do mesmo pagamento.
 */

let banco: BancoFalso;
let avisos: Aviso[];
const avisar = (a: Aviso) => avisos.push(a);
const servico = () => banco.cliente as never;

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";

function evento(tipo: string, p: Record<string, unknown> = {}): EventoDoAsaas {
  return {
    id: `evt_${tipo}`,
    event: tipo,
    payment: {
      id: "pay_1",
      customer: "cus_1",
      subscription: "sub_1",
      value: 127,
      dueDate: "2026-11-05",
      paymentDate: "2026-11-04",
      billingType: "PIX",
      status: "RECEIVED",
      ...p,
    },
  };
}

beforeEach(() => {
  avisos = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  banco = bancoFalso({
    grupos: [
      { id: G1, nome: "Imob Sol", asaas_cliente_id: "cus_1", asaas_assinatura_id: "sub_1" },
      { id: G2, nome: "Corretor Beto", asaas_cliente_id: "cus_2", asaas_assinatura_id: null },
    ],
    pagamentos_do_grupo: [],
    admin_eventos: [],
  });
});

describe("tokenDoAsaasValido", () => {
  it("só o token igual passa; esperado vazio recusa tudo", () => {
    const esperado = "um-token-de-webhook-com-mais-de-32-caracteres";
    expect(tokenDoAsaasValido(esperado, esperado)).toBe(true);
    expect(tokenDoAsaasValido(`${esperado}x`, esperado)).toBe(false);
    expect(tokenDoAsaasValido("curto", esperado)).toBe(false);
    expect(tokenDoAsaasValido(null, esperado)).toBe(false);
    expect(tokenDoAsaasValido("", "")).toBe(false);
    expect(tokenDoAsaasValido("qualquer", undefined)).toBe(false);
  });
});

describe("processarEventoDoAsaas", () => {
  it("pagamento recebido: registra na competência do vencimento, com evento e aviso", async () => {
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED"), avisar);
    expect(r).toEqual({ resultado: "registrado", grupoId: G1, competencia: "2026-11-01" });
    expect(banco.tabelas.pagamentos_do_grupo).toEqual([
      expect.objectContaining({
        grupo_id: G1,
        competencia: "2026-11-01",
        valor: 127,
        pago_em: "2026-11-04",
        registrado_por: null,
        asaas_pagamento_id: "pay_1",
      }),
    ]);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: G1,
        acao: "pagamento_registrado",
        ator_plataforma_user_id: null,
        detalhes: expect.objectContaining({ origem: "asaas", competencia: "2026-11-01", asaas_pagamento_id: "pay_1" }),
      }),
    ]);
    expect(avisos).toEqual([expect.objectContaining({ titulo: "Pagamento recebido", corpo: "Pagamento recebido: Imob Sol R$ 127,00." })]);
  });

  it("idempotente: o mesmo pagamento de novo (e o CONFIRMED + RECEIVED do cartão) registra uma vez só", async () => {
    await processarEventoDoAsaas(servico(), evento("PAYMENT_CONFIRMED"), avisar);
    const segunda = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED"), avisar);
    const terceira = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED"), avisar);
    expect(segunda).toEqual({ resultado: "repetido", grupoId: G1 });
    expect(terceira.resultado).toBe("repetido");
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(1);
    expect(banco.tabelas.admin_eventos).toHaveLength(1);
    expect(avisos).toHaveLength(1);
  });

  it("sem assinatura no grupo (cobrança avulsa ou assinatura desligada), acha pelo cliente", async () => {
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED", { subscription: "sub_antiga", customer: "cus_2" }), avisar);
    expect(r).toMatchObject({ resultado: "registrado", grupoId: G2 });
  });

  it("assinatura e cliente desconhecidos: não grava nada", async () => {
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED", { subscription: "sub_x", customer: "cus_x" }), avisar);
    expect(r).toEqual({ resultado: "grupo_desconhecido" });
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(0);
    expect(avisos).toHaveLength(0);
  });

  it("id torto não vai ao banco", async () => {
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED", { subscription: "a,b", customer: "x)" }), avisar);
    expect(r).toEqual({ resultado: "grupo_desconhecido" });
    expect(banco.consultas.filter((c) => c.tabela === "grupos")).toHaveLength(0);
  });

  it("vencido: só avisa, não muda nada", async () => {
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_OVERDUE", { status: "OVERDUE" }), avisar);
    expect(r).toEqual({ resultado: "vencido_avisado", grupoId: G1 });
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(0);
    expect(avisos).toEqual([expect.objectContaining({ corpo: "Mensalidade vencida: Imob Sol." })]);
  });

  it("eventos que não interessam são ignorados sem tocar no banco", async () => {
    for (const tipo of ["PAYMENT_CREATED", "PAYMENT_UPDATED", "SUBSCRIPTION_CREATED", ""]) {
      expect((await processarEventoDoAsaas(servico(), evento(tipo), avisar)).resultado).toBe("ignorado");
    }
    expect(await processarEventoDoAsaas(servico(), { event: "PAYMENT_RECEIVED" }, avisar)).toMatchObject({ resultado: "ignorado" });
    expect(banco.consultas).toHaveLength(0);
  });

  it("sem data de pagamento, usa o dia de hoje em São Paulo", async () => {
    await processarEventoDoAsaas(
      servico(),
      evento("PAYMENT_RECEIVED", { paymentDate: null, clientPaymentDate: null }),
      avisar,
      new Date("2026-11-06T01:00:00Z"),
    );
    expect(banco.tabelas.pagamentos_do_grupo[0].pago_em).toBe("2026-11-05");
  });

  it("competência já paga por outro registro: não grava, e avisa para conferir", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "pagamentos_do_grupo") return q;
      return { ...q, insert: () => Promise.resolve({ error: { code: "23505", message: "duplicate key (grupo_id, competencia)" } }) } as never;
    };
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED"), avisar);
    expect(r).toEqual({ resultado: "competencia_ja_paga", grupoId: G1, competencia: "2026-11-01" });
    expect(avisos[0].titulo).toBe("Pagamento recebido para conferir");
    expect(banco.tabelas.admin_eventos).toHaveLength(0);
  });

  it("falha do banco devolve `falhou` (a rota responde 500 e o Asaas repete)", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "pagamentos_do_grupo") return q;
      return { ...q, insert: () => Promise.resolve({ error: { code: "08006", message: "conexão caiu" } }) } as never;
    };
    const r = await processarEventoDoAsaas(servico(), evento("PAYMENT_RECEIVED"), avisar);
    expect(r).toMatchObject({ resultado: "falhou" });
    expect(avisos).toHaveLength(0);
  });
});
