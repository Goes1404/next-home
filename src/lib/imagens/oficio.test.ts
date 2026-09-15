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
    expect(instrucaoDoOficio("criacao", "imovel").length).toBeLessThan(1200);
    expect(instrucaoDoOficio("edicao", "imovel").length).toBeLessThan(1200);
  });
});

describe("o regime filtra o que não se aplica", () => {
  it("criação não recebe o que só vale editando foto", () => {
    expect(habilidadesDoRegime("criacao", "imovel")).not.toContain(
      "O que a foto já tem não se reinventa",
    );
  });

  it("edição não recebe a hora do dia — a luz da foto é a que existe", () => {
    expect(habilidadesDoRegime("edicao", "imovel")).not.toContain("A hora que vende");
  });

  it("os dois regimes recebem as regras de sempre", () => {
    for (const regime of ["criacao", "edicao"] as const) {
      expect(habilidadesDoRegime(regime, "imovel")).toContain("Verticais aprumadas");
      expect(habilidadesDoRegime(regime, "imovel")).toContain("Sombra e reflexo coerentes");
    }
  });

  it("nenhum regime fica sem ofício nenhum", () => {
    expect(instrucaoDoOficio("criacao", "imovel").length).toBeGreaterThan(0);
    expect(instrucaoDoOficio("edicao", "imovel").length).toBeGreaterThan(0);
  });

  it("a regra da escala humana não contraria a proibição de rosto reconhecível", () => {
    const escala = HABILIDADES.find((h) => h.chave === "escala")!;
    expect(escala.regra).toMatch(/nenhuma com rosto reconhecível/i);
  });
});

/*
 * O Estúdio deixou de assumir que todo pedido é de imóvel (11/09/2026), e o
 * ofício segue a mesma régua. Sem isto, um retrato de cachorro receberia
 * "verticais do prédio aprumadas" — instruir sobre um assunto que não está
 * ali é o mesmo defeito que `conferir` teve de desfazer.
 */
describe("o domínio filtra tanto quanto o regime", () => {
  it("pedido livre não recebe regra que fala de prédio", () => {
    const livre = instrucaoDoOficio("criacao", "livre");
    expect(livre).not.toMatch(/prédio|edifício/i);
    expect(livre).not.toContain("hora azul");
  });

  it("pedido de imóvel recebe as três que são do ofício de arquitetura", () => {
    const imovel = instrucaoDoOficio("criacao", "imovel");
    expect(imovel).toContain("aprumadas");
    expect(imovel).toContain("hora azul");
    expect(imovel).toMatch(/HDR/);
  });

  it("as regras universais valem nos dois domínios", () => {
    for (const dominio of ["imovel", "livre"] as const) {
      const rotulos = habilidadesDoRegime("criacao", dominio);
      expect(rotulos).toContain("Um assunto só");
      expect(rotulos).toContain("Sombra e reflexo coerentes");
      expect(rotulos).toContain("Respiro para o texto");
    }
  });

  it("nenhuma regra universal menciona imóvel — senão o filtro seria decorativo", () => {
    const universais = HABILIDADES.filter((h) => h.dominio === "sempre");
    for (const h of universais) {
      expect(h.regra, h.chave).not.toMatch(/prédio|edifício|imóvel|fachada|apartamento/i);
    }
  });

  it("pedido livre nunca fica sem ofício nenhum", () => {
    expect(instrucaoDoOficio("criacao", "livre").length).toBeGreaterThan(0);
    expect(instrucaoDoOficio("edicao", "livre").length).toBeGreaterThan(0);
  });
});
