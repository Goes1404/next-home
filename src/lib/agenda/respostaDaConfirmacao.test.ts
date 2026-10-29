import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A resposta ao pedido de confirmação com a IA calada (0246): "confirmo" e
 * "não posso" viram o status da visita e UM aviso ao corretor; o ambíguo fica
 * na conversa; e nada acontece fora da janela ou se a última palavra nossa
 * não foi o pedido.
 */

let ultimoPedido: string | null = null;
let confirmou = true;
let remarcou = true;
const confirmacoes: string[] = [];
const remarcacoes: string[] = [];
const avisos: { para: string; texto: string }[] = [];

vi.mock("@/lib/whatsapp/repositorio", () => ({
  ultimoFollowupEnviado: async () => ultimoPedido,
  registrarVisitaConfirmada: async (leadId: string) => {
    confirmacoes.push(leadId);
    return confirmou;
  },
  registrarRemarcacaoPedida: async (leadId: string) => {
    remarcacoes.push(leadId);
    return remarcou;
  },
}));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, para: string, texto: string) => {
    avisos.push({ para, texto });
    return true;
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nome: "Maria Lima", telefone: null, grupo_id: "g1" } }) }),
      }),
    }),
  }),
}));

const { lerRespostaAoPedidoDeConfirmacao } = await import("./respostaDaConfirmacao");

const agora = Date.now();
const ha = (min: number) => new Date(agora - min * 60_000).toISOString();

const responder = (texto: string, historicoAntes = [{ remetente: "corretor", texto: "Posso contar com você?", em: ha(30) }]) =>
  lerRespostaAoPedidoDeConfirmacao({
    conversaId: "c1",
    leadId: "l1",
    corretorId: "ana",
    historico: [...historicoAntes, { remetente: "cliente", texto, em: ha(1) }],
  });

beforeEach(() => {
  ultimoPedido = ha(30);
  confirmou = true;
  remarcou = true;
  confirmacoes.length = 0;
  remarcacoes.length = 0;
  avisos.length = 0;
});

describe("a resposta do cliente ao pedido", () => {
  it("'confirmo' grava a confirmação e avisa o corretor", async () => {
    expect(await responder("Confirmo, até amanhã")).toBe("confirmou");
    expect(confirmacoes).toEqual(["l1"]);
    expect(avisos).toEqual([{ para: "ana", texto: expect.stringContaining("Maria Lima confirmou a visita") }]);
  });

  it("'não posso' marca o pedido de remarcar e avisa", async () => {
    expect(await responder("não posso, surgiu um imprevisto")).toBe("remarcar");
    expect(remarcacoes).toEqual(["l1"]);
    expect(confirmacoes).toEqual([]);
    expect(avisos[0].texto).toContain("pediu para remarcar");
  });

  it("ambígua fica na conversa: nada grava, ninguém é avisado", async () => {
    expect(await responder("qual o endereço mesmo?")).toBeNull();
    expect(confirmacoes).toEqual([]);
    expect(remarcacoes).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it("carimbo que já existia não vira aviso repetido", async () => {
    confirmou = false;
    expect(await responder("sim")).toBe("confirmou");
    expect(avisos).toEqual([]);
  });

  it("sem pedido, pedido antigo, ou com outra fala nossa depois dele: não é resposta ao pedido", async () => {
    ultimoPedido = null;
    expect(await responder("sim")).toBeNull();
    ultimoPedido = ha(31 * 60);
    expect(await responder("sim")).toBeNull();
    ultimoPedido = ha(30);
    expect(
      await responder("sim", [
        { remetente: "corretor", texto: "Posso contar com você?", em: ha(30) },
        { remetente: "corretor", texto: "Te mando a planta?", em: ha(10) },
      ]),
    ).toBeNull();
    expect(confirmacoes).toEqual([]);
  });

  it("o webhook lê a resposta só no caminho da IA calada (com a IA atendendo, quem lê é o turno dela)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const rota = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");
    const calada = rota.indexOf("if (!decisaoIA.responde) {");
    const fimDaCalada = rota.indexOf('action: "ia_calada"', calada);
    const chamada = rota.indexOf("lerRespostaAoPedidoDeConfirmacao({");
    expect(calada).toBeGreaterThan(0);
    expect(chamada).toBeGreaterThan(calada);
    expect(chamada).toBeLessThan(fimDaCalada);
    expect(rota.indexOf("lerRespostaAoPedidoDeConfirmacao({", chamada + 1)).toBe(-1);
    // O turno da IA continua lendo pelos follow-ups, como antes.
    expect(rota.indexOf("instrucaoPelosFollowups({")).toBeGreaterThan(fimDaCalada);
  });

  it("conversa sem lead não faz nada", async () => {
    expect(
      await lerRespostaAoPedidoDeConfirmacao({ conversaId: "c1", leadId: null, corretorId: "ana", historico: [{ remetente: "cliente", texto: "sim" }] }),
    ).toBeNull();
  });
});
