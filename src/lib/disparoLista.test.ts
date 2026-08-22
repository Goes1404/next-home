import { describe, expect, it } from "vitest";
import { preencherTemplate } from "./mensagem";
import { montarFilaCampanha } from "./whatsapp/campaignQueue";
import { saldoDiario } from "./whatsapp/antiBan";
import { linkWhatsappApp } from "./site";

/**
 * O disparo em massa da lista de leads usa DUAS sintaxes de template do
 * projeto em sequência: o template do corretor (`{{nome_lead}}`) vira a
 * mensagem-base da fila de campanha (`{nome}`), que só então é resolvida
 * lead a lead. Se essa ponte quebrar, o cliente recebe "Olá, {nome}!".
 */
describe("Disparo para lista — ponte entre os dois templates", () => {
  const conteudo = "Olá, {{nome_lead}}! Aqui é {{nome_corretor}}. Chame no {{telefone_corretor}}.";

  it("resolve os dados do corretor e preserva o marcador do lead", () => {
    const base = preencherTemplate(conteudo, {
      nomeLead: "{nome}",
      nomeCorretor: "Bruna Cristal",
      telefoneCorretor: "5511996188216",
    });

    expect(base).toBe("Olá, {nome}! Aqui é Bruna Cristal. Chame no 5511996188216.");
    expect(base).not.toContain("{{");
  });

  it("a fila resolve o nome de CADA lead a partir dessa base", () => {
    const base = preencherTemplate(conteudo, {
      nomeLead: "{nome}",
      nomeCorretor: "Bruna Cristal",
      telefoneCorretor: "5511996188216",
    });

    const fila = montarFilaCampanha({
      campanhaId: "camp-1",
      leads: [
        { id: "l1", nome: "Ana", telefone: "5511988881111" },
        { id: "l2", nome: "Bruno", telefone: "5511988882222" },
      ],
      mensagemBase: base,
    });

    expect(fila[0].mensagemPersonalizada).toContain("Olá, Ana!");
    expect(fila[1].mensagemPersonalizada).toContain("Olá, Bruno!");
    // Nenhum marcador pode sobrar em nenhuma das duas sintaxes.
    for (const item of fila) {
      expect(item.mensagemPersonalizada).not.toContain("{nome}");
      expect(item.mensagemPersonalizada).not.toContain("{{");
    }
  });
});

describe("Recorte da cota — o que sai hoje e o que fica na fila", () => {
  /** Mesmo cálculo do `recortar` em leads/acoes.ts. */
  function recorte(elegiveis: number, conectadoEm: Date, enviosHoje: number) {
    const hoje = Math.min(elegiveis, saldoDiario({ conectadoEm, enviosCampanhaHoje: enviosHoje }));
    return { hoje, depois: elegiveis - hoje };
  }

  it("número pareado hoje: 15 saem e o resto espera (nada é descartado)", () => {
    expect(recorte(19, new Date(), 0)).toEqual({ hoje: 15, depois: 4 });
  });

  it("desconta o que o número já disparou no mesmo dia", () => {
    expect(recorte(19, new Date(), 10)).toEqual({ hoje: 5, depois: 14 });
  });

  it("número maduro (30+ dias) cobre a lista inteira de uma vez", () => {
    const maduro = new Date(Date.now() - 40 * 86_400_000);
    expect(recorte(19, maduro, 0)).toEqual({ hoje: 19, depois: 0 });
  });

  it("cota estourada não descarta ninguém — tudo vai para os próximos dias", () => {
    expect(recorte(8, new Date(), 15)).toEqual({ hoje: 0, depois: 8 });
  });
});

describe("Link de queda — abre a conversa sem a tela intermediária", () => {
  it("no celular entrega direto ao app", () => {
    expect(linkWhatsappApp("5511988881111", "Oi!", true)).toBe(
      "whatsapp://send?phone=5511988881111&text=Oi!",
    );
  });

  it("no desktop cai no chat do WhatsApp Web, não no interstício wa.me", () => {
    const link = linkWhatsappApp("5511988881111", "Oi!", false);
    expect(link).toContain("web.whatsapp.com/send");
    expect(link).not.toContain("wa.me");
  });

  it("escapa o texto da mensagem", () => {
    expect(linkWhatsappApp("5511988881111", "Olá, tudo bem?", true)).toContain(
      "text=Ol%C3%A1%2C%20tudo%20bem%3F",
    );
  });
});
