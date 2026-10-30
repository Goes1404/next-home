import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * Os avisos espontâneos pelo número central (spec 4.7, Frente J).
 *
 * O portão: só com a onda 2, o central conectado, o recurso ligado na
 * imobiliária e a pessoa ativa com WhatsApp. Fora disso, NADA muda: nem uma
 * consulta a mais (produção está na onda 0). O aviso que sai pelo central
 * entra no histórico da conversa como fala do central, para a resposta da
 * pessoa ter contexto.
 */

const estado = vi.hoisted(() => ({
  onda: 2,
  central: { instanceName: "astro-central", telefone: "5511968671127", statusConexao: "conectado" } as {
    instanceName: string;
    telefone: string;
    statusConexao: string;
  } | null,
  envioOk: true,
  envios: [] as { instanceName: string; telefone: string; texto: string }[],
  leiturasDoCentral: 0,
}));

vi.mock("./ferramentas", async (original) => ({
  ...(await original<typeof import("./ferramentas")>()),
  get ONDA_ATUAL() {
    return estado.onda;
  },
}));
vi.mock("./numeroDoCentral", () => ({
  lerCentral: async () => {
    estado.leiturasDoCentral++;
    return estado.central;
  },
}));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (e: { instanceName: string; telefone: string; texto: string }) => {
    estado.envios.push(e);
    return estado.envioOk ? { enviado: true } : { enviado: false, motivo: "caiu" };
  },
}));

const { avisoPeloCentral, canalDoAviso, corretoresComAvisoPeloCentral, registrarAvisoNoHistorico } = await import("./avisos");

const AGORA = new Date("2026-10-30T11:00:00Z");
const GRUPO = "00000000-0000-0000-0000-00000000000a";
const OUTRO = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;

beforeEach(() => {
  estado.onda = 2;
  estado.central = { instanceName: "astro-central", telefone: "5511968671127", statusConexao: "conectado" };
  estado.envioOk = true;
  estado.envios.length = 0;
  estado.leiturasDoCentral = 0;
  banco = bancoFalso({
    grupos: [
      { id: GRUPO, central_whatsapp_ativo: true },
      { id: OUTRO, central_whatsapp_ativo: false },
    ],
    corretores: [
      { id: "ana", grupo_id: GRUPO, ativo: true, whatsapp: "5511990000001" },
      { id: "bia", grupo_id: OUTRO, ativo: true, whatsapp: "5511990000002" },
      { id: "caio", grupo_id: GRUPO, ativo: false, whatsapp: "5511990000003" },
      { id: "davi", grupo_id: GRUPO, ativo: true, whatsapp: null },
    ],
    central_estado: [],
  });
});

describe("canalDoAviso (a decisão)", () => {
  const ligado = { onda: 2, central: { statusConexao: "conectado" }, grupoLigado: true, pessoa: { ativo: true, whatsapp: "55119" } };

  it("onda 2, central conectado, recurso ligado e pessoa ativa: pelo central", () => {
    expect(canalDoAviso(ligado)).toBe("central");
  });

  it("qualquer condição faltando: o canal de hoje", () => {
    expect(canalDoAviso({ ...ligado, onda: 0 })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, onda: 1 })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, central: null })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, central: { statusConexao: "desconectado" } })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, grupoLigado: false })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, pessoa: { ativo: false, whatsapp: "55119" } })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, pessoa: { ativo: true, whatsapp: null } })).toBe("hoje");
    expect(canalDoAviso({ ...ligado, pessoa: null })).toBe("hoje");
  });
});

