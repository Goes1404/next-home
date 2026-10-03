import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anuncioDaEtiqueta } from "./anuncioMeta";
import { reconhecerConviteDeEntrada } from "./porteiro";

/*
 * Guardas do cadastro pela palavra-chave (0146, plano de ativação de
 * 03/10/2026). Leem o código do webhook porque a regressão é calada: se a
 * palavra voltar a ser lida DEPOIS do porteiro, número novo volta a ser
 * descartado e o corretor digita para nada, com build e tipos verdes.
 */
const rota = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"), "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  "",
);

describe("a palavra-chave cadastra o lead no webhook", () => {
  it("é lida antes do porteiro", () => {
    const cadastro = rota.indexOf("cadastrarPelaPalavraChave(");
    const porteiro = rota.indexOf("obterOuCriarConversa(");
    expect(cadastro).toBeGreaterThan(0);
    expect(cadastro).toBeLessThan(porteiro);
  });

  it("lead de outro corretor encerra antes de criar conversa (regra N6)", () => {
    const desfecho = rota.indexOf('cadastro.desfecho === "lead_de_outro_corretor"');
    const registro = rota.indexOf("registrarAtivacaoEmLeadAlheio(", desfecho);
    const encerra = rota.indexOf('action: "lead_de_outro_corretor"', desfecho);
    const porteiro = rota.indexOf("obterOuCriarConversa(");
    expect(desfecho).toBeGreaterThan(0);
    expect(registro).toBeGreaterThan(desfecho);
    expect(encerra).toBeGreaterThan(registro);
    expect(encerra).toBeLessThan(porteiro);
  });

  it("só mensagem do corretor (fromMe) aciona o cadastro", () => {
    expect(rota).toMatch(/const palavraDoCorretor\s*=\s*fromMe && text/);
  });
});

describe("áudio com etiqueta de anúncio cadastra número novo (1.5)", () => {
  it("a etiqueta dentro do audioMessage é reconhecida e vira convite", () => {
    const payload = {
      data: {
        key: { id: "x", remoteJid: "5511999990000@s.whatsapp.net" },
        message: {
          audioMessage: {
            seconds: 7,
            contextInfo: { externalAdReply: { sourceType: "ad", sourceId: "1234567", title: "Apê no Tamboré" } },
          },
        },
      },
    };
    const anuncio = anuncioDaEtiqueta(payload);
    expect(anuncio?.adId).toBe("1234567");
    expect(reconhecerConviteDeEntrada({ texto: "", palavrasEntradaCliente: null, anuncio })?.via).toBe(
      "anuncio_meta",
    );
  });

  it("áudio sem etiqueta não é convite", () => {
    expect(reconhecerConviteDeEntrada({ texto: "", palavrasEntradaCliente: null, anuncio: null })).toBeNull();
  });
});
