import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A extração roda MESMO quando a IA não responde.
 *
 * Medido em 7 dias, nas conversas de atendimento: 191 falas de cliente, 80
 * respostas da IA e **127 do corretor**. Até 11/09/2026 a extração vivia só
 * no fim do caminho de resposta, então as falas que o corretor atendeu —
 * a maioria — não geravam extração nenhuma. É por isso que a ficha estava
 * vazia (0 nome, 0 renda, 1 orçamento em 55 leads que conversaram), e não
 * por faltar código de escrita: `salvarDossie` já escrevia desde 24/08.
 *
 * A regressão aqui falha CALADA: o webhook segue respondendo 200, a
 * conversa segue funcionando, e só uma consulta no banco meses depois
 * mostraria que a ficha parou de ser preenchida de novo. Por isso esta
 * guarda lê o CÓDIGO-FONTE.
 */
const FONTE = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
  "",
);

/**
 * O corpo do helper.
 *
 * O recorte termina na função SEGUINTE, e não no primeiro `}` em coluna
 * zero — foi assim que a primeira versão desta guarda se enganou: a
 * assinatura tem um objeto de parâmetros cujo `}` fecha em coluna zero
 * (`}): Promise<...>`), então o corpo inteiro ficava de fora e as
 * asserções reprovavam código correto. Oitava vez que uma guarda desta base
 * tropeça no próprio recorte.
 */
function corpoDoHelper(): string {
  const inicio = FONTE.indexOf("async function atualizarFichaEMemoria(");
  expect(inicio, "helper não encontrado").toBeGreaterThan(-1);
  const fim = FONTE.indexOf("function segredoConfere(", inicio);
  expect(fim, "âncora de fim não encontrada").toBeGreaterThan(inicio);
  return FONTE.slice(inicio, fim);
}

describe("a extração não volta a depender de a IA ter respondido", () => {
  it("é chamada nos TRÊS caminhos: silêncio, modo e resposta", () => {
    const chamadas = FONTE.split("atualizarFichaEMemoria({").length - 1;
    expect(chamadas, "esperado uma chamada por caminho de saída").toBeGreaterThanOrEqual(3);
  });

  /*
   * O ramo do silêncio é o que mais importa: é o do corretor atendendo. Se
   * a chamada sair de lá, volta o defeito inteiro — e nada acusa.
   */
  it("o ramo do silêncio atualiza a ficha ANTES de devolver", () => {
    const inicio = FONTE.indexOf("const silencio = motivoDoSilencio(");
    expect(inicio, "ramo do silêncio não encontrado").toBeGreaterThan(-1);
    const fim = FONTE.indexOf("bot_calado_nesta_conversa", inicio);
    expect(fim).toBeGreaterThan(inicio);
    expect(FONTE.slice(inicio, fim)).toContain("atualizarFichaEMemoria({");
  });

  it("as três travas continuam sendo `devoExtrair`, não um if solto aqui", () => {
    const corpo = corpoDoHelper();
    expect(corpo).toContain("devoExtrair({");
    // A privacidade é a trava que não pode sumir: a linha é o WhatsApp
    // pessoal do corretor (0087).
    expect(corpo).toContain("conversaEhAtendimento({");
  });

  it("a memória gravada passa pela mescla, nunca pelo dossiê cru", () => {
    const corpo = corpoDoHelper();
    expect(corpo).toContain("mesclarMemoria(");
    expect(corpo).not.toMatch(/salvarMemoriaDaConversa\([^)]*dossie\.memoria/);
  });
});
