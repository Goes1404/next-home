import { describe, expect, it } from "vitest";
import { estadoDepoisDoPedido } from "./CartaoDeAvisos";

describe("estadoDepoisDoPedido", () => {
  it("segue quando a permissão foi dada", () => {
    expect(estadoDepoisDoPedido("granted")).toBe("seguir");
  });

  it("mostra como liberar quando está bloqueada", () => {
    expect(estadoDepoisDoPedido("denied")).toBe("bloqueada");
  });

  // O defeito de 04/11/2026: "default" (pedido fechado ou que nem apareceu,
  // como no app Android) voltava o cartão ao normal e parecia que nada
  // tinha acontecido.
  it("não volta em silêncio quando o pedido foi fechado ou nem apareceu", () => {
    expect(estadoDepoisDoPedido("default")).toBe("pedido_fechado");
    expect(estadoDepoisDoPedido("sem_resposta")).toBe("pedido_fechado");
  });
});
