import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Teste de fonte: o webhook é grande demais para subir inteiro num teste. O que
 * importa aqui é a ordem das decisões no bloco do anúncio da Meta, que protege o
 * cliente de receber duas boas-vindas (a do webhook e a da roleta).
 */
const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");

// Do bloco do impulsionamento até o aviso de lead novo (antes da roleta).
const inicio = fonte.indexOf("if (anuncioMeta && !nomeDoAnuncio) {");
const fim = fonte.indexOf("const vaiParaARoleta");
const blocoDoAnuncio = fonte.slice(inicio, fim);

describe("webhook: boas-vindas do anúncio não atropela a roleta", () => {
  it("lê o modo da roleta uma única vez, só quando o anúncio da Meta foi reconhecido", () => {
    expect(fonte).toMatch(/import \{[^}]*lerModoDaRoleta[^}]*\} from "@\/lib\/whatsapp\/roletaDosAnuncios"/);
    expect(fonte.match(/lerModoDaRoleta\(/g)).toHaveLength(1);
    expect(inicio).toBeGreaterThan(-1);
    expect(blocoDoAnuncio).toContain("lerModoDaRoleta(instancia.corretorId)");
    // a leitura vem antes de qualquer envio do bloco
    expect(blocoDoAnuncio.indexOf("lerModoDaRoleta(")).toBeLessThan(blocoDoAnuncio.indexOf("enviarMensagemWhatsapp("));
  });

  it("não manda a boas-vindas quando a roleta vai responder (modo mensagem e lead novo)", () => {
    expect(blocoDoAnuncio).toMatch(/modoDaRoleta === "mensagem" && conversa\.leadCriadoAgora/);
    const envio = blocoDoAnuncio.indexOf("enviarMensagemWhatsapp(");
    const condicao = blocoDoAnuncio.lastIndexOf("if (", envio);
    expect(blocoDoAnuncio.slice(condicao, envio)).toContain("!roletaResponde");
  });

  it("cala a IA em todo caso de anúncio, mesmo sem mandar a boas-vindas", () => {
    expect(blocoDoAnuncio).toContain("calarIaNaConversaDeCampanha(conversa.id)");
    expect(blocoDoAnuncio).toContain("iaCaladaPelaCampanha = true");
    const envio = blocoDoAnuncio.indexOf("enviarMensagemWhatsapp(");
    const calar = blocoDoAnuncio.indexOf("calarIaNaConversaDeCampanha(");
    expect(calar).toBeGreaterThan(envio);
    // a chamada que cala não está dentro do if que decide mandar a boas-vindas
    const condicao = blocoDoAnuncio.lastIndexOf("if (!roletaResponde", envio);
    const fechaDoEnvio = blocoDoAnuncio.indexOf("\n        }\n", envio);
    expect(condicao).toBeGreaterThan(-1);
    expect(calar).toBeGreaterThan(fechaDoEnvio);
  });

  it("só chama a roleta quando ela está ligada", () => {
    expect(fonte).toMatch(/const vaiParaARoleta = Boolean\(\s*anuncioMeta && !nomeDoAnuncio && conversa\.leadCriadoAgora && modoDaRoleta !== "desligada",?\s*\)/);
  });

  it("mantém o registro do lead de impulsionamento como estava", () => {
    expect(blocoDoAnuncio).toMatch(
      /registrarLeadDeImpulsionamento\(\{\s*leadId: conversa\.leadId,\s*corretorId: instancia\.corretorId,\s*anuncio: anuncioMeta,\s*\}\)/,
    );
  });

  it("passa à roleta o modo já lido e a permissão da boas-vindas (botAtivo)", () => {
    const chamada = fonte.slice(fonte.indexOf("await repassarPelaRoleta({"));
    const argumentos = chamada.slice(0, chamada.indexOf("})"));
    expect(argumentos).toContain("modo: modoDaRoleta");
    expect(argumentos).toContain("boasVindasPermitida");
    expect(fonte).toContain("const boasVindasPermitida = conversa.botAtivo;");
  });
});
