import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas do funil do atendimento por WhatsApp (view `whatsapp_funil_metricas`).
 *
 * A view existe desde a 0029 e ganhou o degrau da visita PROPOSTA na 0072,
 * depois que uma auditoria encontrou `ia_interacoes.sugeriu_visita` com 46
 * linhas vivas e ZERO leitores no repositório. As duas regressões que este
 * arquivo trava já aconteceram nesta base, e as duas falhariam caladas.
 */

const VIEW = readFileSync(
  "supabase/migrations/0072_funil_do_bot_com_visita_proposta.sql",
  "utf8",
);
const TELA = readFileSync("src/app/corretor/(painel)/whatsapp/page.tsx", "utf8");

describe("a view conta o que promete", () => {
  /*
   * A armadilha nº 1 de `ia_interacoes`: a tabela guarda uma linha por
   * INTERAÇÃO, inclusive as em que nenhum modelo rodou (bot pausado,
   * contingência). Sem este filtro, o silêncio de um bot pausado entraria
   * no funil como "a IA ofereceu visita".
   */
  it("só conta interação em que a IA de fato respondeu", () => {
    const trecho = VIEW.slice(VIEW.indexOf("visitas_propostas") - 700, VIEW.indexOf("visitas_propostas"));
    expect(trecho).toContain("acao = 'respondida'");
    expect(trecho).toContain("modelo is not null");
  });

  /*
   * A unidade do funil é a CONVERSA, nunca a resposta — o cliente não
   * compara mensagens de conversas diferentes. Em 31/08 eram 46 interações
   * para 6 conversas: contar interações multiplicaria o degrau por oito.
   */
  it("o degrau conta conversas distintas, não interações", () => {
    expect(VIEW).toContain("count(distinct c.id) filter (");
  });

  /*
   * A visita não pode SUMIR do funil quando o negócio avança. Contar só
   * `etapa = 'visita_agendada'` fazia o número de visitas cair quando o
   * lead ia para documentação — um funil que piora quando a venda melhora.
   */
  it("a visita é cumulativa: a data (fato) ou a etapa de visita em diante", () => {
    expect(VIEW).toContain("l.visita_agendada_em is not null");
    expect(VIEW).toContain("'visita_agendada', 'documentacao', 'fechado'");
  });
});

describe("a tela lê todos os degraus da view", () => {
  /*
   * `sugeriu_visita` passou meses sendo escrito sem nenhum leitor. A
   * regressão irmã seria a view ganhar um degrau e a tela não pedir a
   * coluna: o dado voltaria a existir sem aparecer, que nesta casa é o
   * mesmo que não existir.
   */
  it("pede a coluna de visitas propostas na consulta", () => {
    expect(TELA).toContain("visitas_propostas");
  });

  it("e mostra o número na tela, não só no select", () => {
    expect(TELA).toContain("funil.visitas_propostas");
    expect(TELA).toContain("Visitas propostas");
  });
});
