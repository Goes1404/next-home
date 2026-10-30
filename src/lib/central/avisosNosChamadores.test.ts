import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import { supabaseFalso, type Consulta, type Resposta } from "@/lib/notificacoes/supabaseFalso.testutil";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametros";

/**
 * Os quatro avisos do desenho (spec 4.7) passando pelo portão do central:
 * resumo do dia, lead novo, visita na próxima hora e lembrete da anotação.
 *
 * Onda abaixo de 2 (produção): mesmo canal e mesmo texto de hoje. Onda 2 com
 * o recurso ligado e o central conectado: o WhatsApp sai pelo central; a
 * notificação no celular continua igual.
 */

const estado = vi.hoisted(() => ({
  onda: 0,
  central: null as { instanceName: string; telefone: string; statusConexao: string } | null,
  envios: [] as { instanceName: string; telefone: string; texto: string }[],
  notificacoes: [] as { corretorId: string; titulo: string; corpo: string }[],
}));

vi.mock("./ferramentas", async (original) => ({
  ...(await original<typeof import("./ferramentas")>()),
  get ONDA_ATUAL() {
    return estado.onda;
  },
}));
vi.mock("./numeroDoCentral", () => ({ lerCentral: async () => estado.central }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (e: { instanceName: string; telefone: string; texto: string }) => {
    estado.envios.push(e);
    return { enviado: true };
  },
}));
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: { titulo: string; corpo: string }) => {
    estado.notificacoes.push({ corretorId, titulo: n.titulo, corpo: n.corpo });
    return 1;
  },
}));
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerMarcaDoCrm: async () => ({ nome: "Casa Teste" }) }));
vi.mock("@/lib/credito/parametros", async (original) => ({
  ...(await original<typeof import("@/lib/credito/parametros")>()),
  getParametrosCredito: async () => PARAMETROS_PADRAO,
}));

const { avisarLeadsNovos } = await import("@/lib/notificacoes/leadNovo");
const { lembrarVisitasDaProximaHora } = await import("@/lib/notificacoes/lembreteDeVisita");
const { enviarResumosDoDia } = await import("@/lib/crm/enviarResumoDoDia");
const { processarLembretesDeAnotacao } = await import("@/lib/crm/lembretesDeAnotacao");

const GRUPO = "00000000-0000-0000-0000-00000000000a";
const CENTRAL = { instanceName: "astro-central", telefone: "5511968671127", statusConexao: "conectado" };

function ligarCentral() {
  estado.onda = 2;
  estado.central = { ...CENTRAL };
}

beforeEach(() => {
  estado.onda = 0;
  estado.central = null;
  estado.envios.length = 0;
  estado.notificacoes.length = 0;
});

/** Respostas comuns do portão (corretor, grupo, histórico) para o supabase de mentira. */
function portao(c: Consulta, grupoLigado = true): Resposta | null {
  if (c.tabela === "corretores" && c.colunas === "whatsapp, ativo, grupo_id") {
    return { data: [{ whatsapp: "5511990000001", ativo: true, grupo_id: GRUPO }], error: null };
  }
  if (c.tabela === "grupos") return { data: [{ central_whatsapp_ativo: grupoLigado }], error: null };
  if (c.tabela === "central_estado") return { data: null, error: null };
  return null;
}

describe("lead novo", () => {
  const AGORA = new Date("2026-10-30T13:00:00Z");
  const lead = {
    id: "L1",
    nome: "Ana Prado",
    telefone: "5511988887777",
    origem: "site/contato",
    anuncio_origem: null,
    corretor_id: "c1",
    grupo_id: GRUPO,
  };
  const cenario = (grupoLigado = true) =>
    supabaseFalso((c) => {
      if (c.tabela === "leads" && c.acao === "select") return { data: [lead], error: null };
      if (c.tabela === "leads" && c.acao === "update") return { data: [{ id: "L1" }], error: null };
      return portao(c, grupoLigado) ?? { data: null, error: null };
    });

  it("onda abaixo de 2: só a notificação, como hoje, sem consulta a mais", async () => {
    const { cliente, consultas } = cenario();
    expect(await avisarLeadsNovos(cliente, AGORA)).toBe(1);
    expect(estado.notificacoes).toHaveLength(1);
    expect(estado.envios).toEqual([]);
    expect(consultas.map((c) => c.tabela)).toEqual(["leads", "leads"]);
  });

  it("onda 2 com o recurso ligado: notificação igual e WhatsApp pelo central, com o link da ficha", async () => {
    ligarCentral();
    const { cliente, consultas } = cenario();
    expect(await avisarLeadsNovos(cliente, AGORA)).toBe(1);
    expect(estado.notificacoes).toHaveLength(1);
    expect(estado.envios).toHaveLength(1);
    expect(estado.envios[0].instanceName).toBe("astro-central");
    expect(estado.envios[0].telefone).toBe("5511990000001");
    expect(estado.envios[0].texto).toMatch(/^\*Lead novo\*\nAna Prado chegou pelo site\./);
    expect(estado.envios[0].texto).toContain("/corretor/leads/L1");
    // O aviso vai ao histórico do central (a linha nasce com ele).
    const insercao = consultas.find((c) => c.tabela === "central_estado" && c.acao === "insert");
    expect(insercao?.valores).toMatchObject({ corretor_id: "c1", historico: [{ papel: "central", texto: estado.envios[0].texto }] });
  });

  it("onda 2 com o recurso desligado na imobiliária: como hoje", async () => {
    ligarCentral();
    const { cliente } = cenario(false);
    await avisarLeadsNovos(cliente, AGORA);
    expect(estado.notificacoes).toHaveLength(1);
    expect(estado.envios).toEqual([]);
  });
});

