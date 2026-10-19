import { describe, expect, it } from "vitest";
import { detectarMudancaDeVisita, resolverDataDaVisita, rotuloDaVisita, visitaCombinadaNoChat } from "./mudancaDeVisita";
import { pedidoDeAgendamento } from "./pedidoDeAgendamento";
import { estadoDaConversa, planejarJogada, aceiteDeVisitaValido, blocoDaJogada } from "./jogada";

// Sábado, 10/10/2026, 10h em São Paulo (13h UTC).
const VISITA = new Date("2026-10-10T13:00:00Z");
// "Agora": terça, 06/10/2026, 14h em São Paulo.
const AGORA = new Date("2026-10-06T17:00:00Z");

const ler = (texto: string, visita: Date | null = VISITA) =>
  detectarMudancaDeVisita({ texto, visitaMarcada: visita, agendamento: pedidoDeAgendamento(texto) });

describe("detectarMudancaDeVisita", () => {
  it("sem visita marcada, nada é remarcação nem desmarque", () => {
    expect(ler("vou ter que cancelar", null)).toBeNull();
    expect(ler("quero remarcar", null)).toBeNull();
  });

  it.each([
    "vou ter que cancelar a visita",
    "não vou poder ir",
    "não vou conseguir ir, desculpa",
    "pode desmarcar",
    "não vai dar pra ir",
    "Não vou mais na visita",
  ])("desmarque inequívoco: %s", (texto) => {
    expect(ler(texto)?.tipo).toBe("cancelar");
  });

  it("'não vou poder ir sábado, pode ser domingo?' é REMARCAR para domingo, nunca desmarque", () => {
    const m = ler("não vou poder ir sábado, pode ser domingo?");
    expect(m).toEqual(expect.objectContaining({ tipo: "remarcar", dia: "domingo" }));
  });

  it.each([
    ["quero remarcar", null, null],
    ["dá pra mudar o horário?", null, null],
    ["consigo trocar o dia?", null, null],
    ["podemos remarcar pra segunda às 15h?", "segunda-feira", 15],
    ["preciso adiar, pode ser semana que vem?", null, null],
  ])("pedido de remarcar: %s", (texto, dia, hora) => {
    expect(ler(texto)).toEqual(expect.objectContaining({ tipo: "remarcar", dia, hora }));
  });

  it("a resposta curta com nova data é remarcação", () => {
    expect(ler("domingo 10h")).toEqual(expect.objectContaining({ tipo: "remarcar", dia: "domingo", hora: 10 }));
    expect(ler("pode ser às 15?")).toEqual(expect.objectContaining({ tipo: "remarcar", hora: 15 }));
  });

  it.each([
    "sábado às 10, né?",
    "às 10h então",
    "sábado eu trabalho até as 18h mas consigo chegar",
    "não quero cancelar não, só confirmar o endereço",
    "qual o endereço?",
    "ok, combinado",
  ])("NÃO é mudança (confirmar, conversa normal, negar o pedido): %s", (texto) => {
    expect(ler(texto)).toBeNull();
  });
});

