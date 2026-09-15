import { describe, expect, it } from "vitest";
import { HABILIDADES, habilidadesDoRegime, instrucaoDoOficio } from "./oficio";

describe("o ofício é específico e acionável, nunca elogio", () => {
  it("nenhuma regra é um pedido genérico de qualidade", () => {
    /*
     * "Faça uma imagem de alta qualidade" não muda pixel nenhum — o modelo já
     * está tentando. É a régua de entrada deste módulo, e ela só vale se
     * alguém a cobrar: sem este teste, a primeira regra vaga entra e as
     * outras viram paisagem em volta dela.
     */
    /*
     * A lista é de FRASES, não de radicais soltos. A primeira versão trazia
     * `top` e acusou a regra das verticais — que diz "nunca convergindo para
     * o TOPO", um substantivo concreto e exatamente o tipo de instrução que
     * este módulo existe para ter. Guarda que acusa demais manda consertar o
     * que estava certo, e esta base já perdeu tempo com isso SEIS vezes.
     */
    const vagas =
      /(alta qualidade|máxima qualidade|profissional de verdade|impressionante|incrível|caprichad[ao]|muito bonit[ao]|o melhor possível|top de linha|alto padrão de qualidade)/i;
    const acusadas = HABILIDADES.filter((h) => vagas.test(h.regra));
    expect(acusadas.map((h) => h.chave)).toEqual([]);
  });

  it("toda regra cabe em uma linha do prompt — prompt gigante dilui o assunto", () => {
    const longas = HABILIDADES.filter((h) => h.regra.length > 180);
    expect(longas.map((h) => h.chave)).toEqual([]);
  });

  it("toda habilidade nomeia o DEFEITO que evita", () => {
    for (const h of HABILIDADES) {
      expect(h.evita.length, h.chave).toBeGreaterThan(20);
    }
  });

  it("o bloco inteiro não estoura o orçamento de prompt de nenhum regime", () => {
    // Acima disso ele passa a competir com o pedido do corretor, que é o que
    // o prompt existe para carregar.
    expect(instrucaoDoOficio("criacao").length).toBeLessThan(1200);
    expect(instrucaoDoOficio("edicao").length).toBeLessThan(1200);
  });
});

describe("o regime filtra o que não se aplica", () => {
  it("criação não recebe o que só vale editando foto", () => {
    expect(habilidadesDoRegime("criacao")).not.toContain(
      "O que a foto já tem não se reinventa",
    );
  });

  it("edição não recebe a hora do dia — a luz da foto é a que existe", () => {
    expect(habilidadesDoRegime("edicao")).not.toContain("A hora que vende");
  });

  it("os dois regimes recebem as regras de sempre", () => {
    for (const regime of ["criacao", "edicao"] as const) {
      expect(habilidadesDoRegime(regime)).toContain("Verticais aprumadas");
      expect(habilidadesDoRegime(regime)).toContain("Sombra e reflexo coerentes");
    }
  });

  it("nenhum regime fica sem ofício nenhum", () => {
    expect(instrucaoDoOficio("criacao").length).toBeGreaterThan(0);
    expect(instrucaoDoOficio("edicao").length).toBeGreaterThan(0);
  });

  it("a regra da escala humana não contraria a proibição de rosto reconhecível", () => {
    const escala = HABILIDADES.find((h) => h.chave === "escala")!;
    expect(escala.regra).toMatch(/nenhuma com rosto reconhecível/i);
  });
});