describe("visita na próxima hora", () => {
  const AGORA = new Date("2026-10-29T13:00:00Z");
  const visita = {
    id: "v1",
    lead_id: "L1",
    corretor_id: "c1",
    grupo_id: GRUPO,
    inicio: new Date(AGORA.getTime() + 58 * 60_000).toISOString(),
    lembrete_1h_para: null,
    lead: { nome: "João", telefone: null, arquivado_em: null, grupo_id: GRUPO },
  };
  const cenario = () =>
    supabaseFalso((c) => {
      if (c.tabela === "visitas" && c.acao === "select") return { data: [visita], error: null };
      if (c.tabela === "visitas" && c.acao === "update") return { data: [{ id: "v1" }], error: null };
      if (c.tabela === "corretores" && c.colunas === "id, antecedencia_visita_min") return { data: [], error: null };
      return portao(c) ?? { data: null, error: null };
    });

  it("onda abaixo de 2: só a notificação", async () => {
    await lembrarVisitasDaProximaHora(cenario().cliente, AGORA);
    expect(estado.notificacoes.map((n) => n.titulo)).toEqual(["Visita em 1 hora"]);
    expect(estado.envios).toEqual([]);
  });

  it("onda 2: a notificação e o WhatsApp pelo central", async () => {
    ligarCentral();
    await lembrarVisitasDaProximaHora(cenario().cliente, AGORA);
    expect(estado.notificacoes).toHaveLength(1);
    expect(estado.envios).toHaveLength(1);
    expect(estado.envios[0].instanceName).toBe("astro-central");
    expect(estado.envios[0].texto).toMatch(/^\*Visita em 1 hora\*\nJoão às 10:58\./);
  });

  it("onda 2 com o central desconectado: só a notificação", async () => {
    ligarCentral();
    estado.central = { ...CENTRAL, statusConexao: "desconectado" };
    await lembrarVisitasDaProximaHora(cenario().cliente, AGORA);
    expect(estado.notificacoes).toHaveLength(1);
    expect(estado.envios).toEqual([]);
  });
});

