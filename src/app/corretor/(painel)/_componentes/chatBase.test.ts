import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte: a casca de chat não pode voltar a conhecer o
 * vocabulário de um domínio.
 *
 * A regressão falha CALADA — o Estúdio continua funcionando e só o chat novo
 * fica sem desenhar o que é dele. Mesma classe de `escalaDoPainel.test.ts`.
 *
 * Comentário que CITA um tipo não é uso dele: a guarda tira comentário antes
 * de acusar. Sétima vez que uma guarda desta base tropeçaria no próprio
 * recorte se não fizesse isso.
 */
const DIR = join(process.cwd(), "src", "app", "corretor", "(painel)", "_componentes");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("ChatBase é genérica", () => {
  const fonte = semComentarios(readFileSync(join(DIR, "ChatBase.tsx"), "utf8"));

  it("não importa nada do Estúdio", () => {
    expect(fonte).not.toContain("@/lib/estudio/contrato");
  });

  it("conhece só o vocabulário do chat: pergunta", () => {
    for (const doDominio of ["proposta", "resultado", "referencia"]) {
      expect(fonte, `ChatBase não pode conhecer "${doDominio}"`).not.toContain(`"${doDominio}"`);
    }
    expect(fonte).toContain('"pergunta"');
  });

  it("oferece os dois slots de render do domínio", () => {
    expect(fonte).toContain("renderAcima");
    expect(fonte).toContain("renderAbaixo");
  });
});

describe("ListaDeConversas não é do Estúdio", () => {
  const fonte = semComentarios(readFileSync(join(DIR, "ListaDeConversas.tsx"), "utf8"));

  it("lê o tipo mínimo de conversa, não o do Estúdio", () => {
    expect(fonte).not.toContain("@/lib/estudio/contrato");
    expect(fonte).toContain("ConversaDeChat");
  });
});
