import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../test/bancoFalso";

/**
 * O envio do "Fale com a Astro" (29/10/2026). Porta pública: robô
 * (campo-isca, envio rápido demais) recebe "ok" sem gravar nem avisar; nada
 * grava sem consentimento nem com dado inválido; o limite por IP e por
 * WhatsApp segura a repetição; a linha tem as colunas da 0240 com origem
 * "site"; e o aviso aos administradores leva assunto e começo da mensagem,
 * nunca telefone nem e-mail.
 */

let banco: BancoFalso;
let ip: string;
let avisos: { titulo: string; corpo: string; url: string }[];

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/notificacoes/avisosDaPlataforma", () => ({
  avisarAtendimento: (n: { titulo: string; corpo: string; url: string }) => avisos.push(n),
}));

const { enviarContato } = await import("./acoes");

let proximoIp = 0;

const ENVIO = {
  nome: "Ana Paula Souza",
  email: "ana@imob.com.br",
  whatsapp: "(11) 98765-4321",
  assunto: "comercial",
  mensagem: "Olá! Tenho uma imobiliária com 6 corretores e queria entender como funciona a roleta de leads no plano.",
  consentimento: true,
  site: "",
  abertoHaMs: 60_000,
};

const chamados = () => banco.tabelas.chamados_de_suporte;

beforeEach(() => {
  ip = `198.51.100.${++proximoIp}`;
  avisos = [];
  banco = bancoFalso({ chamados_de_suporte: [] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("enviarContato", () => {
  it("grava o contato limpo com origem site e consentimento, e confirma", async () => {
    const r = await enviarContato(ENVIO);
    expect(r).toMatchObject({ ok: true, primeiroNome: "Ana", assunto: "Planos e contratação" });

    expect(chamados()).toHaveLength(1);
    const { id: _id, consentimento_em, criado_em, ...linha } = chamados()[0];
    expect(criado_em).toBe(consentimento_em);
    expect(linha).toEqual({
      origem: "site",
      assunto: "comercial",
      mensagem: ENVIO.mensagem,
      nome: "Ana Paula Souza",
      email: "ana@imob.com.br",
      whatsapp: "5511987654321",
    });
    expect(Number.isNaN(Date.parse(String(consentimento_em)))).toBe(false);
  });

  it("avisa os administradores com assunto e trecho, sem telefone, e-mail nem nome", async () => {
    await enviarContato(ENVIO);
    expect(avisos).toHaveLength(1);
    const [a] = avisos;
    expect(a.titulo).toBe("Novo contato pelo site");
    expect(a.url).toBe("/plataforma/suporte");
    expect(a.corpo.startsWith("Planos e contratação · Olá! Tenho uma imobiliária")).toBe(true);
    expect(a.corpo.length).toBeLessThanOrEqual(120);
    const texto = JSON.stringify(a);
    for (const proibido of ["98765", "4321", "ana@imob", "Ana Paula", "Souza"]) expect(texto).not.toContain(proibido);
  });

  it("robô pelo campo-isca: responde ok, não grava nem avisa", async () => {
    const r = await enviarContato({ ...ENVIO, site: "http://spam.example" });
    expect(r.ok).toBe(true);
    expect(chamados()).toHaveLength(0);
    expect(avisos).toHaveLength(0);
  });

  it("robô pelo tempo: envio antes do mínimo não grava", async () => {
    expect((await enviarContato({ ...ENVIO, abertoHaMs: 900 })).ok).toBe(true);
    expect((await enviarContato({ ...ENVIO, abertoHaMs: Number.NaN })).ok).toBe(true);
    expect(chamados()).toHaveLength(0);
    expect(avisos).toHaveLength(0);
  });

  it("sem consentimento não grava", async () => {
    const r = await enviarContato({ ...ENVIO, consentimento: false });
    expect(r).toMatchObject({ ok: false });
    expect(chamados()).toHaveLength(0);
  });

  it("dado inválido volta com o erro de cada campo e não grava", async () => {
    const r = await enviarContato({ ...ENVIO, whatsapp: "123", mensagem: "oi" });
    expect(r).toMatchObject({ ok: false, erros: { whatsapp: expect.any(String), mensagem: expect.any(String) } });
    expect(chamados()).toHaveLength(0);
  });

  it("limite por IP: o sexto envio em 10 minutos é recusado antes do banco", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await enviarContato({ ...ENVIO, whatsapp: `(11) 9${String(1000_0000 + i * 1111)}` })).ok).toBe(true);
    }
    const r = await enviarContato(ENVIO);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("Muitos envios") });
    expect(chamados()).toHaveLength(5);
  });

  it("limite por WhatsApp: o quarto contato do mesmo número em 24 h confirma sem gravar", async () => {
    for (let i = 0; i < 3; i++) {
      ip = `198.51.100.${++proximoIp}`;
      await enviarContato(ENVIO);
    }
    ip = `198.51.100.${++proximoIp}`;
    const r = await enviarContato(ENVIO);
    expect(r.ok).toBe(true);
    expect(chamados()).toHaveLength(3);
    expect(avisos).toHaveLength(3);
  });

  it("banco fora: avisa a pessoa para tentar de novo, sem lançar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    banco.cliente.from = () => {
      throw new Error("sem chave");
    };
    const r = await enviarContato(ENVIO);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("Não conseguimos") });
    expect(avisos).toHaveLength(0);
  });
});
