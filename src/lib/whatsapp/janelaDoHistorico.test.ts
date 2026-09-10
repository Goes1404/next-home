import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";

/**
 * A janela que a IA lê — e por que ela precisa de guarda de código-fonte.
 *
 * `historicoRecente` vai ao banco, então não há como exercitá-la sem banco.
 * O que dá para travar é a CONSULTA: quantas falas ela pede e se a marca de
 * mensagem não gravada ocupa lugar. As duas coisas foram medidas, e as duas
 * falhariam caladas se alguém as desfizesse — a IA continuaria respondendo,
 * só com menos contexto, e a queixa voltaria como "ela não considera o
 * histórico".
 *
 * Os números: 93% das mensagens ficavam FORA da janela de 20, e a marca
 * ocupava linha sem ensinar nada (2.431 falas gravadas em branco antes da
 * 0106). Medido, a janela útil por conversa longa vai de 9,5 para ~21,8
 * falas.
 */
const FONTE = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");

/** O corpo de `historicoRecente`, recortado por função. */
function corpoDeHistoricoRecente(): string {
  const inicio = FONTE.indexOf("export async function historicoRecente(");
  expect(inicio, "historicoRecente não encontrada").toBeGreaterThan(-1);
  const fim = FONTE.indexOf("\n}", inicio);
  return FONTE.slice(inicio, fim);
}

describe("a janela do histórico", () => {
  it("pede 40 falas, não 20", () => {
    expect(corpoDeHistoricoRecente()).toMatch(/limite = 40/);
  });

  /*
   * A marca não é fala: ela existe para a TELA não parecer defeito. No
   * prompt ela gasta uma das 40 linhas para dizer "aqui havia algo que você
   * não pode ler" — e uma conversa com 53 delas ficaria quase inteira de
   * placeholder.
   */
  it("descarta a marca de mensagem não gravada na própria consulta", () => {
    const corpo = corpoDeHistoricoRecente();
    expect(corpo).toMatch(/\.neq\("conteudo", TEXTO_NAO_GUARDADO\)/);
  });

  it("a marca vem da constante, nunca de um literal copiado", () => {
    const corpo = corpoDeHistoricoRecente();
    expect(corpo).not.toContain(TEXTO_NAO_GUARDADO);
  });
});
