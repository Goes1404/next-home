import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O elo que faltava entre "enfileirar" e "renderizar".
 *
 * Em 03/09/2026 um vídeo pedido pelo painel nunca renderizou: o job estava lá
 * com `tentativas = 0` e o workflow tinha ZERO execuções na vida. Não havia
 * defeito no render — não havia quem o chamasse.
 *
 * Toda regressão possível aqui falha CALADA: a ação devolve `jobId`, a tela
 * diz "Na fila. O vídeo aparece aqui quando ficar pronto", e o vídeo
 * simplesmente nunca aparece. Nenhum teste de unidade comum pega isso, por
 * isso estas guardas leem o CÓDIGO-FONTE — a mesma classe de
 * `gravacaoDeMensagem` e `escalaDoPainel`.
 */

const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const ACOES = semComentario(
  readFileSync(join(process.cwd(), "src/app/corretor/(painel)/marketing/video/acoes.ts"), "utf8"),
);
const MODULO = semComentario(
  readFileSync(join(process.cwd(), "src/lib/video/acionarRender.ts"), "utf8"),
);

describe("a ação aciona o render depois de enfileirar", () => {
  it("chama acionarRender", () => {
    expect(ACOES).toMatch(/\bacionarRender\(\)/);
  });

  it("chama DEPOIS de enfileirarVideo", () => {
    // Antes do enfileiramento, o worker acordaria para uma fila onde o job
    // ainda não existe — e voltaria a dormir sem fazer nada.
    const enfileira = ACOES.indexOf("await enfileirarVideo(");
    const aciona = ACOES.indexOf("acionarRender()");
    expect(enfileira).toBeGreaterThan(-1);
    expect(aciona).toBeGreaterThan(enfileira);
  });

  it("chama SEM await — o painel não espera o GitHub", () => {
    /*
     * `await` aqui devolve a latência do GitHub para quem clicou, numa ação
     * que já é lenta (a classificação de fotos por visão roda antes). E pior:
     * uma indisponibilidade do GitHub passaria a atrasar a criação do vídeo,
     * que é justamente o que o desenho fire-and-forget evita.
     */
    expect(ACOES).not.toMatch(/await\s+acionarRender\(/);
  });

  it("só aciona quando o vídeo de fato entrou na fila", () => {
    // Depois do `if (!r.ok) return`, senão acionaria para job inexistente —
    // cujo crédito acabou de ser devolvido.
    const falha = ACOES.indexOf("if (!r.ok)");
    const aciona = ACOES.indexOf("acionarRender()");
    expect(falha).toBeGreaterThan(-1);
    expect(aciona).toBeGreaterThan(falha);
  });
});

describe("o acionamento falha FECHADO", () => {
  it("volta cedo quando falta configuração, sem lançar", () => {
    // Quem chama está no meio de criar um vídeo: derrubar a criação porque o
    // acionamento falhou trocaria um defeito por um pior.
    expect(MODULO).toMatch(/if \(!token \|\| !repo\)/);
    expect(MODULO).toMatch(/return;/);
  });

  it("não lança em nenhum caminho", () => {
    expect(MODULO).not.toMatch(/\bthrow\b/);
  });

  it("o fetch está dentro de try/catch e tem timeout", () => {
    // Sem timeout, um GitHub lento seguraria a invocação da Vercel até o teto
    // da função — pagando com a resposta do painel por um atalho opcional.
    expect(MODULO).toMatch(/catch/);
    expect(MODULO).toMatch(/AbortSignal\.timeout\(/);
  });

  it("o trabalho vai para after(), não para o caminho da resposta", () => {
    expect(MODULO).toMatch(/after\(async \(\) =>/);
    const dentro = MODULO.indexOf("after(async () =>");
    const chamada = MODULO.indexOf("fetch(");
    expect(dentro).toBeGreaterThan(-1);
    expect(chamada).toBeGreaterThan(dentro);
  });

  it("registra o corpo do erro quando o GitHub recusa", () => {
    /*
     * As três causas prováveis — token sem escopo `actions:write`,
     * `GITHUB_REPO` errado e `ref` inexistente — são indistinguíveis pelo
     * status HTTP sozinho. Sem o corpo no log, diagnosticar vira adivinhação.
     */
    expect(MODULO).toMatch(/resposta\.ok/);
    expect(MODULO).toMatch(/resposta\s*\n?\s*\.text\(\)|resposta\.text\(\)/);
  });
});
