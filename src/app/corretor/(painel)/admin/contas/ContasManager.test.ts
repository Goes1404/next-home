import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * A tela de Contas do gestor, lida como código (revisão da fase 2A).
 *
 * - `navigator.clipboard.writeText` devolve uma promessa que o navegador
 *   pode recusar: sem esperá-la, a tela dizia "Copiado!" com a área de
 *   transferência vazia (o mesmo defeito que o convite da plataforma teve).
 * - Aba aberta durante um deploy chama a action de outro build: o `catch`
 *   afirmava "confira a conexão", que é falso e manda repetir o que não
 *   resolve.
 */

const fonte = semComentarios(
  readFileSync("src/app/corretor/(painel)/admin/contas/ContasManager.tsx", "utf8"),
);

describe("tela de Contas", () => {
  it("copia pelo helper que espera o navegador, e não pela API crua", () => {
    expect(fonte).not.toMatch(/navigator\.clipboard/);
    expect(fonte).toMatch(/await copiarTexto\(/);
    // "Copiado!" só no ramo em que o helper disse que copiou.
    expect(fonte).toMatch(/copia === "copiado" \? "Copiado!"/);
  });

  it("na falha da cópia, o link fica selecionável e a tela diz como copiar", () => {
    expect(fonte).toMatch(/select-all/);
    expect(fonte).toMatch(/Não deu para copiar/);
  });

  it("falha da action separa a página velha, sem afirmar problema de conexão", () => {
    expect(fonte).toMatch(/ehActionDeOutroBuild\(/);
    expect(fonte).toMatch(/avisoDePaginaVelha\(/);
    expect(fonte).not.toMatch(/Confira a conexão|Não consegui (cadastrar|falar)/);
    // Todo catch passa pela mesma frase.
    const catches = fonte.match(/catch\s*(\([^)]*\))?\s*\{[^}]*\}/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(2);
    for (const c of catches) expect(c).toMatch(/fraseDaFalha\(/);
  });
});
