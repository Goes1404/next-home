import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas de leitura de código para o avanço automático de etapa.
 *
 * O funil só anda sozinho em dois FATOS: primeira resposta entregue
 * (novo → primeiro_contato) e visita confirmada (→ visita_agendada). As
 * etapas do meio são humanas de propósito — o dossiê da IA oscila entre
 * leituras, e etapa que anda e volta sozinha destrói a confiança do
 * corretor no quadro.
 */

const REPOSITORIO = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const WEBHOOK = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const DISPARADOR = readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8");
const ACOES_IA = readFileSync("src/app/corretor/(painel)/conversas/acoesIA.ts", "utf8");

describe("novo → primeiro_contato automático", () => {
  it("o update só alcança quem ainda está em 'novo' — o termostato do funil", () => {
    const fn = REPOSITORIO.slice(
      REPOSITORIO.indexOf("export async function avancarLeadParaPrimeiroContato"),
    );
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain('.eq("etapa", "novo")');
    expect(corpo).toContain('etapa: "primeiro_contato"');
    expect(corpo).toContain("etapa_alterada_em");
  });

  it("o webhook só avança quando a resposta foi ENTREGUE", () => {
    const chamada = WEBHOOK.indexOf("avancarLeadParaPrimeiroContato(");
    expect(chamada).toBeGreaterThan(-1);
    const contexto = WEBHOOK.slice(chamada - 200, chamada);
    // Resposta que falhou no envio não é contato com ninguém.
    expect(contexto).toContain("envio.enviado");
  });

  /*
   * A campanha ficou de fora por dois meses, e o defeito era CALADO: as
   * mensagens saíam, o Live Chat mostrava tudo certo, e o quadro seguia
   * dizendo "Novo lead" para quem já tinha sido abordado. Medido em
   * produção: 10 leads com mensagem entregue, nenhum fora de "Novo".
   */
  it("o disparo de campanha também avança o lead", () => {
    expect(DISPARADOR).toContain("avancarLeadParaPrimeiroContato(");
  });

  it("o disparador só avança DEPOIS de gravar o envio como bem-sucedido", () => {
    // Compara POSIÇÕES em vez de fatiar uma janela de N caracteres: a
    // janela quebrava a cada comentário novo entre os dois pontos, e o que
    // o teste protege é a ordem — mensagem que não saiu não é contato com
    // ninguém, mesma régua do webhook.
    const gravouEnvio = DISPARADOR.indexOf('status: "enviado"');
    const avanco = DISPARADOR.indexOf("avancarLeadParaPrimeiroContato(", gravouEnvio);
    expect(gravouEnvio).toBeGreaterThan(-1);
    expect(avanco).toBeGreaterThan(gravouEnvio);
  });

  // "Ao criar caminho novo que FALA com o cliente, procurar quem mexe no
  // funil" — os botões de IA do painel (05/09/2026) são o quarto caminho.
  it("os botões de IA do painel também avançam o lead", () => {
    expect(ACOES_IA).toContain("avancarLeadParaPrimeiroContato(");
  });

  /**
   * Etapa que a MÁQUINA não escreve — e a exceção de 11/09/2026.
   *
   * A regra continua a mesma: `documentacao`, `fechado` e `negociacao` são
   * LEITURA do corretor sobre onde o negócio está, e a máquina não tem como
   * saber isso. Escrevê-las automaticamente encheria o funil de julgamento
   * que ninguém fez.
   *
   * `perdido` saiu dessa lista para UM caminho, e por um motivo que a
   * distingue das outras: quando o cliente DIZ "não tenho interesse", não
   * há julgamento nenhum a fazer — ele é um fato que ele mesmo declarou.
   * O usuário pediu isso explicitamente (11/09), junto com cancelar os
   * follow-ups, tirar das campanhas e avisar o corretor; sem a etapa, o
   * lead continuaria na fila de trabalho como oportunidade aberta.
   *
   * A exceção é NOMEADA (`registrarRecusaDoCliente`) e o resto do
   * repositório continua proibido: é isso que impede a próxima pessoa a
   * mexer aqui de achar que `perdido` virou escrita livre.
   */
  it("nenhum caminho escreve etapa de julgamento automaticamente", () => {
    for (const arquivo of [REPOSITORIO, WEBHOOK, DISPARADOR, ACOES_IA]) {
      expect(arquivo).not.toContain('etapa: "documentacao"');
      expect(arquivo).not.toContain('etapa: "fechado"');
      expect(arquivo).not.toContain('etapa: "negociacao"');
    }
    for (const arquivo of [WEBHOOK, DISPARADOR, ACOES_IA]) {
      expect(arquivo).not.toContain('etapa: "perdido"');
    }
  });

  it('"perdido" só é escrito pela recusa DITA pelo cliente', () => {
    const ocorrencias = REPOSITORIO.split('etapa: "perdido"').length - 1;
    expect(ocorrencias, "perdido deveria ser escrito em um lugar só").toBe(1);

    const inicio = REPOSITORIO.indexOf("export async function registrarRecusaDoCliente(");
    expect(inicio, "registrarRecusaDoCliente não encontrada").toBeGreaterThan(-1);
    const fim = REPOSITORIO.indexOf("export ", inicio + 10);
    expect(REPOSITORIO.slice(inicio, fim)).toContain('etapa: "perdido"');
  });
});

/**
 * A mesma classe de buraco, um andar acima: quem FALA com o cliente por
 * iniciativa nossa também precisa agendar o reengajamento.
 *
 * Descoberto em 31/08/2026 auditando o roadmap. `agendarFollowup` era
 * chamado em UM lugar — o webhook, e ainda sob a condição de a temperatura
 * passar de 40. Resultado medido: 87 disparos de campanha entregues e ZERO
 * follow-ups criados para eles, justamente a população que a fila de
 * reengajamento existe para alcançar. As 16 linhas que a tabela teve na
 * vida nasceram todas dentro de conversa ativa.
 *
 * O sintoma enganava: o `followups-whatsapp` acumulou 2.719 execuções sem
 * uma falha, respondendo "processados: 0" — cron saudável, fila vazia.
 * Antes de culpar o runner, conferir quem ENFILEIRA.
 */
describe("quem fala com o cliente agenda o reengajamento", () => {
  it("o disparo de campanha agenda follow-up", () => {
    expect(DISPARADOR).toContain("agendarFollowup(");
  });

  it("o webhook continua agendando", () => {
    expect(WEBHOOK).toContain("agendarFollowup(");
  });

  it("o agendamento do disparo acontece DEPOIS de a mensagem ser gravada", () => {
    // Follow-up de mensagem que não chegou a existir seria insistência
    // sobre o nada — e a conversa é o que o runner revalida antes de enviar.
    const gravou = DISPARADOR.indexOf("gravarMensagem({");
    const agendou = DISPARADOR.indexOf("agendarFollowup(");
    expect(gravou).toBeGreaterThan(-1);
    expect(agendou).toBeGreaterThan(gravou);
  });

  /*
   * As proteções do reengajamento não podem ser afrouxadas para caber o
   * caso novo: o teto de 2 e a trava de "um pendente por vez" são o que
   * separa follow-up de perseguição.
   */
  it("o teto de tentativas e a trava de pendente continuam em agendarFollowup", () => {
    const fn = REPOSITORIO.slice(REPOSITORIO.indexOf("export async function agendarFollowup"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain("MAX_TENTATIVAS_FOLLOWUP");
    expect(corpo).toContain('f.status === "pendente"');
  });
});
