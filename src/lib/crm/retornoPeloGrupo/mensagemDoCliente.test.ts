import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mensagensParaAvisar, textoDoAvisoDeMensagem } from "./mensagemDoCliente";

describe("aviso no grupo quando o cliente manda mensagem", () => {
  it("uma mensagem de texto", () => {
    expect(textoDoAvisoDeMensagem("Ana", ["ok, quando vão me ligar?"], false)).toBe(
      '💬 Ana mandou mensagem: "ok, quando vão me ligar?"',
    );
  });

  it("várias mensagens: uma linha por mensagem, até 5, depois o resto contado", () => {
    const texto = textoDoAvisoDeMensagem("Ana", ["oi", "tudo bem?", "e aí", "alô", "cadê", "??", "!!"], false);
    expect(texto.split("\n")).toEqual([
      "💬 Ana mandou mensagens:",
      '"oi"',
      '"tudo bem?"',
      '"e aí"',
      '"alô"',
      '"cadê"',
      "…e mais 2",
    ]);
  });

  it("áudio sem transcrição e áudio com transcrição", () => {
    expect(textoDoAvisoDeMensagem("Ana", [], true)).toBe("💬 Ana mandou um áudio");
    expect(textoDoAvisoDeMensagem("Ana", ["quero visitar amanhã"], true)).toBe(
      '💬 Ana mandou um áudio: "quero visitar amanhã"',
    );
  });

  it("cliente sem nome, quebra de linha e texto comprido", () => {
    expect(textoDoAvisoDeMensagem(null, ["oi"], false)).toBe('💬 O cliente mandou mensagem: "oi"');
    const longo = "a".repeat(400);
    const texto = textoDoAvisoDeMensagem("Ana", [`linha 1\nlinha 2`, longo], false);
    expect(texto).toContain('"linha 1 linha 2"');
    expect(texto).toContain(`"${"a".repeat(180)}…"`);
  });

  it("só segue quem tem a mensagem mais nova da rajada, e junta o que veio depois do último aviso", () => {
    const msgs = [
      { id: "m1", tipo: "texto", conteudo: "oi" },
      { id: "m2", tipo: "audio", conteudo: "" },
      { id: "m3", tipo: "texto", conteudo: "[mensagem não gravada — conversa sem atendimento liberado]" },
      { id: "m4", tipo: "texto", conteudo: "cadê?" },
    ];
    expect(mensagensParaAvisar(msgs, "m2")).toBeNull();
    expect(mensagensParaAvisar(msgs, "m4")).toEqual({ textos: ["oi", "cadê?"], teveAudio: true });
    expect(mensagensParaAvisar([], "m1")).toBeNull();
  });

  it("o webhook só agenda o aviso para lead de outro corretor, depois da resposta", () => {
    const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");
    expect(fonte).toMatch(/if \(conversa\.leadDeOutroCorretor && gravacao\.id\)/);
    expect(fonte).toMatch(/after\(\(\) =>\s*avisarMensagemDoClienteNoGrupo\(/);
    expect(fonte.indexOf("avisarMensagemDoClienteNoGrupo(")).toBeGreaterThan(fonte.indexOf("if (!gravacao.inedita)"));
  });
});
