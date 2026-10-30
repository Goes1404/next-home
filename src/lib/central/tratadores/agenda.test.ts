import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

/*
 * Agenda pelo número central (onda 1): visita (6) e agenda pessoal (21).
 * Roda sobre o banco falso com as funções de domínio de verdade (lead,
 * horário, compromissos, anotação); só a reserva do banco
 * (`agendarVisitaLead`/`cancelarVisitaLead`, que tem teste de banco) é
 * imitada. Relógio fixo: sexta, 30/10/2026, 12h em São Paulo.
 */

let banco: ReturnType<typeof bancoFalso>;
const avisos: [string, string][] = [];

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, id: string, texto: string) => (avisos.push([id, texto]), true),
}));
const repositorio = vi.hoisted(() => ({
  agendarVisitaLead: vi.fn(),
  cancelarVisitaLead: vi.fn(),
  apagarLembretesPendentesDeVisita: vi.fn(async () => {}),
  registrarEtapaAutomatica: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp/repositorio", () => repositorio);

const { criarTratadoresDaAgenda } = await import("./agenda");
const { criarExecutor, executarProposta } = await import("../executar");

const AGORA = new Date("2026-10-30T15:00:00Z");
const G = "g1";
const SABADO_10H = "2026-10-31T13:00:00.000Z";
const SABADO_14H = "2026-10-31T17:00:00.000Z";

const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "g", papel: "gestor" as const, nome: "Gil" };

const { acoes } = criarTratadoresDaAgenda(() => AGORA);
const tratadores = { consultas: {}, acoes };
const { visita, agenda_pessoal: agendaPessoal } = acoes;

const lead = (l: Linha) => ({ grupo_id: G, arquivado_em: null, visita_agendada_em: null, etapa: "em_conversa", telefone: null, ...l });
const leadDe = (id: string) => banco.tabelas.leads.find((l) => l.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  avisos.length = 0;
  banco = bancoFalso({
    corretores: [
      { id: "c1", grupo_id: G, nome: "Carol", ativo: true },
      { id: "c2", grupo_id: G, nome: "Bruno", ativo: true },
      { id: "g", grupo_id: G, nome: "Gil", ativo: true },
    ],
    leads: [
      lead({ id: "l1", nome: "João Pereira", corretor_id: "c1" }),
      lead({ id: "l2", nome: "João Lima", corretor_id: "c1" }),
      lead({ id: "l5", nome: "Maria Souza", corretor_id: "c1", etapa: "visita_agendada", visita_agendada_em: SABADO_10H }),
      lead({ id: "l3", nome: "Ana Costa", corretor_id: "c2" }),
      lead({ id: "l9", nome: "Ana Outro Grupo", corretor_id: "c1", grupo_id: "outro" }),
    ],
    visitas: [
      { id: "v5", grupo_id: G, lead_id: "l5", corretor_id: "c1", status: "marcada", inicio: SABADO_10H, fim: "2026-10-31T14:00:00.000Z", passada_em: null },
    ],
    corretor_disponibilidade: [],
    compromissos: [],
    compromisso_participantes: [],
    anotacoes: [],
    lead_interacoes: [],
  });
  repositorio.agendarVisitaLead.mockImplementation(async (leadId: string, quando: Date) => {
    const l = leadDe(leadId);
    l.visita_agendada_em = quando.toISOString();
    l.etapa = "visita_agendada";
    return true;
  });
  repositorio.cancelarVisitaLead.mockImplementation(async (leadId: string) => {
    const l = leadDe(leadId);
    const antes = l.visita_agendada_em as string;
    l.visita_agendada_em = null;
    l.etapa = "em_conversa";
    return new Date(antes);
  });
});

describe("visita: preparar resolve e propõe, sem gravar", () => {
  it("marca com lead, imóvel e data concretos; nada é gravado antes do sim", async () => {
    const ex = criarExecutor(corretor, tratadores, 1);
    expect(await ex.executar("visita", { lead: "joão p", o_que: "marcar", quando: "amanhã 14h", imovel: "Vitta" })).toMatchObject({
      proposto: true,
      resumo: "Marcar visita com João Pereira no Vitta, sábado 31/10 às 14h",
    });
    expect(ex.itensPropostos[0].dados).toEqual({ o_que: "marcar", leadId: "l1", nome: "João Pereira", quando: SABADO_14H, esperada: null });
    expect(banco.escritas).toEqual([]);
    expect(repositorio.agendarVisitaLead).not.toHaveBeenCalled();
  });

  it("horário vago pergunta a hora, nunca inventa", async () => {
    const a = { lead: "João Pereira", o_que: "marcar" };
    expect(await visita.preparar(corretor, { ...a, quando: "sexta à tarde" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "Que horas, sexta 30/10 à tarde?" },
    });
    expect(await visita.preparar(corretor, { ...a, quando: "amanhã" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "Que horas, sábado 31/10?" },
    });
    expect(await visita.preparar(corretor, { ...a, quando: "sábado às 3" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "3h da manhã ou 15h?" },
    });
    expect(await visita.preparar(corretor, a)).toMatchObject({ tipo: "resposta", resultado: { pergunta: expect.stringMatching(/Para quando/) } });
  });

  it("data no passado: pede outra", async () => {
    expect(await visita.preparar(corretor, { lead: "João Pereira", o_que: "marcar", quando: "hoje 9h" })).toEqual({
      tipo: "resposta",
      resultado: { erro: "sexta 30/10 às 9h já passou. Peça outra data." },
    });
  });

  it("horário ocupado (outra visita dele cruzando a hora): avisa com os livres", async () => {
    const r = await visita.preparar(corretor, { lead: "João Pereira", o_que: "marcar", quando: "amanhã 10h30" });
    expect(r).toMatchObject({
      tipo: "resposta",
      resultado: { erro: "Você já tem outro compromisso nesse horário.", livres: expect.any(Array) },
    });
    expect(banco.escritas).toEqual([]);
  });

  it("nome ambíguo pergunta qual", async () => {
    expect(await visita.preparar(corretor, { lead: "João", o_que: "marcar", quando: "amanhã 14h" })).toMatchObject({
      tipo: "resposta",
      resultado: { opcoes: ["João Lima", "João Pereira"] },
    });
  });

  it("remarcar e cancelar sem visita marcada: resposta; marcar com visita marcada vira remarcar", async () => {
    expect(await visita.preparar(corretor, { lead: "João Pereira", o_que: "remarcar", quando: "amanhã 14h" })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/não tem visita marcada/) },
    });
    expect(await visita.preparar(corretor, { lead: "João Pereira", o_que: "cancelar" })).toMatchObject({ tipo: "resposta" });
    expect(await visita.preparar(corretor, { lead: "Maria", o_que: "marcar", quando: "amanhã 14h" })).toMatchObject({
      tipo: "proposta",
      resumo: "Remarcar a visita de Maria Souza de sábado 31/10 às 10h para sábado 31/10 às 14h",
      dados: { o_que: "remarcar", esperada: SABADO_10H },
    });
    expect(await visita.preparar(corretor, { lead: "Maria", o_que: "cancelar" })).toMatchObject({
      tipo: "proposta",
      resumo: "Cancelar a visita de Maria Souza, sábado 31/10 às 10h",
    });
  });
});

