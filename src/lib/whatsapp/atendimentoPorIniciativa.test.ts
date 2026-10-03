import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Até 04/10/2026 havia aqui uma guarda exigindo que campanha e follow-up
 * chamassem `marcarConversaComoAtendimento`: a trava de liberação olhava como
 * a conversa nasceu, e cliente que respondia ao disparo ficava sem resposta
 * (01/09: 7 responderam, 1 conversa marcada). A trava saiu (0149-0150) — toda
 * conversa tem lead e a decisão de responder mora em `quandoAIaResponde.ts`,
 * que não pergunta como a conversa nasceu. Não há mais o que marcar.
 */

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
    // "Me avise quando surgir": o único aviso por iniciativa que sobrou
    // (03/10/2026). A abertura pela ficha e o primeiro contato automático
    // com lead de portal saíram (regra N1: a IA só responde).
    "src/lib/crm/avisoDeNovidade.ts",
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