describe("avisoPeloCentral", () => {
  it("onda abaixo de 2: não lê nada e não manda (o chamador segue como hoje)", async () => {
    estado.onda = 0;
    expect(await avisoPeloCentral(banco.cliente as never, "ana", "oi", AGORA)).toBe(false);
    expect(banco.consultas).toEqual([]);
    expect(estado.leiturasDoCentral).toBe(0);
    expect(estado.envios).toEqual([]);
  });

  it("onda 2 com tudo ligado: sai pela instância do central para o WhatsApp do perfil", async () => {
    expect(await avisoPeloCentral(banco.cliente as never, "ana", "*Lead novo*\nAna chegou", AGORA)).toBe(true);
    expect(estado.envios).toEqual([{ instanceName: "astro-central", telefone: "5511990000001", texto: "*Lead novo*\nAna chegou" }]);
  });

  it("o aviso entra no histórico do central como fala do central", async () => {
    await avisoPeloCentral(banco.cliente as never, "ana", "*Visita em 1 hora*\nJoão às 9:00.", AGORA);
    const linha = banco.tabelas.central_estado.find((l) => l.corretor_id === "ana");
    expect(linha?.historico).toEqual([{ papel: "central", texto: "*Visita em 1 hora*\nJoão às 9:00.", em: AGORA.toISOString() }]);
  });

  it("central desconectado: canal de hoje, sem envio", async () => {
    estado.central = { instanceName: "astro-central", telefone: "5511968671127", statusConexao: "desconectado" };
    expect(await avisoPeloCentral(banco.cliente as never, "ana", "oi", AGORA)).toBe(false);
    expect(estado.envios).toEqual([]);
  });

  it("imobiliária com o recurso desligado: canal de hoje", async () => {
    expect(await avisoPeloCentral(banco.cliente as never, "bia", "oi", AGORA)).toBe(false);
    expect(estado.envios).toEqual([]);
  });

  it("pessoa inativa ou sem WhatsApp no perfil: canal de hoje", async () => {
    expect(await avisoPeloCentral(banco.cliente as never, "caio", "oi", AGORA)).toBe(false);
    expect(await avisoPeloCentral(banco.cliente as never, "davi", "oi", AGORA)).toBe(false);
    expect(estado.envios).toEqual([]);
  });

  it("envio que falha devolve false (o chamador manda pelo canal de hoje) e não suja o histórico", async () => {
    estado.envioOk = false;
    expect(await avisoPeloCentral(banco.cliente as never, "ana", "oi", AGORA)).toBe(false);
    expect(banco.tabelas.central_estado).toEqual([]);
  });

  it("nenhum aviso chama IA nem registra consumo", async () => {
    await avisoPeloCentral(banco.cliente as never, "ana", "oi", AGORA);
    expect(banco.consultas.map((c) => c.tabela)).not.toContain("ia_consumo");
  });
});

describe("registrarAvisoNoHistorico", () => {
  it("acrescenta à conversa que já existe, sem perder a proposta nem as falas recentes", async () => {
    const recente = { papel: "pessoa", texto: "quem ligar hoje?", em: new Date(AGORA.getTime() - 5 * 60_000).toISOString() };
    const velha = { papel: "pessoa", texto: "oi", em: new Date(AGORA.getTime() - 2 * 3_600_000).toISOString() };
    banco.tabelas.central_estado.push({
      corretor_id: "ana",
      grupo_id: GRUPO,
      historico: [velha, recente],
      proposta: { itens: [] },
      atualizado_em: "2026-10-30T10:55:00.000Z",
    });
    await registrarAvisoNoHistorico(banco.cliente as never, "ana", "Resumo do dia", AGORA);
    const linha = banco.tabelas.central_estado[0];
    // A fala de 2 h atrás sai pela janela de 30 min, a mesma da conversa.
    expect(linha.historico).toEqual([recente, { papel: "central", texto: "Resumo do dia", em: AGORA.toISOString() }]);
    expect(linha.proposta).toEqual({ itens: [] });
    expect(linha.atualizado_em).not.toBe("2026-10-30T10:55:00.000Z");
  });

  it("só grava se a conversa não mudou desde a leitura (troca condicional por atualizado_em)", async () => {
    banco.tabelas.central_estado.push({ corretor_id: "ana", historico: [], atualizado_em: "2026-10-30T10:55:00.000Z" });
    await registrarAvisoNoHistorico(banco.cliente as never, "ana", "Lembrete", AGORA);
    const update = banco.consultas.find((c) => c.tabela === "central_estado" && c.operacao === "update");
    expect(update?.filtros).toContain("eq:atualizado_em");
  });
});

describe("corretoresComAvisoPeloCentral (lista extra do resumo do dia)", () => {
  it("onda 2: pessoas ativas, com WhatsApp, dos grupos com o recurso ligado", async () => {
    expect(await corretoresComAvisoPeloCentral(banco.cliente as never)).toEqual(["ana"]);
  });

  it("onda abaixo de 2 ou central fora: lista vazia, sem consulta", async () => {
    estado.onda = 0;
    expect(await corretoresComAvisoPeloCentral(banco.cliente as never)).toEqual([]);
    expect(banco.consultas).toEqual([]);
    estado.onda = 2;
    estado.central = null;
    expect(await corretoresComAvisoPeloCentral(banco.cliente as never)).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });
});
