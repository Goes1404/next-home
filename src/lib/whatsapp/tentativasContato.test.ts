import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas de leitura de código para o contador de tentativas de contato (0060).
 *
 * O que este teste protege não é o resultado de uma função — é QUAIS
 * caminhos chamam o contador. A regressão aqui é calada: o sistema segue
 * mandando mensagem, a tela segue abrindo, e só o número da ficha fica
 * errado. Mesma classe de `etapaAutomatica.test.ts` e `escalaDoPainel.test.ts`.
 */

const DISPARADOR = readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8");
const FOLLOWUPS = readFileSync("src/app/api/cron/followups/route.ts", "utf8");
const LIVE_CHAT = readFileSync("src/app/corretor/(painel)/conversas/acoes.ts", "utf8");
const WEBHOOK = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const REPOSITORIO = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");

describe("o que conta como tentativa: iniciativa NOSSA", () => {
  it("disparo de campanha conta", () => {
    expect(DISPARADOR).toContain("registrarTentativaDeContato(");
  });

  it("follow-up automático conta — é o segundo e o terceiro toque", () => {
    expect(FOLLOWUPS).toContain("registrarTentativaDeContato(");
  });

  it("mensagem que o corretor manda pelo Live Chat conta", () => {
    expect(LIVE_CHAT).toContain("registrarTentativaDeContato(");
  });

  it("o disparo só conta DEPOIS de gravar o envio como bem-sucedido", () => {
    const chamada = DISPARADOR.indexOf("registrarTentativaDeContato(");
    const contexto = DISPARADOR.slice(chamada - 3200, chamada);
    // Mensagem que não saiu não é tentativa de falar com ninguém.
    expect(contexto).toContain('status: "enviado"');
  });
});

describe("o que NÃO conta", () => {
  /*
   * A resposta da IA a quem escreveu não é tentativa de contato: quem puxou
   * conversa foi o cliente. Contá-la faria a conversa mais engajada parecer
   * a mais insistente — e é justamente o contrário.
   */
  it("a resposta da IA no webhook não incrementa o contador", () => {
    expect(WEBHOOK).not.toContain("registrarTentativaDeContato");
  });

  it("mas a fala do cliente ZERA a contagem de insistência", () => {
    expect(WEBHOOK).toContain("registrarRespostaDoLead(");
  });
});

describe("o incremento é do banco, não da aplicação", () => {
  /*
   * Ler-somar-gravar perde contagem quando duas mensagens saem no mesmo
   * instante — e é exatamente o que acontece com cron, corrente de disparo
   * e botão do painel tocando a mesma fila. Mesma razão das funções de cota.
   */
  it("usa a função atômica do Postgres", () => {
    const fn = REPOSITORIO.slice(REPOSITORIO.indexOf("export async function registrarTentativaDeContato"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain('rpc("registrar_tentativa_contato"');
    expect(corpo).not.toContain("+ 1");
  });

  it("zerar a insistência não mexe no total — histórico não se reescreve", () => {
    const fn = REPOSITORIO.slice(REPOSITORIO.indexOf("export async function registrarRespostaDoLead"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain('rpc("registrar_resposta_do_lead"');
    expect(corpo).not.toContain("tentativas_contato");
  });
});
