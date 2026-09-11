import { describe, expect, it } from "vitest";
import { normalizarSaidaDoDossie } from "./dossierExtractor";
import { TETO_DA_MEMORIA } from "./memoriaDaConversa";

/**
 * As réguas de cada campo do dossiê — o que impede lixo de chegar à ficha.
 *
 * Até 11/09/2026 elas viviam dentro da função que faz a chamada de rede, ou
 * seja: sem um único teste. E a ficha é lida por gente — o corretor liga
 * para a pessoa chamando-a pelo nome que está ali.
 */
describe("normalizarSaidaDoDossie", () => {
  const d = (bruto: Record<string, unknown>) => normalizarSaidaDoDossie(bruto, "lead-1");

  it("o nome passa quando parece nome", () => {
    expect(d({ nomeCliente: "João" }).nomeCliente).toBe("João");
    expect(d({ nomeCliente: "Ana Paula" }).nomeCliente).toBe("Ana Paula");
  });

  /*
   * O modelo devolve frase nesse campo com frequência ("o cliente não se
   * apresentou"), e frase vira nome na ficha — o corretor abre o lead e lê
   * isso como se fosse gente.
   */
  it("frase, número e pontuação NÃO viram nome", () => {
    expect(d({ nomeCliente: "o cliente não se apresentou" }).nomeCliente).toBeNull();
    expect(d({ nomeCliente: "não informado." }).nomeCliente).toBeNull();
    expect(d({ nomeCliente: "WhatsApp 2461" }).nomeCliente).toBeNull();
    expect(d({ nomeCliente: "" }).nomeCliente).toBeNull();
  });

  it("e-mail tem de parecer e-mail", () => {
    expect(d({ email: "ana@exemplo.com" }).email).toBe("ana@exemplo.com");
    expect(d({ email: "ANA@Exemplo.COM" }).email).toBe("ana@exemplo.com");
    expect(d({ email: "não informado" }).email).toBeNull();
    expect(d({ email: "ana@exemplo" }).email).toBeNull();
  });

  it("a memória respeita o teto", () => {
    const gigante = "x".repeat(5000);
    expect(d({ memoria: gigante }).memoria!.length).toBeLessThanOrEqual(TETO_DA_MEMORIA);
  });

  it("campo ausente é null, nunca string vazia — null não apaga, vazio apaga", () => {
    const vazio = d({});
    expect(vazio.memoria).toBeNull();
    expect(vazio.nomeCliente).toBeNull();
    expect(vazio.regiaoInteresse).toBeNull();
    expect(vazio.rendaMensal).toBeNull();
  });

  it("dormitórios fora do plausível não entram", () => {
    expect(d({ dormitoriosMin: 3 }).dormitoriosMin).toBe(3);
    expect(d({ dormitoriosMin: 0 }).dormitoriosMin).toBeNull();
    expect(d({ dormitoriosMin: 40 }).dormitoriosMin).toBeNull();
    expect(d({ dormitoriosMin: "três" }).dormitoriosMin).toBeNull();
  });

  it("a temperatura é presa na faixa e o rótulo acompanha quando falta", () => {
    expect(d({ temperaturaScore: 900 }).temperaturaScore).toBe(100);
    expect(d({ temperaturaScore: -5 }).temperaturaScore).toBe(0);
    expect(d({ temperaturaScore: 80 }).temperaturaLabel).toBe("quente");
    expect(d({}).temperaturaScore).toBe(50);
  });

  it("lista que não é lista vira lista vazia", () => {
    expect(d({ exigenciasEspecificas: "andar alto" }).exigenciasEspecificas).toEqual([]);
    expect(d({ objecoesIdentificadas: ["preco"] }).objecoesIdentificadas).toEqual(["preco"]);
  });
});
