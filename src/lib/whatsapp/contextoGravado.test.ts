import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte, da família de `gravacaoDeMensagem.test.ts`.
 *
 * A regressão aqui falha CALADA: build verde, tela funcionando, cliente
 * respondido — e a coluna `contexto` eternamente nula, com o "por quê?" da
 * tela dizendo "não registrado" para sempre. Nenhum tipo pega isso, porque o
 * campo é opcional, e precisa ser: playground, eval e consultor não têm
 * conversa real para descrever.
 *
 * É o mesmo padrão que esta base já viu quatro vezes — caminho no ar,
 * produzindo zero linhas, e ninguém olhando o `count(*)`.
 *
 * O recorte é POR CHAMADA, não pelo arquivo inteiro. A guarda irmã comparava
 * o `lastIndexOf` de um símbolo com o `indexOf` de outro e passou a reprovar
 * código correto no dia em que o arquivo ganhou um SEGUNDO caminho de envio:
 * ela pareava a telemetria de um com o vínculo do outro.
 */

/** Cada chamada de `registrarInteracao` que responde um cliente de verdade. */
const CHAMADAS = [
  {
    arquivo: "src/app/api/webhooks/whatsapp/route.ts",
    ancora: "modelo: respostaIA.meta.modelo,",
    o_que: "a resposta ao cliente no webhook",
  },
  {
    arquivo: "src/app/api/cron/followups/route.ts",
    // `responderAtrasada`: a varredura de quem ficou no vácuo (03/09).
    ancora: "modelo: turno.resposta.meta.modelo,",
    o_que: "a resposta atrasada",
  },
  {
    arquivo: "src/app/api/cron/followups/route.ts",
    // `processarFollowup`: o reengajamento agendado.
    ancora: "anexosBloqueados: turno.bloqueios,",
    o_que: "o follow-up",
  },
];

/** O corpo da chamada de `registrarInteracao` que contém a âncora. */
function chamadaComAncora(codigo: string, ancora: string): string {
  /*
   * A âncora tem de ser ÚNICA no arquivo. A primeira versão desta guarda usou
   * `temperaturaScore: dossie.temperaturaScore`, que aparece duas vezes no
   * webhook — a outra é o aviso ao corretor — e o recorte pegou a chamada
   * errada, reprovando código correto. Âncora ambígua é como uma guarda de
   * código-fonte tropeça no próprio recorte, e nesta base isso já aconteceu
   * seis vezes.
   */
  const ocorrencias = codigo.split(ancora).length - 1;
  expect(ocorrencias, `âncora ambígua ou ausente: ${ancora}`).toBe(1);

  const posicao = codigo.indexOf(ancora);

  const inicio = codigo.lastIndexOf("registrarInteracao({", posicao);
  expect(inicio, `âncora fora de uma chamada de registrarInteracao: ${ancora}`).toBeGreaterThan(-1);

  const fim = codigo.indexOf("});", posicao);
  return codigo.slice(inicio, fim);
}

function fonte(arquivo: string): string {
  return readFileSync(join(process.cwd(), arquivo), "utf8");
}

describe("o contexto da IA é gravado em todo caminho que responde cliente", () => {
  for (const { arquivo, ancora, o_que } of CHAMADAS) {
    it(`${o_que} (${arquivo}) passa contexto para registrarInteracao`, () => {
      const chamada = chamadaComAncora(fonte(arquivo), ancora);
      expect(chamada).toMatch(/contexto:\s*montarContextoDaInteracao\(/);
    });
  }

  /*
   * O webhook tem DOIS dossiês em escopo: o `dossieAnterior`, que foi ao
   * prompt, e o `dossie` reextraído DEPOIS da resposta. Gravar o segundo
   * faria a tela explicar a decisão com informação que a IA não tinha — e o
   * erro seria invisível, porque os dois campos têm a mesma forma.
   */
  it("o webhook grava o dossiê ANTERIOR, não o reextraído depois da resposta", () => {
    const chamada = chamadaComAncora(fonte(CHAMADAS[0].arquivo), CHAMADAS[0].ancora);
    expect(chamada).toMatch(/dossie:\s*dossieAnterior,/);
  });

  /*
   * A jogada tem de vir do TURNO, que é onde ela foi calculada. Chamar
   * `planejarJogada` de novo do lado de fora daria uma segunda conta da mesma
   * decisão, e duas contas divergem — foi assim que `montarResumo` custou uma
   * sessão a este projeto.
   */
  it("a jogada vem do turno, nunca de um planejarJogada chamado de novo", () => {
    for (const { arquivo } of CHAMADAS) {
      const codigo = fonte(arquivo).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(codigo).not.toMatch(/planejarJogada\(/);
    }
  });
});
