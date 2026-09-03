import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas do worker e do workflow. As três regressões aqui falham CALADAS: a
 * fila continua andando e só o resultado fica errado — crédito cobrado por
 * vídeo que não saiu, ou job insistindo para sempre num host mal configurado.
 */
describe("o worker de render", () => {
  // Os imports saem antes de qualquer análise de ORDEM: eles listam os nomes
  // em ordem alfabética, que não tem nada a ver com a ordem das chamadas. A
  // primeira versão desta guarda acusou o import e reprovou código correto.
  const worker = readFileSync(join(process.cwd(), "scripts/video/worker.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?;$/gm, "");

  it("devolve travas vencidas antes de pegar job novo", () => {
    // Worker que morre no meio deixa o job em 'renderizando' para sempre. Sem
    // esta varredura no começo, a fila entope sem ninguém ver.
    const iSolta = worker.indexOf("soltarTravasVencidas(");
    const iPega = worker.indexOf("pegarProximoJob(");
    expect(iSolta).toBeGreaterThan(-1);
    expect(iSolta).toBeLessThan(iPega);
  });

  it("trata ambiente errado como falha DEFINITIVA, não como job ruim", () => {
    // `sem_ffmpeg` num host mal configurado queimaria as três tentativas do
    // job — e o crédito só voltaria na terceira.
    expect(worker).toMatch(/definitivo:\s*r\.motivo === "sem_ffmpeg"/);
  });

  it("roteiro vazio é descartado de vez, não reenfileirado", () => {
    expect(worker).toMatch(/roteiro vazio[\s\S]{0,120}definitivo: true|definitivo: true[\s\S]{0,120}roteiro vazio/);
  });

  it("toda saída de render sem sucesso chama falharJob — nada fica pendurado", () => {
    // Job que sai do laço sem concluir nem falhar fica travado até a trava
    // vencer, e o corretor vê "Montando o vídeo" por 15 minutos à toa.
    const falhas = worker.match(/await falharJob\(/g) ?? [];
    expect(falhas.length).toBeGreaterThanOrEqual(3);
  });
});

describe("o workflow de render", () => {
  const yml = readFileSync(join(process.cwd(), ".github/workflows/render-video.yml"), "utf8");

  it("instala ffmpeg com --no-install-recommends", () => {
    // Sem isso o apt tenta drivers de vídeo que não existem no runner e falha
    // com 404 — foi exatamente o que aconteceu na primeira tentativa local.
    expect(yml).toMatch(/apt-get update[\s\S]{0,80}--no-install-recommends ffmpeg/);
  });

  it("tem teto de tempo e trava de concorrência", () => {
    expect(yml).toMatch(/timeout-minutes:\s*\d+/);
    expect(yml).toMatch(/concurrency:/);
    expect(yml).toMatch(/cancel-in-progress:\s*false/);
  });

  it("não está agendado — ligar é decisão de produto, depois do portão da F0", () => {
    const linhasAtivas = yml.split("\n").filter((l) => !l.trimStart().startsWith("#"));
    expect(linhasAtivas.join("\n")).not.toMatch(/^\s*schedule:/m);
    expect(yml).toMatch(/workflow_dispatch:/);
  });
});
