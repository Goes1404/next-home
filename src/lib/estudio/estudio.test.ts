import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dadosDaMensagem, ehConfirmacao, tituloDaConversa } from "./contrato";

/**
 * O Estúdio em forma de chat — o que NÃO pode regredir.
 *
 * O chat é uma casca sobre o motor que já existe. O risco é a casca virar um
 * segundo motor: importar `gerarImagem` direto (contornando a cláusula
 * anti-invenção e o teto diário), inserir em `video_jobs` (contornando o
 * crédito), ou mandar texto de IA cru para a tela (o markdown e o "Excelente
 * pergunta!" que o WhatsApp já ensinou a cortar). Tudo isso falha CALADO —
 * a tela continua funcionando, só passa a gastar sem controle ou a soar robô.
 */

const ler = (rel: string) =>
  readFileSync(join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const LIB = ["src/lib/estudio/turno.ts", "src/lib/estudio/repositorio.ts", "src/lib/estudio/contrato.ts"];
const ACOES = "src/app/corretor/(painel)/estudio/acoes.ts";
const TELAS = [
  "src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx",
  "src/app/corretor/(painel)/marketing/video/ChatDeVideo.tsx",
];

describe("o chat não vira um segundo motor", () => {
  it.each([...LIB, ACOES, ...TELAS])("%s não importa gerarImagem nem toca em video_jobs", (arq) => {
    const f = ler(arq);
    expect(f).not.toMatch(/from "@\/lib\/imagens\/gerarImagem"/);
    expect(f).not.toMatch(/\.from\("video_jobs"\)/);
    expect(f).not.toMatch(/\.from\("imagens_geradas"\)/);
  });

  it("arte gasta SÓ pela rota /api/imagens/gerar, chamada da tela", () => {
    // É a rota que confere o teto, aplica a cláusula e compõe. `arte.test.ts`
    // fixa o caminho dela lendo o código; aqui se garante que o chat a usa.
    const tela = ler(TELAS[0]);
    expect(tela).toMatch(/fetch\("\/api\/imagens\/gerar"/);
    expect((tela.match(/fetch\(/g) ?? []).length).toBe(1);
    expect(tela).toMatch(/modo: "livre"/);
  });

  it("vídeo gasta SÓ por criarVideo, e uma vez", () => {
    const a = ler(ACOES);
    expect((a.match(/await criarVideo\(/g) ?? []).length).toBe(1);
    expect(a).not.toMatch(/enfileirarVideo/);
    expect(a).not.toMatch(/reservar_credito_video/);
  });

  it("confirmar vídeo exige que a proposta esteja NA conversa", () => {
    // Sem isto a tela podia mandar qualquer slug/objetivo/canal e gerar sem
    // proposta — o "só depois do OK" viraria só depois de um POST.
    const a = ler(ACOES);
    // A conferência tem de BARRAR: `if (!propostaValida) return { erro`. Só a
    // variável existir não prova nada — a primeira versão desta guarda
    // aceitou um `void propostaValida` (mordida provocada, não mordeu).
    expect(a).toMatch(/if \(!propostaValida\) return \{ erro/);
    expect(a).toMatch(/m\.dados\.slug === params\.proposta\.slug/);
    // E a conferência vem ANTES do gasto.
    expect(a.indexOf("if (!propostaValida)")).toBeLessThan(a.indexOf("await criarVideo("));
  });
});

describe("a voz da IA passa pelo saneamento da casa", () => {
  it("turno.ts usa soarHumano no texto que vai para a tela", () => {
    const t = ler(LIB[0]);
    expect(t).toMatch(/import \{ soarHumano \}/);
    expect((t.match(/soarHumano\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uma pergunta por turno, não as três do engenheiro", () => {
    const t = ler(LIB[0]);
    // A adaptação de ritmo: pega a PRÓXIMA não feita, nunca devolve a lista.
    expect(t).toMatch(/perguntas\.find\(/);
    expect(t).not.toMatch(/alternativas: perguntas/);
  });
});

describe("contrato", () => {
  it("recusa dados sem forma em vez de derrubar a conversa", () => {
    expect(dadosDaMensagem(null)).toBeNull();
    expect(dadosDaMensagem({ tipo: "pergunta", texto: "x", alternativas: ["a"] })).toBeNull();
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte" })).toBeNull();
    expect(dadosDaMensagem({ tipo: "inventado" })).toBeNull();
  });

  it("aceita o que tem forma", () => {
    expect(
      dadosDaMensagem({ tipo: "pergunta", id: "p0", texto: "Que hora do dia?", alternativas: ["Manhã", "Pôr do sol"] }),
    ).toMatchObject({ tipo: "pergunta", alternativas: ["Manhã", "Pôr do sol"] });
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte", promptEn: "a facade", qualidade: "medium" })).toMatchObject({
      modo: "arte",
      qualidade: "medium",
    });
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte", promptEn: "a", qualidade: "high" })).toMatchObject({
      qualidade: "low",
    });
  });

  it("confirmação curta é confirmação; frase de ajuste não é", () => {
    for (const s of ["ok", "Ok!", "pode gerar", "sim", "tá bom", "bora"]) expect(ehConfirmacao(s)).toBe(true);
    for (const s of ["ok mas mais claro", "tira a piscina", "quero um story"]) expect(ehConfirmacao(s)).toBe(false);
  });

  it("título corta em 48 sem quebrar palavra no meio do reticência", () => {
    expect(tituloDaConversa("")).toBe("Nova conversa");
    expect(tituloDaConversa("fachada do Eternity")).toBe("fachada do Eternity");
    const longo = tituloDaConversa("a".repeat(80));
    expect(longo.length).toBeLessThanOrEqual(48);
    expect(longo.endsWith("…")).toBe(true);
  });
});
