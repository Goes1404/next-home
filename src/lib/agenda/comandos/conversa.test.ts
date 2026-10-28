import { describe, expect, it, vi } from "vitest";
import type { EstadoDaConversa } from "@/lib/agenda/conversaDeAgenda";
import { responderAoCorretor, type Dependencias } from "./conversa";
import type { PedidoDoCorretor } from "./tipos";

/*
 * A conversa do corretor com o sistema (fase 5): nada grava sem "sim", nome
 * ambíguo pergunta qual, nome que não existe não cria lead, toda mensagem
 * tem resposta, e a cobrança da visita aceita 1/2/3.
 */
function deps(p: { estado?: EstadoDaConversa | null; pedido?: PedidoDoCorretor; leads?: { id: string; nome: string }[]; ia?: boolean } = {}) {
  let estado = p.estado ?? null;
  const d = {
    agora: new Date("2026-10-30T12:00:00Z"),
    ehGestor: false as boolean,
    lerEstado: vi.fn(async () => estado),
    gravarEstado: vi.fn(async (e: EstadoDaConversa) => {
      estado = e;
    }),
    limparEstado: vi.fn(async () => {
      estado = null;
    }),
    podeUsarIa: vi.fn(async () => p.ia ?? true),
    interpretar: vi.fn(async () => p.pedido ?? ({ tipo: "nao_entendi" } as PedidoDoCorretor)),
    buscarLeads: vi.fn(async () => p.leads ?? []),
    buscarEquipe: vi.fn(async () => [
      { id: "c1", nome: "Bruno Alves" },
      { id: "c2", nome: "Carla Dias" },
    ]),
    agendaDoDia: vi.fn(async () => [{ inicio: "2026-10-31T13:00:00-03:00", descricao: "Visita · Ana Souza" }]),
    marcarVisita: vi.fn(async () => ({})),
    bloquear: vi.fn(async () => ({})),
    lembrete: vi.fn(async () => ({})),
    reuniao: vi.fn(async () => ({})),
    responderVisita: vi.fn(async () => ({ ok: "Anotado: a visita aconteceu." })),
    devolverCobranca: vi.fn(async () => {}),
  } satisfies Dependencias;
  return { d, estadoAtual: () => estado };
}

const VISITA: PedidoDoCorretor = { tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: "Alpha" };

