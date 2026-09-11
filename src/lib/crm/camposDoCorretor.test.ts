import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { marcarCamposDoCorretor } from "./camposDoCorretor";

describe("marcarCamposDoCorretor", () => {
  it("acrescenta sem duplicar", () => {
    expect(marcarCamposDoCorretor(["renda_mensal"], ["renda_mensal", "orcamento_max"])).toEqual([
      "orcamento_max",
      "renda_mensal",
    ]);
  });

  /*
   * A lista só CRESCE. Apagar o que digitou não devolve o campo para a IA:
   * a intenção continua sendo "eu cuido deste campo", e a IA voltar a
   * escrever ali seria a correção sendo desfeita com outra roupa.
   */
  it("nunca encolhe", () => {
    expect(marcarCamposDoCorretor(["renda_mensal"], [])).toEqual(["renda_mensal"]);
  });

  it("ignora o que não é campo protegível — jsonb não garante forma", () => {
    expect(marcarCamposDoCorretor(["etapa", 42, null, "nome"], ["telefone"])).toEqual(["nome"]);
  });

  it("aguenta jsonb torto sem explodir", () => {
    expect(marcarCamposDoCorretor(null, ["nome"])).toEqual(["nome"]);
    expect(marcarCamposDoCorretor("não é lista", ["nome"])).toEqual(["nome"]);
    expect(marcarCamposDoCorretor({ nome: true }, ["nome"])).toEqual(["nome"]);
  });
});

/**
 * Guarda de código-fonte: a marca vai no MESMO update que grava o valor.
 *
 * A regressão falha calada e desfaz o recurso inteiro: o corretor corrige a
 * renda, a marca não é gravada, e a IA sobrescreve na mensagem seguinte. Da
 * tela, isso parece "o botão de salvar não funciona".
 */
describe("salvarQualificacao marca os campos no mesmo update", () => {
  const FONTE = readFileSync("src/app/corretor/(painel)/leads/[id]/acoes.ts", "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    "",
  );

  it("o update de qualificação grava campos_do_corretor", () => {
    const inicio = FONTE.indexOf("export async function salvarQualificacao(");
    expect(inicio, "salvarQualificacao não encontrada").toBeGreaterThan(-1);
    const fim = FONTE.indexOf("export async function", inicio + 10);
    const corpo = FONTE.slice(inicio, fim > -1 ? fim : undefined);

    expect(corpo).toContain("marcarCamposDoCorretor(");
    /*
     * No MESMO update: a marca dentro do objeto que vai para `.update(`.
     *
     * O fim do recorte é procurado A PARTIR do início do update — a
     * primeira versão procurava `.eq("id", leadId)` no corpo inteiro e
     * casava no `select` que vem ANTES, devolvendo fatia vazia. Nona vez
     * que uma guarda desta base tropeça no próprio recorte.
     */
    const inicioUpdate = corpo.indexOf(".update({");
    expect(inicioUpdate, "update não encontrado").toBeGreaterThan(-1);
    const update = corpo.slice(inicioUpdate, corpo.indexOf(".eq(", inicioUpdate));
    expect(update).toContain("campos_do_corretor:");
  });
});
