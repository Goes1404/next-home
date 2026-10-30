import { describe, expect, it } from "vitest";
import {
  lerRespostaDoCliente,
  naJanelaAutomatica,
  podePedirConfirmacao,
  quandoDaVisita,
  textoDoPedidoDeConfirmacao,
  type SituacaoDaVisita,
} from "./confirmacaoDaVisita";

/** A régua da confirmação de visita pelo WhatsApp (0246): quando pedir, o que dizer e como ler a resposta. */

// Quarta, 29/10/2026, 12h em São Paulo.
const agora = new Date("2026-10-29T15:00:00Z");
const daqui = (h: number) => new Date(agora.getTime() + h * 3_600_000).toISOString();

const visita = (v: Partial<SituacaoDaVisita> = {}): SituacaoDaVisita => ({
  inicio: daqui(20),
  status: "marcada",
  confirmadaPeloCliente: false,
  confirmacaoPedidaEm: null,
  remarcacaoPedidaEm: null,
  ...v,
});

describe("quando o corretor pode pedir", () => {
  it("visita marcada nas próximas 36h, sem confirmação nem pedido", () => {
    expect(podePedirConfirmacao(visita(), agora)).toEqual({ pode: true });
    expect(podePedirConfirmacao(visita({ inicio: daqui(35) }), agora)).toEqual({ pode: true });
  });

  it("não pede de novo, nem depois da resposta", () => {
    expect(podePedirConfirmacao(visita({ confirmacaoPedidaEm: daqui(-1) }), agora)).toEqual({ pode: false, motivo: "ja_pedida" });
    expect(podePedirConfirmacao(visita({ confirmadaPeloCliente: true }), agora)).toEqual({ pode: false, motivo: "ja_confirmada" });
    expect(podePedirConfirmacao(visita({ remarcacaoPedidaEm: daqui(-1) }), agora)).toEqual({ pode: false, motivo: "pediu_remarcar" });
  });

  it("nem longe demais, nem depois do horário, nem visita que não está marcada", () => {
    expect(podePedirConfirmacao(visita({ inicio: daqui(48) }), agora)).toEqual({ pode: false, motivo: "longe_demais" });
    expect(podePedirConfirmacao(visita({ inicio: daqui(-1) }), agora)).toEqual({ pode: false, motivo: "passou" });
    expect(podePedirConfirmacao(visita({ status: "cancelada" }), agora)).toEqual({ pode: false, motivo: "nao_marcada" });
  });

  it("a automática só entre 2h e 24h antes", () => {
    expect(naJanelaAutomatica(daqui(24), agora)).toBe(true);
    expect(naJanelaAutomatica(daqui(2), agora)).toBe(true);
    expect(naJanelaAutomatica(daqui(25), agora)).toBe(false);
    expect(naJanelaAutomatica(daqui(1), agora)).toBe(false);
  });
});

describe("o texto", () => {
  it("hoje, amanhã ou o dia, no fuso de São Paulo", () => {
    expect(quandoDaVisita("2026-10-29T19:30:00Z", agora)).toBe("hoje às 16h30");
    expect(quandoDaVisita("2026-10-30T13:00:00Z", agora)).toBe("amanhã às 10h");
    // 31/10 01h UTC ainda é 30/10 em São Paulo.
    expect(quandoDaVisita("2026-10-31T01:00:00Z", agora)).toBe("amanhã às 22h");
    expect(quandoDaVisita("2026-11-02T12:00:00Z", agora)).toBe("segunda-feira, 02/11, às 9h");
  });

  it("primeiro nome, o lugar do cadastro e as duas respostas que a leitura entende", () => {
    const texto = textoDoPedidoDeConfirmacao({
      cliente: "Maria da Silva",
      corretor: "Ana Paula Souza",
      inicio: "2026-10-30T13:00:00Z",
      lugar: "Residencial Bless",
      agora,
    });
    expect(texto).toBe(
      "Oi, Maria! Aqui é Ana. Passando para confirmar nossa visita amanhã às 10h no Residencial Bless. " +
        "Posso contar com você? Responda *confirmo* ou, se precisar, *remarcar*.",
    );
  });

  it("sem nome de verdade nem lugar, não inventa", () => {
    const texto = textoDoPedidoDeConfirmacao({ cliente: "WhatsApp 1234", corretor: "Ana", inicio: "2026-10-30T13:00:00Z", lugar: null, agora });
    expect(texto.startsWith("Oi! Aqui é Ana.")).toBe(true);
    expect(texto).toContain("amanhã às 10h. Posso");
  });

  it("no ramo, o compromisso dele (30/10/2026); imobiliária explícita = o de sempre", () => {
    const base = { cliente: "Maria", corretor: "Ana", inicio: "2026-10-30T13:00:00Z", lugar: null, agora };
    expect(textoDoPedidoDeConfirmacao({ ...base, ramo: "imobiliaria" })).toBe(textoDoPedidoDeConfirmacao(base));
    expect(textoDoPedidoDeConfirmacao({ ...base, ramo: "seguros" })).toContain("confirmar nossa reunião amanhã");
    expect(textoDoPedidoDeConfirmacao({ ...base, ramo: "varejo" })).toMatch(/confirmar nosso atendimento amanhã/);
    expect(textoDoPedidoDeConfirmacao({ ...base, ramo: "saude" })).not.toContain("visita");
  });
});

describe("a resposta do cliente", () => {
  it.each([
    ["confirmo", "confirmou"],
    ["Sim", "confirmou"],
    ["sim, estarei lá", "confirmou"],
    ["👍", "confirmou"],
    ["Não posso amanhã", "remarcar"],
    ["preciso remarcar", "remarcar"],
    ["sim mas não vou conseguir", "remarcar"],
    ["Podemos reagendar?", "remarcar"],
  ])("%s → %s", (texto, leitura) => {
    expect(lerRespostaDoCliente(texto)).toBe(leitura);
  });

  it.each(["qual o endereço?", "quem vai estar lá?", "tem estacionamento"])("ambígua fica na conversa: %s", (texto) => {
    expect(lerRespostaDoCliente(texto)).toBeNull();
  });
});
