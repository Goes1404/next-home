import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Guarda de CÓDIGO-FONTE: existe UM prompt de imagem, e ele é em português.
 *
 * Da mesma família de `escalaDoPainel`, `camadasGuardas` e
 * `gravacaoDeMensagem` — a regressão aqui falharia CALADA. Build passa, tipos
 * passam, a tela abre e a imagem chega bonita; só o provedor saberia que
 * recebeu um texto que o corretor nunca leu.
 *
 * O defeito que ela impede já aconteceu: `engenheiroDePrompt` devolvia
 * `promptEn` (o que era enviado) e `explicacaoPt` (uma paráfrase que o
 * corretor lia), e ninguém nunca leu o que de fato foi para a OpenAI.
 */

const SRC = path.join(__dirname, "..", "..");
const RAIZ = path.join(SRC, "..");

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

/**
 * Comentário não é código — tirar antes de acusar.
 *
 * Esta base já tropeçou SEIS vezes em guarda que leu o próprio comentário: a
 * de tokens de tema recortou o bloco errado por causa de um comentário 340
 * linhas acima, e a de gravação de mensagem reprovou o texto que explicava por
 * que um parâmetro não existe mais.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function culpadosDe(termo: RegExp): string[] {
  return arquivos(SRC)
    .filter((f) => !f.endsWith("semPromptEn.test.ts"))
    .filter((f) => termo.test(semComentarios(readFileSync(f, "utf8"))))
    .map((f) => path.relative(RAIZ, f));
}

describe("o prompt de imagem é um só, e é em português", () => {
  it("`promptEn` não existe em nenhum arquivo", () => {
    const culpados = culpadosDe(/promptEn/);
    expect(culpados, `ainda usam promptEn: ${culpados.join(", ")}`).toEqual([]);
  });

  it("`explicacaoPt` não existe — havia um prompt e uma paráfrase; agora há só o prompt", () => {
    const culpados = culpadosDe(/explicacaoPt/);
    expect(culpados, `ainda usam explicacaoPt: ${culpados.join(", ")}`).toEqual([]);
  });
});