describe("resumo do dia", () => {
  // Quinta, 30/10/2026.
  const as = (horaSP: number, min = 0) => new Date(Date.UTC(2026, 9, 30, horaSP + 3, min));
  let banco: BancoFalso;

  const corretor = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    nome: id === "ana" ? "Ana Souza" : "Bruno Lima",
    whatsapp: id === "ana" ? "5511990000001" : "5511990000002",
    ativo: true,
    grupo_id: GRUPO,
    resumo_diario_em: null,
    resumo_hora: null,
    resumo_fim_de_semana: null,
    ...extra,
  });

  beforeEach(() => {
    banco = bancoFalso({
      // Só a Ana tem o próprio número conectado; o Bruno, não.
      corretor_whatsapp_instancias: [{ corretor_id: "ana", instance_name: "numero-da-ana", status_conexao: "conectado" }],
      corretores: [corretor("ana"), corretor("bruno")],
      grupos: [{ id: GRUPO, central_whatsapp_ativo: true }],
      leads: ["ana", "bruno"].map((dono) => ({
        id: `lead-${dono}`,
        nome: `Cliente da ${dono}`,
        telefone: "5511988887777",
        origem: "site/contato",
        anuncio_origem: null,
        corretor_id: dono,
        grupo_id: GRUPO,
        arquivado_em: null,
        created_at: new Date(as(7).getTime() - 3_600_000).toISOString(),
      })),
      central_estado: [],
    });
  });

  it("onda abaixo de 2: sai do número do próprio corretor, só para quem está conectado", async () => {
    expect(await enviarResumosDoDia(banco.cliente as never, as(8, 5))).toBe(1);
    expect(estado.envios.map((e) => e.instanceName)).toEqual(["numero-da-ana"]);
    expect(estado.envios[0].texto).toMatch(/^Bom dia, Ana! Seu dia:/);
    expect(estado.notificacoes.map((n) => n.corretorId)).toEqual(["ana"]);
    expect(banco.tabelas.central_estado).toEqual([]);
  });

  it("onda 2: sai pelo central para os dois (o Bruno sem o número conectado também) e entra no histórico", async () => {
    ligarCentral();
    expect(await enviarResumosDoDia(banco.cliente as never, as(8, 5))).toBe(2);
    expect(estado.envios.map((e) => [e.instanceName, e.telefone])).toEqual([
      ["astro-central", "5511990000001"],
      ["astro-central", "5511990000002"],
    ]);
    expect(estado.notificacoes.map((n) => n.corretorId)).toEqual(["ana", "bruno"]);
    expect(banco.tabelas.central_estado.map((l) => l.corretor_id)).toEqual(["ana", "bruno"]);
    expect((banco.tabelas.central_estado[0].historico as { papel: string }[])[0].papel).toBe("central");
  });

  it("uma vez por dia: o tique seguinte não manda de novo", async () => {
    ligarCentral();
    await enviarResumosDoDia(banco.cliente as never, as(8, 5));
    await enviarResumosDoDia(banco.cliente as never, as(8, 10));
    await enviarResumosDoDia(banco.cliente as never, as(9, 0));
    expect(estado.envios).toHaveLength(2);
  });

  it("respeita a hora escolhida por cada um, em São Paulo", async () => {
    ligarCentral();
    banco.tabelas.corretores = [corretor("ana", { resumo_hora: 10 }), corretor("bruno")];
    // 9h05 em SP (12h05 UTC): só o Bruno (padrão 8h).
    await enviarResumosDoDia(banco.cliente as never, as(9, 5));
    expect(estado.envios.map((e) => e.telefone)).toEqual(["5511990000002"]);
    // 10h05 em SP: agora a Ana.
    await enviarResumosDoDia(banco.cliente as never, as(10, 5));
    expect(estado.envios.map((e) => e.telefone)).toEqual(["5511990000002", "5511990000001"]);
  });

  it("antes da hora (7h55 em SP), ninguém recebe", async () => {
    ligarCentral();
    expect(await enviarResumosDoDia(banco.cliente as never, as(7, 55))).toBe(0);
    expect(estado.envios).toEqual([]);
  });
});

describe("lembrete da anotação", () => {
  const AGORA = new Date("2026-10-30T13:00:00Z");
  let banco: BancoFalso;

  beforeEach(() => {
    banco = bancoFalso({
      anotacoes: [
        {
          id: "n1",
          destinatario_id: "ana",
          corretor_id: "ana",
          texto: "Ligar para o João",
          lead_id: null,
          lembrete_whatsapp: true,
          lembrete_enviado_em: null,
          concluida_em: null,
          lembrete_em: new Date(AGORA.getTime() - 60_000).toISOString(),
        },
      ],
      corretor_whatsapp_instancias: [{ corretor_id: "ana", instance_name: "numero-da-ana", status_conexao: "conectado" }],
      corretores: [{ id: "ana", grupo_id: GRUPO, ativo: true, whatsapp: "5511990000001" }],
      grupos: [{ id: GRUPO, central_whatsapp_ativo: true }],
      central_estado: [],
    });
  });

  it("onda abaixo de 2: sai do número do próprio corretor, com o texto de sempre", async () => {
    await processarLembretesDeAnotacao(banco.cliente as never, AGORA);
    expect(estado.envios).toEqual([
      { instanceName: "numero-da-ana", telefone: "5511990000001", texto: "⏰ *Lembrete*\n\nLigar para o João" },
    ]);
    expect(banco.tabelas.anotacoes[0].lembrete_enviado_em).toBe(AGORA.toISOString());
  });

  it("onda 2: o mesmo texto pelo central, uma vez, e no histórico", async () => {
    ligarCentral();
    await processarLembretesDeAnotacao(banco.cliente as never, AGORA);
    await processarLembretesDeAnotacao(banco.cliente as never, AGORA);
    expect(estado.envios).toEqual([
      { instanceName: "astro-central", telefone: "5511990000001", texto: "⏰ *Lembrete*\n\nLigar para o João" },
    ]);
    expect(banco.tabelas.anotacoes[0].lembrete_erro).toBeUndefined();
    expect(banco.tabelas.central_estado[0]).toMatchObject({ corretor_id: "ana" });
  });

  it("onda 2 com o central desconectado: o número do próprio corretor", async () => {
    ligarCentral();
    estado.central = { ...CENTRAL, statusConexao: "desconectado" };
    await processarLembretesDeAnotacao(banco.cliente as never, AGORA);
    expect(estado.envios.map((e) => e.instanceName)).toEqual(["numero-da-ana"]);
  });
});
