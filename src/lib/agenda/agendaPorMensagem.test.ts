import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "@/lib/central/bancoFalso";

/*
 * Visita pedida por mensagem (central, onda 1): quem pede só alcança o que é
 * dele (o gestor, o grupo), o horário é conferido como a reserva do banco
 * confere, e o desfazer só volta o que ainda está como o central deixou.
 * A escrita de verdade (`agendarVisitaLead`, `cancelarVisitaLead`) tem teste
 * de banco próprio; aqui ela é imitada sobre o banco falso.
 */

let banco: ReturnType<typeof bancoFalso>;
let recusarReserva = false;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const AVANCADAS = ["visitou", "proposta", "documentacao", "fechado"];
const repositorio = vi.hoisted(() => ({
  agendarVisitaLead: vi.fn(),
  cancelarVisitaLead: vi.fn(),
  apagarLembretesPendentesDeVisita: vi.fn(async () => {}),
  registrarEtapaAutomatica: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp/repositorio", () => repositorio);

const {
  conferirHorarioDaVisita,
  desmarcarVisitaPorMensagem,
  lerVisitaDoLead,
  marcarVisitaPorMensagem,
  visitasNoIntervalo,
  voltarVisitaPorMensagem,
} = await import("./agendaPorMensagem");

const G = "g1";
// Sexta, 30/10/2026, 12h em São Paulo.
const AGORA = new Date("2026-10-30T15:00:00Z");
const SABADO_10H = new Date("2026-10-31T13:00:00Z");
const SEGUNDA_10H = "2026-11-02T13:00:00.000Z";

const corretor = { grupoId: G, corretorId: "c1", ehGestor: false };
const gestor = { grupoId: G, corretorId: "g", ehGestor: true };

const lead = (l: Linha) => ({ grupo_id: G, arquivado_em: null, visita_agendada_em: null, etapa: "em_conversa", ...l });

beforeEach(() => {
  recusarReserva = false;
  vi.clearAllMocks();
  banco = bancoFalso({
    leads: [
      lead({ id: "l1", nome: "João Pereira", corretor_id: "c1" }),
      lead({ id: "l2", nome: "Ana Souza", corretor_id: "c2", etapa: "visita_agendada", visita_agendada_em: SEGUNDA_10H }),
      lead({ id: "l3", nome: "Carla Arquivada", corretor_id: "c1", arquivado_em: "2026-10-01" }),
      lead({ id: "l4", nome: "Bia Outro Grupo", corretor_id: "c1", grupo_id: "outro" }),
    ],
    visitas: [
      { id: "v2", grupo_id: G, lead_id: "l2", corretor_id: "c2", status: "marcada", inicio: SEGUNDA_10H, fim: "2026-11-02T14:00:00.000Z", passada_em: null },
    ],
    corretor_disponibilidade: [],
    compromisso_participantes: [],
    lead_interacoes: [],
  });
  // A reserva do banco, imitada: data no lead e etapa "visita agendada" (salvo etapa adiante).
  repositorio.agendarVisitaLead.mockImplementation(async (leadId: string, quando: Date) => {
    if (recusarReserva) return false;
    const l = banco.tabelas.leads.find((x) => x.id === leadId)!;
    l.visita_agendada_em = quando.toISOString();
    if (!AVANCADAS.includes(String(l.etapa))) l.etapa = "visita_agendada";
    return true;
  });
  repositorio.cancelarVisitaLead.mockImplementation(async (leadId: string) => {
    const l = banco.tabelas.leads.find((x) => x.id === leadId)!;
    const antes = l.visita_agendada_em as string | null;
    l.visita_agendada_em = null;
    if (l.etapa === "visita_agendada") l.etapa = "em_conversa";
    return antes ? new Date(antes) : null;
  });
});

describe("quem alcança o lead", () => {
  it("corretor só os dele; gestor o grupo; arquivado e outro grupo nunca", async () => {
    expect(await lerVisitaDoLead(corretor, "l1")).toMatchObject({ nome: "João Pereira", visitaEm: null });
    expect(await lerVisitaDoLead(corretor, "l2")).toBeNull();
    expect(await lerVisitaDoLead(gestor, "l2")).toMatchObject({ nome: "Ana Souza", donoId: "c2" });
    expect(await lerVisitaDoLead(corretor, "l3")).toBeNull();
    expect(await lerVisitaDoLead(gestor, "l4")).toBeNull();
  });

  it("corretor marcando visita no lead de outro: nada é reservado", async () => {
    const r = await marcarVisitaPorMensagem(corretor, { leadId: "l2", quando: SABADO_10H, esperada: SEGUNDA_10H, agora: AGORA });
    expect(r.ok).toBe(false);
    expect(repositorio.agendarVisitaLead).not.toHaveBeenCalled();
  });
});

describe("o horário, conferido antes do sim", () => {
  it("livre quando não há grade nem nada no caminho", async () => {
    expect(await conferirHorarioDaVisita(corretor, { leadId: "l1", quando: SABADO_10H, agora: AGORA })).toEqual({ livre: true });
  });

  it("fora da grade de quem faz a visita, com os livres", async () => {
    banco.tabelas.corretor_disponibilidade.push({ grupo_id: G, corretor_id: "c1", dia_semana: 6, hora_inicio: 14, hora_fim: 18 });
    const r = await conferirHorarioDaVisita(corretor, { leadId: "l1", quando: SABADO_10H, agora: AGORA });
    expect(r).toMatchObject({ livre: false, motivo: "Esse horário está fora da sua grade de visitas." });
    expect(r.livre === false && r.livres[0]).toMatch(/sábado, 31\/10 às 14h/);
  });

  it("outra visita do mesmo corretor cruzando a hora, ou um bloqueio, ocupam", async () => {
    banco.tabelas.visitas.push({ id: "v9", grupo_id: G, lead_id: "l9", corretor_id: "c1", status: "marcada", inicio: "2026-10-31T13:30:00.000Z", fim: "2026-10-31T14:30:00.000Z" });
    expect(await conferirHorarioDaVisita(corretor, { leadId: "l1", quando: SABADO_10H, agora: AGORA })).toMatchObject({ livre: false });
    banco.tabelas.visitas.pop();
    banco.tabelas.compromisso_participantes.push({ grupo_id: G, corretor_id: "c1", ativo: true, compromisso_id: "k1", inicio: "2026-10-31T12:00:00.000Z", fim: "2026-10-31T15:00:00.000Z" });
    expect(await conferirHorarioDaVisita(corretor, { leadId: "l1", quando: SABADO_10H, agora: AGORA })).toMatchObject({ livre: false });
  });

  it("remarcar não bate com a própria visita; o gestor confere a agenda do dono", async () => {
    const quando = new Date("2026-11-02T13:30:00Z");
    expect(await conferirHorarioDaVisita(gestor, { leadId: "l2", quando, agora: AGORA })).toEqual({ livre: true });
    banco.tabelas.visitas.push({ id: "v9", grupo_id: G, lead_id: "l9", corretor_id: "c2", status: "marcada", inicio: "2026-11-02T14:00:00.000Z", fim: "2026-11-02T15:00:00.000Z" });
    expect(await conferirHorarioDaVisita(gestor, { leadId: "l2", quando, agora: AGORA })).toMatchObject({
      livre: false,
      motivo: "Quem atende esse cliente já tem outro compromisso nesse horário.",
    });
  });
});

describe("marcar, desmarcar e desfazer", () => {
  it("marca pelo central (a linha do tempo diz quem) e devolve o antes e o depois", async () => {
    const r = await marcarVisitaPorMensagem(corretor, { leadId: "l1", quando: SABADO_10H, esperada: null, agora: AGORA });
    expect(r).toEqual({
      ok: true,
      antes: { visitaEm: null, etapa: "em_conversa" },
      depois: { visitaEm: SABADO_10H.toISOString(), etapa: "visita_agendada" },
    });
    expect(repositorio.agendarVisitaLead).toHaveBeenCalledWith("l1", SABADO_10H, { por: "central", corretorId: "c1" });
  });

  it("a visita mudou entre a proposta e o sim: não grava", async () => {
    const r = await marcarVisitaPorMensagem(gestor, { leadId: "l2", quando: SABADO_10H, esperada: null, agora: AGORA });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/mudou desde o pedido/) });
    expect(repositorio.agendarVisitaLead).not.toHaveBeenCalled();
  });

  it("horário recusado pela reserva: erro, sem antes/depois", async () => {
    recusarReserva = true;
    const r = await marcarVisitaPorMensagem(corretor, { leadId: "l1", quando: SABADO_10H, esperada: null, agora: AGORA });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/não está mais livre/) });
  });

  it("desmarcar sem visita marcada: erro; com visita: pelo central", async () => {
    expect(await desmarcarVisitaPorMensagem(corretor, { leadId: "l1", esperada: null, agora: AGORA })).toMatchObject({ ok: false });
    const r = await desmarcarVisitaPorMensagem(gestor, { leadId: "l2", esperada: SEGUNDA_10H, agora: AGORA });
    expect(r).toEqual({
      ok: true,
      antes: { visitaEm: SEGUNDA_10H, etapa: "visita_agendada" },
      depois: { visitaEm: null, etapa: "em_conversa" },
    });
    expect(repositorio.cancelarVisitaLead).toHaveBeenCalledWith("l2", { por: "central", corretorId: "g" });
  });

  it("desfazer a marcação: a visita sai e a etapa volta", async () => {
    const r = await marcarVisitaPorMensagem(corretor, { leadId: "l1", quando: SABADO_10H, esperada: null, agora: AGORA });
    if (!r.ok) throw new Error(r.erro);
    expect(await voltarVisitaPorMensagem(corretor, { leadId: "l1", ...r, agora: AGORA })).toEqual({
      ok: true,
      texto: "A visita de João Pereira saiu da agenda.",
    });
    expect(banco.tabelas.leads[0]).toMatchObject({ visita_agendada_em: null, etapa: "em_conversa" });
    expect(repositorio.apagarLembretesPendentesDeVisita).toHaveBeenCalled();
    expect(repositorio.registrarEtapaAutomatica).toHaveBeenCalledWith("l1", "visita_agendada", "em_conversa", "central");
    expect(banco.tabelas.lead_interacoes[0]).toMatchObject({ lead_id: "l1", corretor_id: "c1", tipo: "visita" });
  });

  it("desfazer o cancelamento: a visita volta para a data de antes", async () => {
    const r = await desmarcarVisitaPorMensagem(gestor, { leadId: "l2", esperada: SEGUNDA_10H, agora: AGORA });
    if (!r.ok) throw new Error(r.erro);
    expect((await voltarVisitaPorMensagem(gestor, { leadId: "l2", ...r, agora: AGORA })).texto).toBe(
      "A visita de Ana Souza voltou para segunda 02/11 às 10h.",
    );
    expect(banco.tabelas.leads[1]).toMatchObject({ visita_agendada_em: SEGUNDA_10H, etapa: "visita_agendada" });
  });

  it("desfazer não passa por cima de quem mexeu depois, nem regride etapa que avançou", async () => {
    const r = await marcarVisitaPorMensagem(corretor, { leadId: "l1", quando: SABADO_10H, esperada: null, agora: AGORA });
    if (!r.ok) throw new Error(r.erro);
    const l1 = banco.tabelas.leads[0];

    l1.visita_agendada_em = SEGUNDA_10H; // o cliente remarcou pela conversa
    expect(await voltarVisitaPorMensagem(corretor, { leadId: "l1", ...r, agora: AGORA })).toMatchObject({ ok: false });
    expect(l1.visita_agendada_em).toBe(SEGUNDA_10H);

    l1.visita_agendada_em = SABADO_10H.toISOString();
    l1.etapa = "proposta";
    expect(await voltarVisitaPorMensagem(corretor, { leadId: "l1", ...r, agora: AGORA })).toMatchObject({ ok: true });
    expect(l1).toMatchObject({ visita_agendada_em: null, etapa: "proposta" });
  });

  it("a data de antes já passou: não volta para o passado", async () => {
    const antes = { visitaEm: "2026-10-29T13:00:00.000Z", etapa: "visita_agendada" };
    const depois = { visitaEm: null, etapa: "em_conversa" };
    expect(await voltarVisitaPorMensagem(corretor, { leadId: "l1", antes, depois, agora: AGORA })).toMatchObject({
      ok: false,
      texto: expect.stringMatching(/já passou/),
    });
    expect(banco.escritas).toEqual([]);
  });
});

describe("visitas no caminho do bloqueio", () => {
  it("só as marcadas de quem pede, no grupo dele", async () => {
    banco.tabelas.visitas.push(
      { id: "a", grupo_id: G, lead_id: "l1", corretor_id: "c1", status: "marcada", inicio: "2026-11-02T13:00:00.000Z", fim: "2026-11-02T14:00:00.000Z" },
      { id: "b", grupo_id: G, lead_id: "l1", corretor_id: "c1", status: "cancelada", inicio: "2026-11-02T15:00:00.000Z", fim: "2026-11-02T16:00:00.000Z" },
      { id: "c", grupo_id: "outro", lead_id: "x", corretor_id: "c1", status: "marcada", inicio: "2026-11-02T16:00:00.000Z", fim: "2026-11-02T17:00:00.000Z" },
    );
    const r = await visitasNoIntervalo(corretor, { inicio: new Date("2026-11-02T11:00:00Z"), fim: new Date("2026-11-02T21:00:00Z") });
    expect(r.map((d) => d.toISOString())).toEqual(["2026-11-02T13:00:00.000Z"]);
  });
});
