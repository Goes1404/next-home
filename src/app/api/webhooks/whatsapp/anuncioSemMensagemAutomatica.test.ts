import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Teste de fonte: o webhook é grande demais para subir inteiro num teste. O que
 * importa aqui é o bloco do anúncio da Meta: o lead do impulsionamento do
 * próprio corretor não recebe NADA automático (nem a boas-vindas fixa, tirada a
 * pedido do dono em 27/10/2026) e a IA fica desligada na conversa.
 */
const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");

// Do bloco do impulsionamento até o aviso de lead novo (antes da roleta).
const inicio = fonte.indexOf("if (anuncioMeta && !nomeDoAnuncio) {");
const fim = fonte.indexOf("const vaiParaARoleta");
const blocoDoAnuncio = fonte.slice(inicio, fim);

describe("webhook: lead de anúncio da Meta não recebe mensagem automática", () => {
  it("lê o modo da roleta uma única vez, só quando o anúncio da Meta foi reconhecido", () => {
    expect(fonte).toMatch(/import \{[^}]*lerModoDaRoleta[^}]*\} from "@\/lib\/whatsapp\/roletaDosAnuncios"/);
    expect(fonte.match(/lerModoDaRoleta\(/g)).toHaveLength(1);
    expect(inicio).toBeGreaterThan(-1);
    expect(blocoDoAnuncio).toContain("lerModoDaRoleta(instancia.corretorId)");
  });

  it("o bloco do anúncio não envia nada ao cliente", () => {
    expect(blocoDoAnuncio).not.toContain("enviarMensagemWhatsapp(");
    expect(blocoDoAnuncio).not.toContain("gravarMensagem(");
    expect(fonte).not.toContain("BOAS_VINDAS_DE_CAMPANHA");
  });

  it("cala a IA em todo caso de anúncio", () => {
    expect(blocoDoAnuncio).toContain("calarIaNaConversaDeCampanha(conversa.id)");
    expect(blocoDoAnuncio).toContain("iaCaladaPelaCampanha = true");
  });

  it("só chama a roleta quando ela está ligada", () => {
    expect(fonte).toMatch(/const vaiParaARoleta = Boolean\(\s*anuncioMeta && !nomeDoAnuncio && conversa\.leadCriadoAgora && modoDaRoleta !== "desligada",?\s*\)/);
  });

  it("mantém o registro do lead de impulsionamento como estava", () => {
    expect(blocoDoAnuncio).toMatch(
      /registrarLeadDeImpulsionamento\(\{\s*leadId: conversa\.leadId,\s*corretorId: instancia\.corretorId,\s*anuncio: anuncioMeta,\s*\}\)/,
    );
  });

  it("passa à roleta o modo já lido", () => {
    const chamada = fonte.slice(fonte.indexOf("await repassarPelaRoleta({"));
    const argumentos = chamada.slice(0, chamada.indexOf("})"));
    expect(argumentos).toContain("modo: modoDaRoleta");
    expect(argumentos).not.toContain("boasVindasPermitida");
  });
});
