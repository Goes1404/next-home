import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";

/**
 * A rota do webhook do Asaas (29/10/2026, 0241): falha fechada pelo token
 * (sem tocar no banco), 200 para o que não interessa, 500 só quando o banco
 * falha num pagamento (o Asaas repete).
 */

let banco: BancoFalso;
let chavesCriadas: number;
const avisos: unknown[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    chavesCriadas++;
    return banco.cliente;
  },
}));
vi.mock("@/lib/notificacoes/avisosDaPlataforma", () => ({ avisarAtendimento: (n: unknown) => avisos.push(n) }));

const { POST } = await import("./route");

const TOKEN = "token-do-webhook-de-teste-com-mais-de-32-caracteres";

function pedido(corpo: unknown, token: string | null = TOKEN) {
  return new Request("https://astroimob.vercel.app/api/webhooks/asaas", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token === null ? {} : { "asaas-access-token": token }) },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const PAGO = {
  id: "evt_1",
  event: "PAYMENT_RECEIVED",
  payment: { id: "pay_1", customer: "cus_1", subscription: "sub_1", value: 97, dueDate: "2026-11-05", paymentDate: "2026-11-05" },
};

beforeEach(() => {
  chavesCriadas = 0;
  avisos.length = 0;
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  banco = bancoFalso({
    grupos: [{ id: "g1", nome: "Imob Sol", asaas_cliente_id: "cus_1", asaas_assinatura_id: "sub_1" }],
    pagamentos_do_grupo: [],
    admin_eventos: [],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/asaas", () => {
  it("sem token, com token errado ou sem a variável no ambiente: 401 sem abrir a chave", async () => {
    expect((await POST(pedido(PAGO, null))).status).toBe(401);
    expect((await POST(pedido(PAGO, "errado"))).status).toBe(401);
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
    expect((await POST(pedido(PAGO, ""))).status).toBe(401);
    expect(chavesCriadas).toBe(0);
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(0);
  });

  it("pagamento recebido com o token certo: 200 e registrado uma vez, mesmo entregue duas", async () => {
    const r = await POST(pedido(PAGO));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, resultado: "registrado" });
    expect((await POST(pedido(PAGO))).status).toBe(200);
    expect(banco.tabelas.pagamentos_do_grupo).toHaveLength(1);
    expect(avisos).toHaveLength(1);
  });

  it("evento desconhecido e corpo torto: 200", async () => {
    expect((await POST(pedido({ event: "PAYMENT_CREATED", payment: { id: "pay_2" } }))).status).toBe(200);
    expect((await POST(pedido("{não é json"))).status).toBe(200);
  });

  it("falha do banco ao registrar: 500 para o Asaas repetir", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "pagamentos_do_grupo") return q;
      return { ...q, insert: () => Promise.resolve({ error: { code: "08006", message: "caiu" } }) } as never;
    };
    expect((await POST(pedido(PAGO))).status).toBe(500);
  });
});
