import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A barra de seleção em lote não pode esconder botão fora da tela.
 *
 * Medido em 27/08/2026 num viewport de 360px: os quatro botões somavam
 * 557px numa caixa de 352 — "Arquivar" terminava em 415px e "Enviar
 * mensagem" em 569, os dois fora de uma tela de 376. E como a barra é
 * `fixed` e não tinha rolagem nenhuma, eles não ficavam só cortados:
 * ficavam INALCANÇÁVEIS. A ação existia, aparecia pela metade e não dava
 * para tocar.
 *
 * Este teste lê o código-fonte porque a regressão é visual e calada — build
 * passa, tipos passam, a tela abre, e o defeito só aparece com o polegar num
 * celular estreito, que não é onde se desenvolve.
 */

const LISTA = readFileSync("src/app/corretor/(painel)/leads/ListaLeads.tsx", "utf8");

describe("barra de seleção em lote", () => {
  /** O trecho da barra fixa, do contêiner até o fim do grupo de botões. */
  function barraFixa(): string {
    const i = LISTA.indexOf("acima-da-nav border-linha bg-fundo/95 fixed");
    expect(i, "a barra fixa de seleção sumiu do arquivo").toBeGreaterThan(-1);
    // Sem os comentários JSX: eles EXPLICAM a decisão e citam as
    // alternativas descartadas por nome, então bateriam nas asserções
    // abaixo. O que se confere é o que o navegador recebe.
    return LISTA.slice(i, i + 1400).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  }

  it("quebra linha em vez de estourar a largura", () => {
    // `flex-wrap` é o que garante alcance: item mais estreito que o
    // contêiner nunca cai fora quando pode ir para a linha de baixo.
    expect(barraFixa()).toContain("flex-wrap");
  });

  it("o grupo de botões também quebra, não só o contêiner", () => {
    // Sem isto, os quatro botões continuam numa linha só — que é
    // exatamente o caso medido.
    const barra = barraFixa();
    const grupo = barra.slice(barra.indexOf("selecionado(s)"));
    expect(grupo).toContain("flex-wrap");
  });

  /*
   * Rolagem lateral resolveria o ALCANCE e não o resto: botão escondido
   * atrás de um gesto que ninguém adivinha é quase tão ruim quanto botão
   * cortado. Se um dia alguém trocar a quebra de linha por rolagem, que
   * seja uma decisão consciente — e não o reflexo de "é só pôr overflow".
   */
  it("não troca a quebra de linha por rolagem escondida", () => {
    expect(barraFixa()).not.toContain("overflow-x-auto");
  });
});
