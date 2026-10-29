import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../test/bancoFalso";

/**
 * O envio do assistente de contratação (29/10/2026). Porta pública: o que se
 * prova é que robô (campo-isca, envio rápido demais) recebe "ok" sem gravar,
 * que nada grava sem consentimento nem com dado inválido, que o limite por
 * IP e por WhatsApp segura a repetição, que a linha gravada tem exatamente
 * as colunas da 0238, que o log não leva o dado pessoal inteiro e que o
 * aviso aos administradores sai depois da resposta, sem nome nem telefone.
 */

let banco: BancoFalso;
let ip: string;
let depois: (() => unknown)[];
let avisos: { n: { titulo: string; corpo: string; url: string } }[];

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` }),
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => depois.push(fn) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/notificacoes/push", () => ({
  notificarAdminsDaPlataforma: async (_s: unknown, n: { titulo: string; corpo: string; url: string }) => {
    avisos.push({ n });
    return 1;
  },
}));

const { enviarPedidoDeContratacao } = await import("./acoes");

let proximoIp = 0;

const ENVIO = {
  plano: "imobiliaria",
  usuarios: 4,
  nome: "Ana Paula Souza",
  whatsapp: "(11) 98765-4321",
  email: "ana@imob.com.br",
  imobiliaria: "Imob Sol",
  creci: "",
  cidade: "Barueri",
  uf: "SP",
  consentimento: true,
  site: "",
  abertoHaMs: 60_000,
};

const pedidos = () => banco.tabelas.pedidos_de_contratacao;

beforeEach(() => {
  // IP novo a cada caso: o limite em memória não vaza de um caso para outro.
  ip = `203.0.113.${++proximoIp}`;
  depois = [];
  avisos = [];
  banco = bancoFalso({
    pedidos_de_contratacao: [],
    administradores_da_plataforma: [{ user_id: "u-admin" }, { user_id: "u-admin-sem-ficha" }],
    corretores: [
      { id: "c-admin", user_id: "u-admin" },
      { id: "c-outro", user_id: "u-corretor" },
    ],
  });
});

describe("enviarPedidoDeContratacao", () => {
  it("grava o pedido limpo com as colunas da 0238 e confirma", async () => {
    const r = await enviarPedidoDeContratacao(ENVIO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.primeiroNome).toBe("Ana");
    expect(r.resumo.replace(/\s/g, " ")).toBe("Imobiliária, 4 usuários (R$ 508 por mês)");

    expect(pedidos()).toHaveLength(1);
    const { id: _id, consentimento_em, ...linha } = pedidos()[0];
    expect(linha).toEqual({
      plano: "imobiliaria",
      usuarios: 4,
      nome: "Ana Paula Souza",
      whatsapp: "5511987654321",
      email: "ana@imob.com.br",
      imobiliaria: "Imob Sol",
      creci: null,
      cidade: "Barueri",
      uf: "SP",
    });
    expect(Number.isNaN(Date.parse(String(consentimento_em)))).toBe(false);
  });

  it("robô pelo campo-isca: responde ok e não grava nada", async () => {
    const r = await enviarPedidoDeContratacao({ ...ENVIO, site: "http://spam.example" });
    expect(r.ok).toBe(true);
    expect(pedidos()).toHaveLength(0);
    expect(depois).toHaveLength(0);
  });

  it("robô pelo tempo: envio antes do mínimo com o formulário aberto não grava", async () => {
    expect((await enviarPedidoDeContratacao({ ...ENVIO, abertoHaMs: 900 })).ok).toBe(true);
    expect((await enviarPedidoDeContratacao({ ...ENVIO, abertoHaMs: Number.NaN })).ok).toBe(true);
    expect(pedidos()).toHaveLength(0);
  });

  it("sem consentimento não grava", async () => {
    const r = await enviarPedidoDeContratacao({ ...ENVIO, consentimento: false });
    expect(r).toMatchObject({ ok: false });
    expect(pedidos()).toHaveLength(0);
  });

  it("dado inválido volta com o erro de cada campo e não grava", async () => {
    const r = await enviarPedidoDeContratacao({ ...ENVIO, whatsapp: "123", imobiliaria: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros ?? {}).sort()).toEqual(["imobiliaria", "whatsapp"]);
    expect(pedidos()).toHaveLength(0);
  });

  it("limite por IP: o 6º envio em 10 minutos é recusado", async () => {
    for (let i = 0; i < 5; i++) {
      await enviarPedidoDeContratacao({ ...ENVIO, whatsapp: `(11) 9876${i}-432${i}` });
    }
    expect(pedidos()).toHaveLength(5);
    const r = await enviarPedidoDeContratacao({ ...ENVIO, whatsapp: "(21) 99876-5432" });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("Muitos envios") });
    expect(pedidos()).toHaveLength(5);
  });

  it("limite por WhatsApp: o mesmo número em 24 h confirma de novo sem gravar outra linha", async () => {
    await enviarPedidoDeContratacao(ENVIO);
    // `criado_em` é o default do banco; o banco falso não preenche.
    pedidos()[0].criado_em = new Date().toISOString();
    ip = "198.51.100.7";
    const r = await enviarPedidoDeContratacao({ ...ENVIO, whatsapp: "+55 11 98765-4321" });
    expect(r.ok).toBe(true);
    expect(pedidos()).toHaveLength(1);
  });

  it("pedido do mesmo número de mais de 24 h atrás não segura o novo", async () => {
    banco.tabelas.pedidos_de_contratacao.push({
      id: "antigo",
      whatsapp: "5511987654321",
      criado_em: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    expect((await enviarPedidoDeContratacao(ENVIO)).ok).toBe(true);
    expect(pedidos()).toHaveLength(2);
  });

  it("falha do banco no insert vira erro para a pessoa, e o log não leva o número inteiro", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = banco.cliente.from;
    banco.cliente.from = ((tabela: string) => {
      const q = original(tabela);
      if (tabela === "pedidos_de_contratacao") {
        const inserir = q.insert;
        q.insert = (v: unknown) => {
          inserir(v);
          return { then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "falhou" } }).then(ok) } as never;
        };
      }
      return q;
    }) as typeof banco.cliente.from;
    const r = await enviarPedidoDeContratacao(ENVIO);
    expect(r.ok).toBe(false);
    const escrito = log.mock.calls.flat().join(" ");
    expect(escrito).toContain("55119****4321");
    expect(escrito).not.toContain("5511987654321");
    expect(escrito).not.toContain("Ana");
    log.mockRestore();
  });

  it("avisa depois da resposta os administradores da plataforma, sem nome nem telefone", async () => {
    await enviarPedidoDeContratacao(ENVIO);
    expect(avisos).toHaveLength(0);
    expect(depois).toHaveLength(1);
    await depois[0]();
    expect(avisos).toHaveLength(1);
    const { n } = avisos[0];
    expect(n.url).toBe("/plataforma/pedidos");
    expect(n.corpo).toContain("Barueri/SP");
    expect(n.corpo).not.toContain("Ana");
    expect(n.corpo).not.toContain("98765");
  });

  it("sem o WhatsApp da Astro configurado, a confirmação vem sem o botão", async () => {
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_DA_ASTRO", "");
    const sem = await enviarPedidoDeContratacao(ENVIO);
    expect(sem.ok && sem.whatsappDaAstro).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_DA_ASTRO", "5511900001111");
    ip = "198.51.100.9";
    const com = await enviarPedidoDeContratacao({ ...ENVIO, whatsapp: "(11) 97777-6666" });
    expect(com.ok && com.whatsappDaAstro).toMatch(/^https:\/\/wa\.me\/5511900001111\?text=/);
    expect(com.ok && decodeURIComponent(com.whatsappDaAstro!.split("text=")[1])).toContain("Imob Sol");
    vi.unstubAllEnvs();
  });
});
