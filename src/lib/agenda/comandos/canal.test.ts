import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/whatsapp/provider", () => ({ enviarMensagemWhatsapp: async () => ({ enviado: true }) }));
vi.mock("@/lib/whatsapp/repositorio", () => ({ agendarVisitaLead: async () => true }));

const { canalDaMensagem, ehMensagemDoSistema } = await import("./canal");

/*
 * Quem fala com o sistema: o corretor na conversa consigo mesmo (mesmo
 * número da instância) ou do número pessoal cadastrado. Cliente nunca.
 */
describe("canalDaMensagem", () => {
  const base = { whatsappCorretor: "5511988887777", telefoneConectado: "5511988887777" };

  it("fala do próprio número na conversa consigo mesmo é do canal", () => {
    expect(canalDaMensagem({ ...base, fromMe: true, sender: "5511988887777" })).toBe("propria");
  });

  it("fala do corretor para um cliente não é do canal", () => {
    expect(canalDaMensagem({ ...base, fromMe: true, sender: "5511911112222" })).toBeNull();
  });

  it("mensagem de cliente não é do canal", () => {
    expect(canalDaMensagem({ ...base, fromMe: false, sender: "5511911112222" })).toBeNull();
  });

  it("número pessoal diferente do da instância chega como entrada e é do canal", () => {
    expect(
      canalDaMensagem({ fromMe: false, sender: "11977776666", whatsappCorretor: "5511977776666", telefoneConectado: "5511988887777" }),
    ).toBe("do_corretor");
  });

  it("sem 9 ou sem 55 ainda é o mesmo número", () => {
    expect(canalDaMensagem({ ...base, fromMe: true, sender: "551188887777" })).toBe("propria");
  });
});

describe("ehMensagemDoSistema", () => {
  it("reconhece a marca das respostas e a cobrança da visita", () => {
    expect(ehMensagemDoSistema("📅 Pronto: visita marcada")).toBe(true);
    expect(ehMensagemDoSistema("A visita com Ana (sáb 31/10 às 10h) aconteceu?\n1 · Aconteceu")).toBe(true);
    expect(ehMensagemDoSistema("visita com a Ana sábado 10h")).toBe(false);
  });
});