describe("visita: escopo pela identificação", () => {
  it("corretor não alcança lead de outro corretor; gestor alcança o do grupo; outro grupo nunca", async () => {
    const a = { lead: "Ana", o_que: "marcar", quando: "amanhã 14h" };
    expect(await visita.preparar(corretor, a)).toMatchObject({ tipo: "resposta", resultado: { erro: expect.stringMatching(/Não achei/) } });
    expect(await visita.preparar(gestor, a)).toMatchObject({ tipo: "proposta", dados: { leadId: "l3" } });
    expect(await visita.preparar(gestor, { ...a, lead: "Ana Outro Grupo" })).toMatchObject({ tipo: "resposta" });
  });

  it("dados forjados com lead de outro corretor: o executar do corretor não grava", async () => {
    const r = await visita.executar(corretor, { o_que: "marcar", leadId: "l3", nome: "Ana", quando: SABADO_14H, esperada: null });
    expect(r.ok).toBe(false);
    expect(repositorio.agendarVisitaLead).not.toHaveBeenCalled();
  });
});

describe("visita: o sim executa só os dados, e o desfazer volta ao estado anterior", () => {
  it("o sim roda os dados resolvidos, não o texto do cérebro", async () => {
    const item = {
      ferramenta: "visita",
      argumentos: { lead: "Maria", o_que: "cancelar" },
      resumo: "Marcar visita com João Pereira, sábado 31/10 às 14h",
      dados: { o_que: "marcar", leadId: "l1", nome: "João Pereira", quando: SABADO_14H, esperada: null },
    };
    const r = await executarProposta(corretor, [item], tratadores);
    expect(r.resultados).toEqual([{ ok: true, texto: "Visita com João Pereira marcada para sábado 31/10 às 14h. Já está na Agenda." }]);
    expect(repositorio.agendarVisitaLead).toHaveBeenCalledWith("l1", new Date(SABADO_14H), { por: "central", corretorId: "c1" });
    expect(repositorio.cancelarVisitaLead).not.toHaveBeenCalled();
    expect(leadDe("l5").visita_agendada_em).toBe(SABADO_10H);
  });

  it("desfazer a marcação: a visita sai e a etapa volta", async () => {
    const r = await visita.executar(corretor, { o_que: "marcar", leadId: "l1", nome: "João Pereira", quando: SABADO_14H, esperada: null });
    expect(r.desfazer).toEqual({
      leadId: "l1",
      nome: "João Pereira",
      antes: { visitaEm: null, etapa: "em_conversa" },
      depois: { visitaEm: SABADO_14H, etapa: "visita_agendada" },
    });
    expect(await visita.desfazer!(corretor, r.desfazer!)).toEqual({ ok: true, texto: "A visita de João Pereira saiu da agenda." });
    expect(leadDe("l1")).toMatchObject({ visita_agendada_em: null, etapa: "em_conversa" });
  });

  it("desfazer a remarcação e o cancelamento: a visita volta para sábado 10h", async () => {
    const remarcada = await visita.executar(corretor, { o_que: "remarcar", leadId: "l5", nome: "Maria Souza", quando: SABADO_14H, esperada: SABADO_10H });
    expect(remarcada.texto).toBe("Visita com Maria Souza remarcada para sábado 31/10 às 14h. Já está na Agenda.");
    expect(await visita.desfazer!(corretor, remarcada.desfazer!)).toEqual({ ok: true, texto: "A visita de Maria Souza voltou para sábado 31/10 às 10h." });
    expect(leadDe("l5").visita_agendada_em).toBe(SABADO_10H);

    const cancelada = await visita.executar(corretor, { o_que: "cancelar", leadId: "l5", nome: "Maria Souza", esperada: SABADO_10H });
    expect(cancelada).toMatchObject({ ok: true, texto: "Visita de Maria Souza cancelada." });
    expect(leadDe("l5").visita_agendada_em).toBeNull();
    expect((await visita.desfazer!(corretor, cancelada.desfazer!)).ok).toBe(true);
    expect(leadDe("l5")).toMatchObject({ visita_agendada_em: SABADO_10H, etapa: "visita_agendada" });
  });
});

