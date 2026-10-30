import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { semPedidoDeSimFalso } = await import("./conversa");

/** Os textos reais da conversa da Bruna (30/10/2026). */
describe("semPedidoDeSimFalso", () => {
  it("tira o 'Responda sim' que a IA escreveu sem proposta", () => {
    const r = semPedidoDeSimFalso(
      "Ótimo! Então, vamos montar a lista para leads que ficaram “em conversa” e pararam de responder.\n\nConfirma que quer enviar a mensagem:\nOii boa tarde\n\nResponda “sim” para confirmar ou “não” para cancelar.",
    );
    expect(r).not.toMatch(/responda/i);
    expect(r).toMatch(/me diga para seguir/);
    expect(r).toMatch(/vamos montar a lista/);
  });

  it("tira o 'Confirma que quer…?'", () => {
    const r = semPedidoDeSimFalso("Perfeito! Confirma que quer enviar essa mensagem para os leads que não responderam no WhatsApp? Responda “sim” para confirmar.");
    expect(r).not.toMatch(/confirma que quer/i);
    expect(r).not.toMatch(/responda/i);
  });

  it("texto sem pedido de sim fica igual", () => {
    const t = "Seu desempenho nos últimos 10 dias:\n- Leads novos: 0";
    expect(semPedidoDeSimFalso(t)).toBe(t);
  });
});
