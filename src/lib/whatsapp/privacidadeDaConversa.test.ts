import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  conteudoParaGravar,
  conversaEhAtendimento,
  resumoParaGravar,
  TEXTO_NAO_GUARDADO,
} from "./privacidadeDaConversa";

describe("conversa nunca liberada não guarda texto", () => {
  const pessoal = "Estou indo, amor. Só quando acabar o expediente aqui";

  it("substitui o conteúdo quando a conversa não foi liberada", () => {
    /*
     * Medido em 01/09: 62 conversas nunca liberadas, 4.178 mensagens
     * guardadas, ~74 por dia. O número da instância é o WhatsApp pessoal do
     * corretor, e tudo que chega ali era persistido.
     */
    expect(conteudoParaGravar(pessoal, false)).toBe(TEXTO_NAO_GUARDADO);
    expect(conteudoParaGravar(pessoal, false)).not.toContain("amor");
  });

  it("guarda normalmente quando a conversa foi liberada", () => {
    expect(conteudoParaGravar("Quero saber do Terra Alta", true)).toBe(
      "Quero saber do Terra Alta",
    );
  });

  it("o marcador não é vazio — linha em branco na tela parece defeito", () => {
    expect(TEXTO_NAO_GUARDADO.length).toBeGreaterThan(10);
    expect(TEXTO_NAO_GUARDADO).toMatch(/não gravada/);
  });

  it("o resumo da lista segue a mesma regra", () => {
    expect(resumoParaGravar(pessoal, false)).toBe(TEXTO_NAO_GUARDADO);
    expect(resumoParaGravar("a".repeat(900), true)).toHaveLength(500);
  });
});

/**
 * Guarda de origem: quem grava obedece à liberação, e quem não obedece
 * precisa ter razão escrita.
 *
 * A regra não é sobre QUEM falou — a conversa pessoal que motivou tudo tem
 * mensagens do próprio corretor. É sobre a ORIGEM: o que chega espelhado do
 * celular pelo webhook obedece à liberação; o que o corretor digita no
 * painel e o que NÓS iniciamos (campanha, follow-up) são atendimento por
 * definição.
 */
describe("todo chamador de gravarMensagem decide sobre privacidade", () => {
  const ARQUIVOS = [
    "src/app/api/webhooks/whatsapp/route.ts",
    "src/app/corretor/(painel)/conversas/acoes.ts",
    "src/app/api/cron/followups/route.ts",
    "src/lib/whatsapp/campaignDispatcher.ts",
  ];

  it.each(ARQUIVOS)("%s passa conversaLiberada em toda chamada", (arquivo) => {
    const codigo = readFileSync(arquivo, "utf8");
    const chamadas = codigo.split("gravarMensagem({").length - 1;
    const decisoes = codigo.split("conversaLiberada:").length - 1;

    expect(
      decisoes,
      `${arquivo} chama gravarMensagem ${chamadas}x e decide sobre privacidade ${decisoes}x. ` +
        "Toda chamada precisa dizer se a conversa está liberada — sem isso, a vida pessoal " +
        "do corretor volta a ser gravada em silêncio.",
    ).toBe(chamadas);
  });

  it("o WEBHOOK decide pela função, nunca crava true", () => {
    /*
     * É o caminho do espelho do celular — o único por onde entra conversa
     * que ninguém autorizou. E a decisão vem de `conversaEhAtendimento`,
     * não de uma flag solta: a primeira versão usava
     * `liberado_por_palavra_chave` e teria apagado 26 conversas em que o
     * bot ATENDE, porque aquela é só uma das três portas.
     */
    const codigo = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    expect(codigo).not.toMatch(/conversaLiberada:\s*true/);
    expect(codigo).toMatch(/conversaLiberada:\s*conversaEhAtendimento\(/);
  });
});

describe("conversaEhAtendimento — tem lead, é atendimento (04/10/2026)", () => {
  /*
   * Eram quatro portas (palavra-chave, número do CRM, campanha, atendida
   * antes) enquanto o webhook criava conversa para qualquer número. Desde a
   * 0111 o porteiro barra número sem lead ANTES de criar conversa, então a
   * régua virou uma só. A trava de liberação saiu na 0149-0150.
   */
  it("conversa com lead guarda texto", () => {
    expect(conversaEhAtendimento({ leadId: "lead-1" })).toBe(true);
  });

  it("conversa sem lead (estoque antigo, objeto de teste) não guarda", () => {
    expect(conversaEhAtendimento({ leadId: null })).toBe(false);
  });

  it("a régua não depende de mais nada da conversa", () => {
    const codigo = readFileSync("src/lib/whatsapp/privacidadeDaConversa.ts", "utf8");
    const inicio = codigo.indexOf("export function conversaEhAtendimento");
    const corpo = codigo.slice(inicio, codigo.indexOf("\n}", inicio));
    expect(corpo).not.toMatch(/liberad|clienteConhecido|origem|atendidaEm/);
  });
});