describe("responderAoCorretor", () => {
  it("pedido de visita pede confirmação e só grava no sim", async () => {
    const { d } = deps({ pedido: VISITA, leads: [{ id: "l1", nome: "Ana Souza" }] });
    const pergunta = await responderAoCorretor("visita com a Ana sábado 10h no Alpha", d);
    expect(pergunta).toMatch(/Confirma\?/);
    expect(d.marcarVisita).not.toHaveBeenCalled();
    const feito = await responderAoCorretor("sim", d);
    expect(d.marcarVisita).toHaveBeenCalledWith("l1", new Date("2026-10-31T10:00:00-03:00"));
    expect(feito).toMatch(/^Pronto: visita marcada/);
  });

  it("não no lugar do sim não grava nada", async () => {
    const { d } = deps({ pedido: VISITA, leads: [{ id: "l1", nome: "Ana Souza" }] });
    await responderAoCorretor("visita com a Ana sábado 10h", d);
    expect(await responderAoCorretor("não", d)).toBe("Ok, não marquei nada.");
    expect(d.marcarVisita).not.toHaveBeenCalled();
  });

  it("nome ambíguo pergunta qual, com as opções numeradas", async () => {
    const { d } = deps({ pedido: VISITA, leads: [{ id: "l1", nome: "Ana Souza" }, { id: "l2", nome: "Ana Lima" }] });
    const escolha = await responderAoCorretor("visita com a Ana sábado 10h", d);
    expect(escolha).toMatch(/1\) Ana Lima/);
    const confirma = await responderAoCorretor("2", d);
    expect(confirma).toMatch(/Ana Souza/);
    await responderAoCorretor("sim", d);
    expect(d.marcarVisita).toHaveBeenCalledWith("l1", expect.any(Date));
  });

  it("nome que não existe não cria lead: diz que não achou", async () => {
    const { d } = deps({ pedido: VISITA, leads: [] });
    expect(await responderAoCorretor("visita com a Ana sábado 10h", d)).toMatch(/Não achei cliente/);
    expect(d.gravarEstado).not.toHaveBeenCalled();
  });

  it("horário ocupado volta com a explicação", async () => {
    const { d } = deps({ pedido: VISITA, leads: [{ id: "l1", nome: "Ana Souza" }] });
    d.marcarVisita.mockResolvedValueOnce({ erro: "Esse horário não está livre. Livres: sáb 31/10 às 11h." });
    await responderAoCorretor("visita com a Ana sábado 10h", d);
    expect(await responderAoCorretor("sim", d)).toMatch(/não está livre/);
  });

  it("mensagem que não é pedido responde que não entendeu, com exemplo", async () => {
    const { d } = deps();
    expect(await responderAoCorretor("bom dia", d)).toMatch(/Não entendi/i);
  });

  it("'sim' sem pergunta pendente não gasta IA", async () => {
    const { d } = deps();
    await responderAoCorretor("sim", d);
    expect(d.interpretar).not.toHaveBeenCalled();
  });

  it("sem créditos da IA diz que a Agenda do painel continua", async () => {
    const { d } = deps({ ia: false });
    expect(await responderAoCorretor("visita com a Ana sábado 10h", d)).toMatch(/painel continua/);
    expect(d.interpretar).not.toHaveBeenCalled();
  });

  it("cobrança: 1 registra que a visita aconteceu", async () => {
    const { d, estadoAtual } = deps({ estado: { tipo: "cobranca", visitaId: "v1", nome: "Ana" } });
    expect(await responderAoCorretor("1", d)).toBe("Anotado: a visita aconteceu.");
    expect(d.responderVisita).toHaveBeenCalledWith("v1", "aconteceu");
    expect(estadoAtual()).toBeNull();
  });

  it("cobrança: 3 pede a nova data e remarca com ela", async () => {
    const nova: PedidoDoCorretor = { tipo: "marcar_visita", cliente: "Ana", quando: "2026-11-02T10:00:00-03:00", imovel: null };
    const { d } = deps({ estado: { tipo: "cobranca", visitaId: "v1", nome: "Ana" }, pedido: nova });
    expect(await responderAoCorretor("3", d)).toMatch(/Para quando/);
    d.responderVisita.mockResolvedValueOnce({ ok: "Anotado: visita remarcada para seg 02/11 às 10h." });
    expect(await responderAoCorretor("segunda 10h", d)).toMatch(/remarcada/);
    expect(d.responderVisita).toHaveBeenLastCalledWith("v1", "remarcou", new Date("2026-11-02T10:00:00-03:00"));
  });

  it("pedido novo no meio da cobrança devolve a pergunta à fila, sem perdê-la", async () => {
    const { d, estadoAtual } = deps({
      estado: { tipo: "cobranca", visitaId: "v1", nome: "Ana" },
      pedido: VISITA,
      leads: [{ id: "l1", nome: "Ana Souza" }],
    });
    expect(await responderAoCorretor("visita com a Ana sábado 10h", d)).toMatch(/Confirma?/);
    expect(d.devolverCobranca).toHaveBeenCalledWith("v1");
    expect(estadoAtual()).toMatchObject({ tipo: "confirmar" });
  });

  it("consulta no meio da cobrança não mexe na pergunta pendente", async () => {
    const { d, estadoAtual } = deps({ estado: { tipo: "cobranca", visitaId: "v1", nome: "Ana" }, pedido: { tipo: "consultar", dia: "2026-10-31" } });
    await responderAoCorretor("o que eu tenho amanhã?", d);
    expect(d.devolverCobranca).not.toHaveBeenCalled();
    expect(estadoAtual()).toMatchObject({ tipo: "cobranca", visitaId: "v1" });
  });

  it("consulta lista o dia", async () => {
    const { d } = deps({ pedido: { tipo: "consultar", dia: "2026-10-31" } });
    expect(await responderAoCorretor("o que eu tenho amanhã?", d)).toMatch(/Ana Souza/);
  });

  it("reunião com nomes da equipe confirma com os nomes e grava com os ids", async () => {
    const { d } = deps({
      pedido: { tipo: "reuniao", titulo: "metas", inicio: "2026-11-06T15:00:00-03:00", fim: "2026-11-06T16:00:00-03:00", participantes: ["Bruno", "Carla"] },
    });
    d.ehGestor = true;
    expect(await responderAoCorretor("reunião com Bruno e Carla sexta 15h", d)).toMatch(/Bruno Alves/);
    await responderAoCorretor("sim", d);
    expect(d.reuniao).toHaveBeenCalledWith("metas", expect.any(Date), expect.any(Date), ["c1", "c2"]);
  });

  it("lembrete sem cliente vira lembrete pessoal", async () => {
    const { d } = deps({ pedido: { tipo: "lembrete", cliente: null, texto: "pagar o boleto", quando: "2026-10-31T09:00:00-03:00" } });
    await responderAoCorretor("me lembra de pagar o boleto amanhã 9h", d);
    await responderAoCorretor("sim", d);
    expect(d.lembrete).toHaveBeenCalledWith(null, "pagar o boleto", expect.any(Date));
  });
});
