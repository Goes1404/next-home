import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import {
  afirmaAcabamento,
  catalogoTemAcabamento,
  removerAcabamentoInventado,
  blocoSemAcabamentoCadastrado,
} from "./acabamentoInventado";

const imovel = (over: Partial<Empreendimento> = {}) =>
  ({ slug: "x", nome: "X", descricao: "Apartamento no centro.", tagline: "", ...over }) as Empreendimento;

const SEM_ACABAMENTO = [imovel()];

describe("afirmaAcabamento", () => {
  /*
   * As quatro frases reais que a Sofia produziu na v33
   * (`quer-tudo-pelo-zap`, turnos 10 a 12), contra um catálogo que não tem
   * campo de acabamento nenhum.
   */
  it.each([
    "O acabamento inclui piso laminado na sala e quartos, revestimentos modernos e bancadas em granito.",
    "O revestimento inclui azulejos modernos na cozinha, garantindo praticidade e estilo.",
    "O revestimento do banheiro tem piso cerâmico de alta qualidade, pensado para conforto e durabilidade.",
    "Tem porcelanato em toda a área social.",
  ])("acusa material afirmado: %s", (frase) => {
    expect(afirmaAcabamento(frase)).toBe(true);
  });

  /*
   * O erro que este projeto já cometeu CINCO vezes: o critério reprova o
   * comportamento certo. Elogio vago não promete nada, e a frase honesta é
   * literalmente o que o bloco do prompt manda dizer.
   */
  it.each([
    "O acabamento do Vila Eco Park é moderno e bem cuidado.",
    "Esse detalhe do piso eu confirmo com a construtora e já te falo.",
    "Não tenho o material da bancada aqui, mas no decorado dá para ver de perto.",
    "O porcelanato eu prefiro confirmar antes de te afirmar.",
  ])("não acusa elogio vago nem honestidade: %s", (frase) => {
    expect(afirmaAcabamento(frase)).toBe(false);
  });
});

describe("catalogoTemAcabamento", () => {
  it("reconhece a descrição que traz material de verdade", () => {
    // Em produção, 3 dos 25 publicados mencionam — um deles com "Porcelanato".
    expect(catalogoTemAcabamento([imovel({ descricao: "Porcelanato nas áreas comuns." })])).toBe(true);
    expect(catalogoTemAcabamento(SEM_ACABAMENTO)).toBe(false);
  });
});

describe("removerAcabamentoInventado", () => {
  it("corta a frase inteira, não só a palavra", () => {
    const r = removerAcabamentoInventado(
      "O Vila Eco Park tem 38,81m². O piso da sala é laminado.",
      SEM_ACABAMENTO,
    );
    expect(r.removeu).toBe(true);
    expect(r.texto).toContain("38,81");
    expect(r.texto).not.toContain("laminado");
    // Cortar só a palavra deixaria "O piso da sala é" — cara de software quebrado.
    expect(r.texto).not.toContain("O piso da sala é");
  });

  it("resposta que era SÓ a invenção vira a frase honesta", () => {
    const r = removerAcabamentoInventado("O piso é porcelanato.", SEM_ACABAMENTO);
    expect(r.removeu).toBe(true);
    expect(r.texto).toContain("confirmo");
  });

  it("STAND-DOWN quando algum imóvel tem acabamento cadastrado", () => {
    /*
     * Havendo material verdadeiro no catálogo, não dá para atribuir a frase
     * ao imóvel certo sem adivinhar — e adivinhar apagaria informação
     * verdadeira. Mesma escolha conservadora de `removerPrazoInventado`.
     */
    const r = removerAcabamentoInventado("O piso é porcelanato.", [
      imovel({ descricao: "Porcelanato nas áreas comuns." }),
    ]);
    expect(r.removeu).toBe(false);
    expect(r.texto).toBe("O piso é porcelanato.");
  });
});

describe("blocoSemAcabamentoCadastrado", () => {
  it("diz o que PODE, não só o que não pode", () => {
    // Bloco que só proíbe empurra a IA para o silêncio.
    const b = blocoSemAcabamentoCadastrado();
    expect(b).toContain("PROIBIDO");
    expect(b).toContain("PODE dizer");
    expect(b).toContain("decorado");
  });
});
