import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Erro de LEITURA nunca vira "não existe" no porteiro do webhook (19/10/2026).
 *
 * `obterOuCriarConversa` lia `{ data }` e descartava o `error`: numa piscada
 * do banco (Gateway Timeout) ou na trava de uma migration que cria policy em
 * `whatsapp_conversas` (0182/0184), a conversa existente virava `null`, a
 * busca do lead também ficava sem resposta, e o webhook devolvia 200 com
 * `numero_sem_lead_cadastrado`. O provedor não reentrega 200: a mensagem do
 * cliente sumia sem rastro. Agora a leitura repete o que é passageiro e, se
 * persistir, LANÇA — e o webhook responde 5xx para o provedor reentregar
 * (a deduplicação por `provider_message_id` já existe).
 */

type Resposta = { data: unknown; error: { code?: string; message: string } | null };

/** Respostas em ordem para a leitura de conversas; vazia, vale `padraoConversas`. */
const leiturasDeConversa: Resposta[] = [];
let padraoConversas: Resposta;
/** Respostas em ordem para a leitura do lead; vazia, vale `padraoLead`. */
const leiturasDeLead: Resposta[] = [];
let padraoLead: Resposta;
const escritas: { tabela: string; tipo: string }[] = [];

function cadeia(resolver: () => Resposta) {
  const c: Record<string, unknown> = {};
  for (const metodo of ["eq", "in", "order", "limit", "neq", "not", "is", "like"]) {
    c[metodo] = () => c;
  }
  c.maybeSingle = async () => resolver();
  c.single = async () => resolver();
  c.then = (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(resolver()).then(ok, falha);
  return c;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      select: () =>
        cadeia(() => {
          if (tabela === "whatsapp_conversas") return leiturasDeConversa.shift() ?? padraoConversas;
          if (tabela === "leads") return leiturasDeLead.shift() ?? padraoLead;
          return { data: null, error: null };
        }),
      insert: () => {
        escritas.push({ tabela, tipo: "insert" });
        return { select: () => ({ single: async () => ({ data: null, error: { message: "nao deveria" } }) }) };
      },
      update: () => {
        escritas.push({ tabela, tipo: "update" });
        return cadeia(() => ({ data: null, error: null }));
      },
      delete: () => {
        escritas.push({ tabela, tipo: "delete" });
        return cadeia(() => ({ data: null, error: null }));
      },
    }),
  }),
}));

const { obterOuCriarConversa } = await import("./repositorio");

const params = { corretorId: "corretor-1", telefoneCliente: "5511999990000" };
const piscada = { data: null, error: { message: "Gateway Timeout" } };

describe("obterOuCriarConversa: erro de leitura não é 'sem lead'", () => {
  beforeEach(() => {
    leiturasDeConversa.length = 0;
    leiturasDeLead.length = 0;
    escritas.length = 0;
    padraoConversas = { data: [], error: null };
    padraoLead = { data: null, error: null };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("repete a leitura da conversa numa piscada e devolve a existente", async () => {
    leiturasDeConversa.push(piscada);
    padraoConversas = {
      data: [{ id: "conversa-1", lead_id: "lead-1", corretor_id: "corretor-1", telefone_cliente: "5511999990000" }],
      error: null,
    };
    const conversa = await obterOuCriarConversa(params);
    expect(conversa).not.toBeNull();
    expect(conversa?.id).toBe("conversa-1");
  });

  it("leitura da conversa que continua falhando LANÇA, sem apagar nem criar nada", async () => {
    padraoConversas = piscada;
    await expect(obterOuCriarConversa(params)).rejects.toThrow(/conversa do WhatsApp/);
    expect(escritas).toEqual([]);
  });

  it("erro de consulta (com code) também lança, sem repetir", async () => {
    padraoConversas = { data: null, error: { code: "42501", message: "permission denied" } };
    await expect(obterOuCriarConversa(params)).rejects.toThrow(/permission denied/);
  });

  it("sem conversa, a leitura do lead que falha LANÇA em vez de devolver null", async () => {
    padraoLead = piscada;
    await expect(obterOuCriarConversa(params)).rejects.toThrow(/lead do WhatsApp/);
    expect(escritas).toEqual([]);
  });

  it("o erro não carrega o telefone do cliente", async () => {
    padraoConversas = piscada;
    const erro = await obterOuCriarConversa(params).catch((e: unknown) => e);
    expect(String((erro as Error).message)).not.toContain("5511999990000");
  });

  it("sem conversa e sem lead, de verdade, continua devolvendo null", async () => {
    expect(await obterOuCriarConversa(params)).toBeNull();
  });
});

/*
 * O webhook: a leitura que lança precisa virar 5xx ANTES de qualquer
 * `ignored: "numero_sem_lead_cadastrado"`. Lê o código porque o POST arrasta
 * a cadeia inteira do atendimento; a regressão seria calada (200 de novo).
 */
const rota = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"), "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  "",
);

describe("webhook: leitura que falha não vira 200 ignorado", () => {
  const chamada = rota.indexOf("await obterOuCriarConversa(");
  const ignorado = rota.indexOf('ignored: "numero_sem_lead_cadastrado"');

  it("a chamada ao porteiro é única e vem antes do 'ignorado'", () => {
    expect(rota.split("obterOuCriarConversa(").length - 1).toBe(1);
    expect(chamada).toBeGreaterThan(0);
    expect(ignorado).toBeGreaterThan(chamada);
  });

  it("a falha do porteiro é capturada e responde 503, com log sem telefone completo", () => {
    const trecho = rota.slice(chamada, ignorado);
    expect(trecho).toMatch(/catch\s*\(/);
    expect(trecho).toMatch(/console\.error\(/);
    expect(trecho).toMatch(/status:\s*503/);
    expect(trecho).not.toMatch(/console\.error\([^)]*\bsender\b(?!\.slice\(-4\))/);
    expect(trecho).not.toMatch(/console\.error\([^)]*\btext\b/);
  });

  it("a falha não é engolida com .catch(() => null)", () => {
    const trecho = rota.slice(chamada, chamada + 600);
    expect(trecho).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*null\s*\)/);
  });
});
