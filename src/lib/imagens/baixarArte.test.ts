import { describe, expect, it } from "vitest";
import { linkDeDownload, nomeDaArte, quandoExpira } from "./imagensTipos";

/**
 * O caminho de BAIXAR a arte (16/09/2026).
 *
 * Relatado como "não consigo ver os cards de minhas imagens, para baixá-las".
 * Medido antes de mexer: a galeria não tinha botão de baixar em lugar nenhum —
 * a miniatura de 80px era o único elemento do card, sem link. E as artes
 * expiram em 48h (0109), então a peça paga sumia antes de alguém conseguir
 * salvá-la.
 */

describe("linkDeDownload", () => {
  /*
   * A razão de o helper existir: `<a download>` é IGNORADO entre origens, e a
   * arte mora no domínio do Storage, nunca no nosso. Quem força o anexo é o
   * `?download=` do próprio Supabase — medido contra o bucket real antes de
   * escrever isto: volta `content-disposition: attachment` com o nome enviado.
   */
  it("acrescenta o parâmetro que faz o Storage responder com anexo", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/empreendimentos/a/b.png";
    expect(linkDeDownload(url, "arte.png")).toBe(`${url}?download=arte.png`);
  });

  it("preserva query que já exista em vez de atropelá-la", () => {
    const link = linkDeDownload("https://x.co/a.png?v=2", "arte.png");
    expect(link).toContain("v=2");
    expect(link).toContain("download=arte.png");
  });

  it("escapa o nome, para espaço e acento não quebrarem o endereço", () => {
    const link = linkDeDownload("https://x.co/a.png", "fachada ao pôr do sol.png");
    expect(link).not.toContain(" ");
    expect(link).toContain("download=");
  });

  /*
   * Degradar para o endereço cru é decisão: o botão continua ABRINDO a
   * imagem, e abrir é melhor que um card que não faz nada. Falhar fechado
   * aqui tiraria da pessoa o único acesso que ela tinha à peça.
   */
  it("devolve a url intacta quando ela não é um endereço válido", () => {
    expect(linkDeDownload("nao-e-url", "arte.png")).toBe("nao-e-url");
  });
});

describe("nomeDaArte", () => {
  it("leva a data na frente e o pedido no corpo", () => {
    expect(nomeDaArte("Fachada ao pôr do sol", "2026-09-16T02:56:51.060Z")).toBe(
      "2026-09-16-fachada-ao-por-do-sol.png",
    );
  });

  it("não deixa o nome terminar em hífen ao cortar no meio de uma palavra", () => {
    const nome = nomeDaArte("a".repeat(30) + " " + "b".repeat(30), "2026-09-16T00:00:00Z");
    expect(nome).not.toContain("-.");
    expect(nome.endsWith(".png")).toBe(true);
  });

  /* Pedido só com pontuação não pode produzir um arquivo chamado ".png". */
  it("cai num nome utilizável quando o pedido não tem letra nenhuma", () => {
    expect(nomeDaArte("!!! ???", "2026-09-16T00:00:00Z")).toBe("2026-09-16-arte.png");
  });
});

describe("quandoExpira", () => {
  /*
   * O fuso é cravado em São Paulo, nunca o do servidor. Este instante é
   * 02:56 UTC do dia 16 — que em Brasília ainda é a noite do dia 15. Ler pelo
   * relógio do servidor (que roda em UTC) daria "16/09" e faria a arte
   * parecer durar um dia a mais. É a mesma armadilha de
   * `inicioDoDiaEmSaoPaulo`, e a que já quebrou o calendário do bot.
   */
  it("escreve o prazo no fuso de São Paulo, não no do servidor", () => {
    expect(quandoExpira("2026-09-16T02:56:00.000Z")).toBe("15/09 às 23h56");
  });

  it("não promete prazo quando a linha é antiga e não tem um", () => {
    expect(quandoExpira(null)).toBeNull();
  });

  it("não promete prazo a partir de data inválida", () => {
    expect(quandoExpira("nao-e-data")).toBeNull();
  });
});