describe("resolverDataDaVisita", () => {
  it("dia da semana é a próxima ocorrência, no fuso de São Paulo", () => {
    const d = resolverDataDaVisita({ dia: "sábado", hora: 10, depoisDe: AGORA });
    expect(d?.toISOString()).toBe("2026-10-10T13:00:00.000Z");
  });

  it("hoje só vale se a hora ainda não passou; senão é a semana que vem", () => {
    // Terça 14h: "terça às 9" já passou → terça seguinte.
    expect(resolverDataDaVisita({ dia: "terça-feira", hora: 9, depoisDe: AGORA })?.toISOString()).toBe(
      "2026-10-13T12:00:00.000Z",
    );
    expect(resolverDataDaVisita({ dia: "terça-feira", hora: 18, depoisDe: AGORA })?.toISOString()).toBe(
      "2026-10-06T21:00:00.000Z",
    );
  });

  it("às 22h de Brasília o servidor já virou o dia, e 'amanhã' continua sendo o dia seguinte de SP", () => {
    const noiteDeTerca = new Date("2026-10-07T01:00:00Z"); // terça 22h em SP, quarta em UTC
    expect(resolverDataDaVisita({ dia: "amanhã", hora: 10, depoisDe: noiteDeTerca })?.toISOString()).toBe(
      "2026-10-07T13:00:00.000Z",
    );
  });

  it("só a hora: o dia é o da visita marcada", () => {
    expect(
      resolverDataDaVisita({ dia: null, hora: 15, depoisDe: AGORA, diaDeReferencia: VISITA })?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
  });

  it("sem hora não há compromisso", () => {
    expect(resolverDataDaVisita({ dia: "sábado", hora: null, depoisDe: AGORA })).toBeNull();
  });

  it("rótulo legível", () => {
    expect(rotuloDaVisita(VISITA)).toBe("sábado, 10/10 às 10h");
  });
});

describe("planner: remarcar e desmarcar (A2)", () => {
  const base = {
    historico: [
      { remetente: "bot" as const, texto: "Combinado! Sábado, 10/10, às 10h está confirmado no Terra Alta." },
    ],
    dossie: null,
    imovelEmFoco: null,
    catalogo: [],
    agora: AGORA,
  };

  it("com visita marcada, 'vou ter que cancelar' é cancelar_visita, não o 'até lá'", () => {
    const e = estadoDaConversa({ ...base, mensagemAtual: "vou ter que cancelar", visitaMarcadaEm: VISITA.toISOString() });
    expect(planejarJogada(e)).toEqual({ tipo: "cancelar_visita", de: "sábado, 10/10 às 10h" });
  });

  it("'pode ser domingo às 11?' remarca, e a confirmação vale sem imóvel em foco", () => {
    const e = estadoDaConversa({
      ...base,
      mensagemAtual: "sábado não vou conseguir, pode ser domingo às 11?",
      visitaMarcadaEm: VISITA.toISOString(),
    });
    const j = planejarJogada(e);
    expect(j).toEqual({ tipo: "remarcar_visita", de: "sábado, 10/10 às 10h", dia: "domingo", hora: 11 });
    expect(aceiteDeVisitaValido(j, false, true)).toBe(true);
    expect(blocoDaJogada(j, { nomeDoFoco: null })).toContain('"confirmadaPeloCliente": true');
  });

  it("remarcar sem data oferece horários e NÃO confirma nada", () => {
    const e = estadoDaConversa({ ...base, mensagemAtual: "quero remarcar", visitaMarcadaEm: VISITA.toISOString() });
    const j = planejarJogada(e);
    expect(j.tipo).toBe("remarcar_visita");
    expect(aceiteDeVisitaValido(j, true, true)).toBe(false);
    expect(blocoDaJogada(j, { nomeDoFoco: null })).toContain('"visitaProposta" fica null');
  });

  it("a visita do CRM decide o fim do funil: desmarcada, o 'está confirmado' do histórico não vale mais", () => {
    const desmarcada = estadoDaConversa({ ...base, mensagemAtual: "e o de 3 dormitórios?", visitaMarcadaEm: null });
    expect(desmarcada.visitaConfirmada).toBe(false);
    // Sem a informação do CRM (eval, playground), vale o texto, como antes.
    const semCrm = estadoDaConversa({ ...base, mensagemAtual: "e o de 3 dormitórios?" });
    expect(semCrm.visitaConfirmada).toBe(true);
  });

  it("visita que já passou não é remarcável nem segura o funil", () => {
    const e = estadoDaConversa({
      ...base,
      mensagemAtual: "vou ter que cancelar",
      visitaMarcadaEm: "2026-10-01T13:00:00Z",
    });
    expect(e.visitaMarcada).toBeNull();
    expect(planejarJogada(e).tipo).not.toBe("cancelar_visita");
  });

  it("a recusa continua vencendo: 'não quero mais, pode cancelar tudo' encerra", () => {
    const e = estadoDaConversa({
      ...base,
      mensagemAtual: "não tenho mais interesse",
      visitaMarcadaEm: VISITA.toISOString(),
    });
    expect(planejarJogada(e).tipo).toBe("acolher_recusa");
  });
});

describe("guarda: quem desmarca é o planner, nunca o modelo", () => {
  it("o webhook só chama cancelarVisitaLead quando a jogada é cancelar_visita", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const chamadas = fonte.split("cancelarVisitaLead(").length - 1;
    expect(chamadas).toBe(1);
    const i = fonte.indexOf("cancelarVisitaLead(");
    expect(fonte.slice(i - 200, i)).toContain('turno.jogada.tipo === "cancelar_visita"');
  });
});

describe("visitaCombinadaNoChat (A2.2)", () => {
  const combinada = (p: Partial<Parameters<typeof visitaCombinadaNoChat>[0]>) =>
    visitaCombinadaNoChat({ agora: AGORA, visitaMarcada: null, ...p })?.toISOString() ?? null;

  it.each(["Combinado, sábado às 10h", "te espero sábado às 10", "Fechado! Sábado 10h no decorado"])(
    "o corretor afirma o combinado: %s",
    (fala) => {
      expect(combinada({ falaDoCorretor: fala })).toBe("2026-10-10T13:00:00.000Z");
    },
  );

  it.each([
    "sábado às 10 fica bom?",
    "posso te ligar sábado às 10?",
    "combinado, te mando as fotos",
    "o decorado abre sábado",
  ])("proposta, pergunta ou combinado sem dia e hora NÃO viram visita: %s", (fala) => {
    expect(combinada({ falaDoCorretor: fala })).toBeNull();
  });

  it("o corretor propôs e o cliente aceitou", () => {
    expect(combinada({ falaDoCliente: "pode ser", propostaDoCorretor: "sábado às 10 fica bom pra você?" })).toBe(
      "2026-10-10T13:00:00.000Z",
    );
  });

  it.each(["não posso", "pode ser, mas me confirma o endereço antes porque não sei onde fica", "qual o valor?"])(
    "aceite que não é aceite: %s",
    (fala) => {
      expect(combinada({ falaDoCliente: fala, propostaDoCorretor: "sábado às 10 fica bom?" })).toBeNull();
    },
  );

  it("a visita já marcada na mesma data não vira sugestão de novo", () => {
    expect(combinada({ falaDoCorretor: "combinado, sábado às 10h", visitaMarcada: VISITA })).toBeNull();
  });
});
