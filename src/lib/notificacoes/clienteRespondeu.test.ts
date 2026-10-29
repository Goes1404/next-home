import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filtro, supabaseFalso, type Consulta, type Resposta } from "./supabaseFalso.testutil";

const notificacoes: { corretorId: string; n: { titulo: string; corpo: string; url: string; tag?: string } }[] = [];
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: (typeof notificacoes)[number]["n"]) => {
    notificacoes.push({ corretorId, n });
    return 1;
  },
}));

const { avisarClienteRespondeu } = await import("./clienteRespondeu");
const {
  CARENCIA_CLIENTE_RESPONDEU_MIN,
  carenciaDoClienteRespondeuVencida,
  deveAvisarClienteRespondeu,
  notificacaoDoClienteRespondeu,
} = await import("./regrasDoClienteRespondeu");

const AGORA = new Date("2026-10-29T13:00:00Z");

beforeEach(() => {
  notificacoes.length = 0;
});

describe("regra do cliente respondeu", () => {
  it("avisa quando a conversa está com o corretor", () => {
    for (const motivo of ["ia_desligada_na_conversa", "ia_desligada_no_numero", "dentro_do_expediente", "cota_do_grupo", "grupo_suspenso"] as const) {
      expect(deveAvisarClienteRespondeu({ motivoDoSilencio: motivo, eTeste: false, leadCriadoAgora: false })).toBe(true);
    }
  });

  it("não avisa lead de outro corretor, quem pediu para sair, nem o corretor que acabou de falar", () => {
    for (const motivo of ["lead_de_outro_corretor", "lead_pediu_para_sair", "corretor_respondendo"] as const) {
      expect(deveAvisarClienteRespondeu({ motivoDoSilencio: motivo, eTeste: false, leadCriadoAgora: false })).toBe(false);
    }
  });

  it("lead recém-nascido fica com o aviso de lead novo; conversa de teste não avisa", () => {
    expect(deveAvisarClienteRespondeu({ motivoDoSilencio: "ia_desligada_na_conversa", eTeste: false, leadCriadoAgora: true })).toBe(false);
    expect(deveAvisarClienteRespondeu({ motivoDoSilencio: "ia_desligada_na_conversa", eTeste: true, leadCriadoAgora: false })).toBe(false);
  });

  it("carência de 15 min por lead", () => {
    expect(CARENCIA_CLIENTE_RESPONDEU_MIN).toBe(15);
    expect(carenciaDoClienteRespondeuVencida(null, AGORA)).toBe(true);
    expect(carenciaDoClienteRespondeuVencida(new Date(AGORA.getTime() - 5 * 60_000), AGORA)).toBe(false);
    expect(carenciaDoClienteRespondeuVencida(new Date(AGORA.getTime() - 15 * 60_000), AGORA)).toBe(true);
  });

  it("texto: quem respondeu e o começo da mensagem; mídia vira frase", () => {
    const n = notificacaoDoClienteRespondeu({ lead: { nome: "Ana Prado", telefone: null }, texto: "Oi,   pode ser sábado?", tipo: "texto" });
    expect(n).toEqual({ titulo: "Ana Prado respondeu", corpo: "Oi, pode ser sábado?" });
    const longo = notificacaoDoClienteRespondeu({ lead: { nome: "Ana", telefone: null }, texto: "x".repeat(300), tipo: "texto" });
    expect(longo.corpo.length).toBe(140);
    expect(notificacaoDoClienteRespondeu({ lead: { nome: "Ana", telefone: null }, texto: "transcrição", tipo: "audio" }).corpo).toBe(
      "Mandou um áudio.",
    );
    expect(
      notificacaoDoClienteRespondeu({ lead: { nome: "Ana", telefone: null }, texto: "[cliente enviou uma imagem]", tipo: "imagem" }).corpo,
    ).toBe("Mandou uma foto.");
  });

  it("nome provisório do WhatsApp não aparece", () => {
    const n = notificacaoDoClienteRespondeu({ lead: { nome: "WhatsApp 7630", telefone: "5538999287630" }, texto: "oi", tipo: "texto" });
    expect(n.titulo).not.toContain("WhatsApp 7630");
  });
});

const PEDIDO = {
  leadId: "L1",
  conversaId: "conv1",
  corretorIdDoNumero: "c1",
  grupoIdDoNumero: "g1",
  texto: "Oi, ainda tem?",
  tipo: "texto",
};