describe("agenda pessoal: bloqueio, reunião (só gestor) e anotação", () => {
  it("bloqueio do período dito, sem gravar no preparar; o sim grava; desfazer remove", async () => {
    const p = await agendaPessoal.preparar(corretor, { o_que: "bloqueio", quando: "minha tarde de segunda", texto: "médico" });
    expect(p).toEqual({
      tipo: "proposta",
      resumo: "Bloquear sua agenda segunda 02/11 das 13h às 18h (médico)",
      dados: { o_que: "bloqueio", inicio: "2026-11-02T16:00:00.000Z", fim: "2026-11-02T21:00:00.000Z", motivo: "médico" },
    });
    expect(banco.escritas).toEqual([]);

    const r = await agendaPessoal.executar(corretor, p.tipo === "proposta" ? p.dados : {});
    expect(r).toMatchObject({ ok: true, desfazer: { o_que: "bloqueio", compromissoId: expect.any(String) } });
    expect(banco.tabelas.compromissos).toEqual([expect.objectContaining({ tipo: "bloqueio", criado_por: "c1", grupo_id: G, titulo: "médico" })]);
    expect(banco.tabelas.compromisso_participantes).toEqual([expect.objectContaining({ corretor_id: "c1", grupo_id: G })]);

    expect(await agendaPessoal.desfazer!(corretor, r.desfazer!)).toEqual({ ok: true, texto: "Bloqueio desfeito: o horário voltou a ficar livre." });
    expect(banco.tabelas.compromissos[0].cancelado_em).toBeTruthy();
  });

  it("só o dia bloqueia o dia todo; bloqueio sobre visita marcada é avisado antes do sim", async () => {
    expect(await agendaPessoal.preparar(corretor, { o_que: "bloqueio", quando: "segunda" })).toMatchObject({
      resumo: "Bloquear sua agenda segunda 02/11, o dia todo",
    });
    expect(await agendaPessoal.preparar(corretor, { o_que: "bloqueio", quando: "amanhã de manhã" })).toEqual({
      tipo: "resposta",
      resultado: { erro: "Há visita marcada nesse horário (sábado 31/10 às 10h). Remarque a visita antes de bloquear." },
    });
    expect(await agendaPessoal.preparar(corretor, { o_que: "bloqueio", quando: "ontem 10h" })).toMatchObject({ tipo: "resposta" });
  });

  it("corretor pedindo reunião de equipe: recusa, no preparar e no executar", async () => {
    expect(await agendaPessoal.preparar(corretor, { o_que: "reuniao", quando: "terça 9h" })).toEqual({
      tipo: "resposta",
      resultado: { erro: "Reunião de equipe só o gestor marca. Para segurar um horário seu, peça um bloqueio." },
    });
    const dados = { o_que: "reuniao", inicio: "2026-11-03T12:00:00.000Z", fim: "2026-11-03T13:00:00.000Z", titulo: "" };
    expect((await agendaPessoal.executar(corretor, dados)).ok).toBe(false);
    expect(banco.escritas).toEqual([]);
  });

  it("gestor marca a reunião da equipe, todos são avisados; desfazer desmarca", async () => {
    expect(await agendaPessoal.preparar(gestor, { o_que: "reuniao", quando: "terça à tarde" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "Que horas, terça 03/11 à tarde?" },
    });
    const p = await agendaPessoal.preparar(gestor, { o_que: "reuniao", quando: "terça 9h", texto: "metas" });
    expect(p).toMatchObject({ tipo: "proposta", resumo: "Marcar reunião de equipe terça 03/11 das 9h às 10h (metas) e avisar a equipe" });

    const r = await agendaPessoal.executar(gestor, p.tipo === "proposta" ? p.dados : {});
    expect(r).toMatchObject({ ok: true, texto: "Reunião marcada e avisada à equipe." });
    expect(banco.tabelas.compromisso_participantes.map((x) => x.corretor_id).sort()).toEqual(["c1", "c2", "g"]);
    expect(avisos.map(([id]) => id).sort()).toEqual(["c1", "c2"]);

    expect(await agendaPessoal.desfazer!(gestor, r.desfazer!)).toEqual({ ok: true, texto: "Reunião desmarcada; a equipe foi avisada." });
    expect(banco.tabelas.compromissos[0].cancelado_em).toBeTruthy();
  });

  it("anotação pessoal: sem cliente, do próprio autor; desfazer apaga", async () => {
    const p = await agendaPessoal.preparar(corretor, { o_que: "anotacao", texto: "ligar pro cartório" });
    expect(p).toEqual({ tipo: "proposta", resumo: "Anotar: ligar pro cartório", dados: { o_que: "anotacao", texto: "ligar pro cartório" } });
    const r = await agendaPessoal.executar(corretor, { o_que: "anotacao", texto: "ligar pro cartório" });
    expect(banco.tabelas.anotacoes).toEqual([expect.objectContaining({ corretor_id: "c1", destinatario_id: "c1", lead_id: null, grupo_id: G })]);
    expect(await agendaPessoal.desfazer!(corretor, r.desfazer!)).toEqual({ ok: true, texto: "Anotação apagada." });
    expect(banco.tabelas.anotacoes).toEqual([]);
  });

  it("o desfazer de compromisso alheio não passa: bloqueio só quem criou", async () => {
    banco.tabelas.compromissos.push({ id: "k9", grupo_id: G, tipo: "bloqueio", titulo: "", criado_por: "c2", cancelado_em: null, inicio: "x", fim: "y" });
    expect(await agendaPessoal.desfazer!(corretor, { o_que: "bloqueio", compromissoId: "k9" })).toEqual({
      ok: false,
      texto: "Só quem marcou pode cancelar.",
    });
  });
});
