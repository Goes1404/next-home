import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Quem FALA com o cliente por iniciativa nossa marca a conversa como
 * atendimento.
 *
 * ## O defeito, relatado e medido (01/09/2026)
 *
 * "Disparamos para a lista de leads, alguns responderam, e a IA não
 * respondeu." Medido: **7 clientes responderam ao disparo e só 1 das
 * conversas estava marcada como campanha.**
 *
 * A isenção da trava olhava a certidão de nascimento da conversa —
 * `obterOuCriarConversa` devolve a existente intacta, então o
 * `origem: "campanha"` do disparador só vale no INSERT. Lead com conversa
 * orgânica anterior recebia o disparo e o bot ficava mudo.
 *
 * ## Por que ler o CÓDIGO-FONTE
 *
 * É a mesma classe de `etapaAutomatica.test.ts` e `gravacaoDeMensagem`: a
 * regressão falha CALADA. Nada quebra, nenhum teste de unidade acusa — o
 * cliente só não é respondido, e ninguém descobre até alguém perguntar por
 * quê. É a terceira vez que este projeto tropeça em "criei um caminho novo
 * que fala com o cliente e esqueci de mexer no estado dele" (a primeira foi
 * o funil, na 0059; a segunda, o agendamento de follow-up).
 */

const CAMINHOS_QUE_FALAM = [
  "src/lib/whatsapp/campaignDispatcher.ts",
  "src/app/api/cron/followups/route.ts",
];

describe("caminho que fala com o cliente marca a conversa como atendimento", () => {
  it.each(CAMINHOS_QUE_FALAM)("%s chama marcarConversaComoAtendimento", (arquivo) => {
    const codigo = readFileSync(arquivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(
      codigo.includes("marcarConversaComoAtendimento("),
      `${arquivo} manda mensagem por iniciativa nossa e não marca a conversa como ` +
        "atendimento. Sem isso, o cliente responde e o bot fica mudo — foi o defeito " +
        "medido em 01/09 (7 responderam ao disparo, 1 conversa marcada).",
    ).toBe(true);
  });
});

/**
 * E quem fala por iniciativa nossa OLHA o não-perturbe (0110).
 *
 * São três caminhos, e os três precisam ler o mesmo campo — é a quarta vez
 * que este projeto tropeça em "criei um caminho que fala com o cliente e
 * esqueci de olhar o estado dele". A regressão é calada e cara: o cliente
 * pediu para sair, recebeu uma despedida educada, e continua recebendo
 * disparo — que é o caminho curto para a denúncia.
 *
 * A etapa `perdido` NÃO substitui esta checagem: etapa anda e volta, e
 * bastaria alguém arrastar o cartão de volta para "Novo".
 */
describe("os três caminhos de iniciativa olham o não-perturbe", () => {
  const CAMINHOS = [
    // Campanha: a régua mora em `elegivel`, que o disparo inteiro usa.
    "src/lib/crm/publicoDaCampanha.ts",
    // Follow-up: a revalidação no runner, antes de mandar.
    "src/app/api/cron/followups/route.ts",
    // Abertura por iniciativa da IA, pelo painel.
    "src/app/corretor/(painel)/conversas/acoesIA.ts",
  ];

  it.each(CAMINHOS)("%s lê nao_contatar_em / naoContatarEm", (arquivo) => {
    const codigo = readFileSync(arquivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(
      /na[o|ó]_?[cC]ontatar[_]?[eE]m/.test(codigo),
      `${arquivo} fala com o cliente por iniciativa nossa e não olha o não-perturbe. ` +
        "Quem pediu para sair recebe a despedida e continua recebendo disparo.",
    ).toBe(true);
  });
});

describe("a pausa por fala do corretor", () => {
  it("é curta — numa linha pessoal, 24h é silêncio permanente", () => {
    /*
     * Medido em 01/09: 448 mensagens de cliente puladas em 7 dias por
     * `pausada_por_humano` contra 32 respondidas, com o relógio reiniciando
     * a cada uma das 373 mensagens que o corretor manda do próprio celular.
     */
    const codigo = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
    const achado = codigo.match(/const HORAS_PAUSA_HUMANA = (\d+)/);

    expect(achado).not.toBeNull();
    expect(Number(achado![1])).toBeLessThanOrEqual(6);
  });
});