function cenario(lead: Record<string, unknown> | null, claim: { data: unknown; error: { message: string } | null } = { data: [{ id: "L1" }], error: null }) {
  return supabaseFalso((c: Consulta): Resposta => {
    if (c.tabela === "leads" && c.acao === "select") return { data: lead, error: null };
    if (c.tabela === "leads" && c.acao === "update") return claim;
    return { data: null, error: null };
  });
}

const LEAD = { id: "L1", nome: "Ana Prado", telefone: null, corretor_id: "c1", grupo_id: "g1", arquivado_em: null };

describe("avisarClienteRespondeu", () => {
  it("avisa o dono, com claim de 15 min por lead e tag por lead", async () => {
    const { cliente, consultas } = cenario(LEAD);
    expect(await avisarClienteRespondeu(cliente, PEDIDO, AGORA)).toBe(true);

    const claim = consultas.find((c) => c.acao === "update")!;
    expect(claim.valores).toEqual({ aviso_cliente_respondeu_em: AGORA.toISOString() });
    expect(filtro(claim, "or")).toEqual([
      `aviso_cliente_respondeu_em.is.null,aviso_cliente_respondeu_em.lt.${new Date(AGORA.getTime() - 15 * 60_000).toISOString()}`,
    ]);
    expect(claim.filtros).toContainEqual(["eq", "corretor_id", "c1"]);
    expect(notificacoes).toEqual([
      {
        corretorId: "c1",
        n: { titulo: "Ana Prado respondeu", corpo: "Oi, ainda tem?", url: "/corretor/conversas?c=conv1", tag: "cliente-respondeu-L1" },
      },
    ]);
  });

  it("dentro da carência (claim vazio) não notifica de novo", async () => {
    const { cliente } = cenario(LEAD, { data: [], error: null });
    expect(await avisarClienteRespondeu(cliente, PEDIDO, AGORA)).toBe(false);
    expect(notificacoes).toHaveLength(0);
  });

  it("avisado há 5 min: nem tenta o claim", async () => {
    const { cliente, consultas } = cenario({ ...LEAD, aviso_cliente_respondeu_em: new Date(AGORA.getTime() - 5 * 60_000).toISOString() });
    expect(await avisarClienteRespondeu(cliente, PEDIDO, AGORA)).toBe(false);
    expect(consultas.some((c) => c.acao === "update")).toBe(false);
    expect(notificacoes).toHaveLength(0);
  });

  it("lead de outro corretor ou de outro grupo: ninguém é avisado", async () => {
    for (const lead of [{ ...LEAD, corretor_id: "c2" }, { ...LEAD, grupo_id: "g2" }, { ...LEAD, arquivado_em: "2026-10-01T00:00:00Z" }]) {
      const { cliente, consultas } = cenario(lead);
      expect(await avisarClienteRespondeu(cliente, PEDIDO, AGORA)).toBe(false);
      expect(consultas.some((c) => c.acao === "update")).toBe(false);
    }
    expect(notificacoes).toHaveLength(0);
  });

  it("sem a coluna da 0236 o claim falha e nada sai", async () => {
    const { cliente } = cenario(LEAD, { data: null, error: { message: "column leads.aviso_cliente_respondeu_em does not exist" } });
    expect(await avisarClienteRespondeu(cliente, PEDIDO, AGORA)).toBe(false);
    expect(notificacoes).toHaveLength(0);
  });
});

describe("webhook do WhatsApp chama o aviso no caminho do silêncio", () => {
  const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");
  const bloco = fonte.slice(fonte.indexOf("if (!decisaoIA.responde) {"), fonte.indexOf("Silêncio também é dado"));

  it("decide pela regra pura e envia depois da resposta", () => {
    expect(bloco).toContain("deveAvisarClienteRespondeu({");
    expect(bloco).toContain("motivoDoSilencio: decisaoIA.motivo");
    expect(bloco).toContain("leadCriadoAgora: Boolean(conversa.leadCriadoAgora)");
    expect(bloco).toMatch(/after\(\(\) => avisarClienteRespondeu\(createServiceClient\(\), avisoDaResposta\)\)/);
  });

  it("o corretor avisado é o dono do número, no grupo do número", () => {
    expect(bloco).toContain("corretorIdDoNumero: instancia.corretorId");
    expect(bloco).toContain("grupoIdDoNumero: instancia.grupoId");
  });
});
