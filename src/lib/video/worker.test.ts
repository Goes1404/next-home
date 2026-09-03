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

  /*
   * Esta guarda AFIRMAVA O CONTRÁRIO até 03/09/2026: que o `schedule` estava
   * desligado, porque "ligar é decisão de produto, depois do portão da F0".
   *
   * A decisão foi revista — e a guarda cumpriu o papel dela: obrigou a
   * reversão a ser explícita em vez de silenciosa. O que a mudou foi um
   * defeito medido, não conveniência: um vídeo ficou preso na fila porque
   * NADA acionava o worker (0 execuções na vida), e o sintoma foi silêncio.
   *
   * Hoje os dois gatilhos são obrigatórios e têm papéis distintos. Perder
   * qualquer um dos dois falha CALADO — a tela segue dizendo "na fila".
   */
  it("tem os DOIS gatilhos: acionamento direto e rede de segurança", () => {
    const linhasAtivas = yml
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");

    // Sem ele, `acionarRender` não tem o que acionar e o vídeo só sai na hora cheia.
    expect(linhasAtivas).toMatch(/^\s*workflow_dispatch:/m);
    // Sem ele, uma falha do acionamento deixa o vídeo preso para sempre.
    expect(linhasAtivas).toMatch(/^\s*schedule:/m);
  });

  it("o schedule é rede de segurança, não o caminho principal", () => {
    /*
     * Intervalo curto aqui é sinal de que alguém passou a CONTAR com o
     * schedule em vez do acionamento — e aí o vídeo volta a demorar minutos
     * por desenho. Minuto de hora cheia (`0 * * * *`) ou mais espaçado.
     */
    const cron = yml.match(/-\s*cron:\s*"([^"]+)"/)?.[1] ?? "";
    expect(cron).toBeTruthy();
    expect(cron.split(/\s+/)[0], `cron "${cron}" dispara mais de uma vez por hora`).toBe("0");
  });
});
