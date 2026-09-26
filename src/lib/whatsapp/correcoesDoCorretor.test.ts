import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escolherCorrecoes, formatarCorrecoes, type Correcao } from "./correcoesDoCorretor";

const c = (falaCliente: string, respostaCerta = "ok"): Correcao => ({ falaCliente, respostaIa: "x", respostaCerta });

describe("correções do corretor no prompt", () => {
  it("escolhe pelo assunto de agora", () => {
    const lista = [c("tem vaga para dois carros?"), c("aceita financiamento pela caixa?"), c("qual o condomínio?")];
    expect(escolherCorrecoes(lista, "e o financiamento, a caixa aceita?")[0].falaCliente).toMatch(/financiamento/);
  });
  it("sem assunto em comum, as duas mais recentes ensinam o jeito", () => {
    const lista = [c("a"), c("b"), c("c")];
    expect(escolherCorrecoes(lista, "oi")).toHaveLength(2);
  });
  it("formata com a resposta reprovada e a certa", () => {
    const t = formatarCorrecoes([{ falaCliente: "quanto custa?", respostaIa: "R$ 500 mil", respostaCerta: "Te mostro na visita" }]);
    expect(t).toContain("REPROVOU: R$ 500 mil");
    expect(t).toContain("responderia: Te mostro na visita");
    expect(formatarCorrecoes([])).toBe("");
  });
  it("a fala do cliente é lida do banco, não do navegador", () => {
    const fonte = readFileSync("src/app/corretor/(painel)/conversas/acoes.ts", "utf8");
    const corpo = fonte.slice(fonte.indexOf("export async function ensinarIA("));
    expect(corpo.slice(0, corpo.indexOf(")"))).not.toMatch(/falaCliente/);
  });
});
