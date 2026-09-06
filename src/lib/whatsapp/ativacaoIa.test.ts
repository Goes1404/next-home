import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas de leitura de código para a ATIVAÇÃO da IA numa conversa.
 *
 * `botDeveResponder` exige TRÊS condições — bot ativo, pausa vencida e
 * conversa liberada — e este projeto já quebrou duas vezes o mesmo jeito:
 * um caminho de ativação escrevia SÓ UMA delas e o gesto virava mentira.
 * O botão do painel mexia em duas e a tela dizia "IA reativada" com o bot
 * mudo; a palavra-chave mexia só na trava e a pausa de 24h da fala anterior
 * do corretor mantinha a IA calada ("a palavra-chave não funciona como
 * ativação", relatado em 05/09/2026).
 *
 * Regra: TODO caminho que ativa a IA escreve as três colunas juntas.
 * Mesma classe de teste de `gravacaoDeMensagem.test.ts` — a regressão aqui
 * falha calada: tipos passam, a tela confirma, e o bot não responde.
 */

const REPOSITORIO = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const ACOES = readFileSync("src/app/corretor/(painel)/conversas/acoes.ts", "utf8");
const ACOES_IA = readFileSync("src/app/corretor/(painel)/conversas/acoesIA.ts", "utf8");

const TRES_CAMPOS = ["liberado_por_palavra_chave: true", "bot_ativo: true", "pausado_humano_ate: null"];

function trechoDe(fonte: string, marcador: string): string {
  const inicio = fonte.indexOf(marcador);
  expect(inicio, `não achei "${marcador}"`).toBeGreaterThan(-1);
  return fonte.slice(inicio, fonte.indexOf("\n}", inicio));
}

describe("ativar a IA escreve as TRÊS condições de botDeveResponder", () => {
  it("a palavra-chave (liberarConversaPorPalavraChave) ativa de verdade", () => {
    const fn = trechoDe(REPOSITORIO, "export async function liberarConversaPorPalavraChave");
    for (const campo of TRES_CAMPOS) expect(fn).toContain(campo);
  });

  it("o botão antigo do painel (retomarBotNaConversa) continua ativando de verdade", () => {
    const fn = trechoDe(ACOES, "export async function retomarBotNaConversa");
    for (const campo of TRES_CAMPOS) expect(fn).toContain(campo);
  });

  it("o botão 'IA assume agora' ativa de verdade", () => {
    const fn = trechoDe(ACOES_IA, "export async function assumirConversaComIA");
    for (const campo of TRES_CAMPOS) expect(fn).toContain(campo);
  });

  it("'Iniciar conversa com IA' libera pelo caminho único", () => {
    const fn = trechoDe(ACOES_IA, "export async function iniciarConversaPelaIA");
    expect(fn).toContain("liberarConversaPorPalavraChave(");
  });
});

describe("a ordem de gravação dos botões de IA é a do webhook", () => {
  /*
   * Mensagem ANTES da telemetria, vínculo DEPOIS — a FK de interacao_id
   * exige a linha de ia_interacoes já escrita, e inverter custou dois dias
   * de respostas não gravadas (25/08/2026).
   */
  it("gerarEEnviarPelaIA grava a mensagem, depois a interação, depois o vínculo", () => {
    const gravou = ACOES_IA.indexOf("await gravarMensagem({");
    const interacao = ACOES_IA.indexOf("await registrarInteracao({", gravou);
    const vinculo = ACOES_IA.indexOf("vincularInteracaoNaMensagem(", interacao);
    expect(gravou).toBeGreaterThan(-1);
    expect(interacao).toBeGreaterThan(gravou);
    expect(vinculo).toBeGreaterThan(interacao);
  });

  it("abertura por iniciativa nossa passa pela cota anti-ban", () => {
    // Todo caminho que FALA com o cliente por iniciativa nossa passa por
    // reservarCotaCampanha — a regra que campanha e follow-up já seguem.
    expect(ACOES_IA).toContain("reservarCotaCampanha(");
    expect(ACOES_IA).toContain("registrarTentativaDeContato(");
  });
});
