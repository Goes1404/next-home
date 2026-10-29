import { describe, expect, it } from "vitest";
import {
  ASSUNTOS,
  ASSUNTOS_DO_PAINEL,
  ASSUNTOS_DO_SITE,
  corpoDoAviso,
  limparMensagem,
  tituloDoAvisoDoPainel,
  trechoDaMensagem,
  validarChamadoDoPainel,
  validarContato,
} from "./chamadoDeSuporte";

/**
 * As regras do chamado de suporte e do contato do site (0240, 29/10/2026):
 * as mesmas no navegador e no servidor, e iguais aos `check` da migration.
 */

const CONTATO = {
  nome: "Ana Souza",
  email: "Ana@Imob.com.br ",
  whatsapp: "(11) 98765-4321",
  assunto: "comercial",
  mensagem: "Quero saber se o plano da imobiliária serve para 3 corretores.",
};

describe("validarContato", () => {
  it("limpa e devolve o contato pronto para gravar", () => {
    const r = validarContato(CONTATO);
    expect(r).toEqual({
      ok: true,
      contato: {
        nome: "Ana Souza",
        email: "ana@imob.com.br",
        whatsapp: "5511987654321",
        assunto: "comercial",
        mensagem: CONTATO.mensagem,
      },
    });
  });

  it("recusa cada campo inválido com o erro dele", () => {
    const r = validarContato({ nome: " ", email: "ana@", whatsapp: "123", assunto: "spam", mensagem: "oi" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(["assunto", "email", "mensagem", "nome", "whatsapp"]);
  });

  it("mensagem acima de 2.000 caracteres é recusada, não cortada calada", () => {
    const r = validarContato({ ...CONTATO, mensagem: "a".repeat(2001) });
    expect(r).toMatchObject({ ok: false, erros: { mensagem: expect.stringContaining("2.000") } });
    expect(validarContato({ ...CONTATO, mensagem: "a".repeat(2000) }).ok).toBe(true);
  });

  it("o WhatsApp segue a régua do pedido de contratação (celular sem o 9 não passa)", () => {
    expect(validarContato({ ...CONTATO, whatsapp: "(11) 8765-43210" }).ok).toBe(false);
    expect(validarContato({ ...CONTATO, whatsapp: "(11) 3456-7890" }).ok).toBe(true);
  });
});

describe("validarChamadoDoPainel", () => {
  it("aceita assunto conhecido e mensagem com quebras de linha", () => {
    const r = validarChamadoDoPainel({ assunto: "problema", mensagem: "  A agenda não abre.\r\n\r\n\r\nDesde ontem.  " });
    expect(r).toEqual({ ok: true, assunto: "problema", mensagem: "A agenda não abre.\n\nDesde ontem." });
  });

  it("recusa assunto desconhecido e mensagem curta", () => {
    expect(validarChamadoDoPainel({ assunto: "x", mensagem: "ok" })).toMatchObject({
      ok: false,
      erros: { assunto: expect.any(String), mensagem: expect.any(String) },
    });
    expect(validarChamadoDoPainel({ assunto: "duvida", mensagem: null })).toMatchObject({ ok: false });
  });
});

describe("o aviso no celular", () => {
  it("o trecho tem até ~80 caracteres, corta na palavra e põe reticências", () => {
    const longa = "Bom dia, estou com uma dúvida sobre a roleta de leads que não está distribuindo para todos os corretores";
    const t = trechoDaMensagem(longa);
    expect(t.length).toBeLessThanOrEqual(81);
    expect(t.endsWith("…")).toBe(true);
    expect(longa.startsWith(t.slice(0, -1))).toBe(true);
    expect(trechoDaMensagem("curta\n\nmesmo")).toBe("curta mesmo");
  });

  it("o corpo é assunto + começo da mensagem", () => {
    expect(corpoDoAviso("financeiro", "Boleto em dobro")).toBe("Financeiro · Boleto em dobro");
  });

  it("o título do painel leva o nome da conta, ou fica genérico", () => {
    expect(tituloDoAvisoDoPainel("Imob Sol")).toBe("Suporte: Imob Sol");
    expect(tituloDoAvisoDoPainel(null)).toBe("Suporte pelo painel");
  });
});

describe("listas", () => {
  it("as duas ordens do seletor têm todos os assuntos, sem repetir", () => {
    expect([...ASSUNTOS_DO_SITE].sort()).toEqual([...ASSUNTOS].sort());
    expect([...ASSUNTOS_DO_PAINEL].sort()).toEqual([...ASSUNTOS].sort());
  });

  it("os assuntos são os do check da 0240", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/0240_chamados_de_suporte.sql", "utf8");
    for (const a of ASSUNTOS) expect(sql).toContain(`'${a}'`);
  });

  it("limparMensagem não aceita o que não é texto", () => {
    expect(limparMensagem(42)).toBe("");
  });
});
