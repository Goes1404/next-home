import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * "A IA escreve e eu mando" (06/10/2026). Guardas de leitura de código: a
 * regressão aqui é calada (a mensagem sai, a tela funciona) e o estrago é no
 * número do corretor ou no funil.
 */

const semComentarios = (arq: string) =>
  readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

const LIB = semComentarios("src/lib/whatsapp/aberturaPelaIA.ts");
const ACOES = semComentarios("src/app/corretor/(painel)/_componentes/acoesMensagemPelaIA.ts");

function corpo(fonte: string, nome: string, proximo: string) {
  const ini = fonte.indexOf(`export async function ${nome}`);
  expect(ini).toBeGreaterThan(-1);
  const fim = fonte.indexOf(proximo, ini + 10);
  return fonte.slice(ini, fim > ini ? fim : undefined);
}

describe("o rascunho não envia nada", () => {
  it("rascunharPelaIA não chama o provedor nem gasta cota", () => {
    const c = corpo(LIB, "rascunharPelaIA", "export async function enviarRascunhoDaIA");
    expect(c).not.toContain("enviarMensagemWhatsapp(");
    expect(c).not.toContain("reservarCotaCampanha(");
    expect(c).not.toContain("gravarMensagem(");
  });
});

describe("o envio passa pelas proteções", () => {
  const c = corpo(LIB, "enviarRascunhoDaIA", "async function silencioQueOGestoNaoFura");

  it("pega a trava de resposta da conversa", () => {
    expect(c).toMatch(/`resposta:\$\{[^}]+\}`/);
  });

  it("reserva a cota ANTES de enviar", () => {
    const cota = c.indexOf("reservarCotaCampanha(");
    const envio = c.indexOf("enviarMensagemWhatsapp(");
    expect(cota).toBeGreaterThan(-1);
    expect(envio).toBeGreaterThan(cota);
  });

  it("grava o envio, liga a IA e mexe no funil só depois de enviar", () => {
    const envio = c.indexOf("enviarMensagemWhatsapp(");
    for (const passo of ["gravarMensagem(", "ativarIaNaConversa(", "avancarLeadParaPrimeiroContato("]) {
      expect(c.indexOf(passo)).toBeGreaterThan(envio);
    }
  });

  it("o pedido do cliente barra mesmo com o toque do corretor", () => {
    expect(LIB).toContain("silencioDaConversa({ ...situacaoDaConversa(persistida), botAtivo: true })");
  });
});

describe("as ações do painel", () => {
  it("só o dono do lead manda, e quem pediu para sair não recebe", () => {
    expect(ACOES).toContain("lead.corretor_id !== corretor.id");
    expect(ACOES).toContain("lead.nao_contatar_em");
  });
});
