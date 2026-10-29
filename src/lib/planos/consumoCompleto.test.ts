import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda do livro do consumo (0233): nenhuma chamada paga de IA fica fora
 * da conta da plataforma.
 *
 * O defeito que ela impede já aconteceu: o custo em /plataforma somava só a
 * telemetria do atendimento, e o dossiê, a transcrição, as artes, a planta e
 * a importação de leads gastavam sem aparecer. Ninguém percebeu porque
 * caminho novo de IA não quebra nada quando esquece de contar.
 *
 * Duas regras, as duas lidas do código-fonte:
 *
 * 1. Quem fala DIRETO com um provedor (o endereço da API no arquivo) grava
 *    no livro (`registrarConsumoDaIa`), ou está em INDIRETOS dizendo quem
 *    grava por ele.
 * 2. Os adaptadores de texto da cascata só são chamados por `llm.ts`, que é
 *    quem grava (e onde `uso` é obrigatório no tipo).
 */

const RAIZ = process.cwd();
const ENDERECOS = [/api\.openai\.com/, /generativelanguage\.googleapis\.com/, /api\.groq\.com/, /integrate\.api\.nvidia\.com/];

/** Falam com o provedor, mas o livro é gravado por quem os chama. */
const INDIRETOS: Record<string, string> = {
  "src/lib/whatsapp/openai.ts": "adaptador da cascata: quem grava é llm.ts",
  "src/lib/whatsapp/gemini.ts": "adaptador da cascata: quem grava é llm.ts",
  "src/lib/whatsapp/groq.ts": "adaptador da cascata: quem grava é llm.ts",
  "src/lib/whatsapp/nvidia.ts": "adaptador da cascata: quem grava é llm.ts",
  "src/lib/whatsapp/groqAudio.ts": "devolve a duração; quem grava é audioTranscriber.ts",
};

const ADAPTADORES = ["chamarOpenaiJson", "chamarGeminiJson", "chamarGroqJson", "chamarNvidiaJson"];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const codigo = arquivos(join(RAIZ, "src")).map((a) => ({
  arquivo: relative(RAIZ, a).split(sep).join(posix.sep),
  texto: readFileSync(a, "utf8"),
}));

describe("livro do consumo da IA (0233)", () => {
  it("quem chama o provedor direto grava o consumo", () => {
    const falta = codigo
      .filter(({ arquivo, texto }) => ENDERECOS.some((e) => e.test(texto)) && !INDIRETOS[arquivo])
      .filter(({ texto }) => !texto.includes("registrarConsumoDaIa("))
      .map(({ arquivo }) => arquivo);
    expect(falta, "Chamada paga sem livro: grave com registrarConsumoDaIa ou declare em INDIRETOS.").toEqual([]);
  });

  it("os adaptadores da cascata só são chamados por llm.ts", () => {
    const fora = codigo
      .filter(({ arquivo }) => arquivo !== "src/lib/whatsapp/llm.ts" && !INDIRETOS[arquivo])
      .filter(({ texto }) => ADAPTADORES.some((a) => new RegExp(`(?<![\\w$])${a}\\(`).test(texto)))
      .map(({ arquivo }) => arquivo);
    expect(fora).toEqual([]);
  });

  it("INDIRETOS não tem entrada morta", () => {
    const mortos = Object.keys(INDIRETOS).filter((a) => {
      const achado = codigo.find((c) => c.arquivo === a);
      return !achado || !ENDERECOS.some((e) => e.test(achado.texto));
    });
    expect(mortos).toEqual([]);
  });
});
