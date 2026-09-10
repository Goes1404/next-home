import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  conteudoParaGravar,
  conversaEhAtendimento,
  resumoParaGravar,
  TEXTO_NAO_GUARDADO,
} from "./privacidadeDaConversa";
import { exigeLiberacaoExplicita } from "./modoBot";

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

describe("conversaEhAtendimento — as quatro portas", () => {
  it("palavra-chave dita libera", () => {
    expect(conversaEhAtendimento({ liberadoPorPalavraChave: true })).toBe(true);
  });

  it("número que JÁ ERA do CRM libera, mesmo sem palavra-chave", () => {
    /*
     * É a porta que a primeira versão desta regra ignorou. Medido: o bot
     * havia falado em 26 conversas com `liberado_por_palavra_chave = false`,
     * 15 vezes nas últimas 24h. Guardar por aquela flag teria apagado
     * conversa de cliente viva no mesmo dia.
     */
    expect(
      conversaEhAtendimento({ liberadoPorPalavraChave: false, clienteConhecido: true }),
    ).toBe(true);
  });

  it("campanha nunca precisou de palavra nenhuma", () => {
    expect(
      conversaEhAtendimento({ liberadoPorPalavraChave: false, origem: "campanha" }),
    ).toBe(true);
  });

  it("fora das três, ninguém autorizou", () => {
    expect(
      conversaEhAtendimento({
        liberadoPorPalavraChave: false,
        clienteConhecido: false,
        origem: "organica",
      }),
    ).toBe(false);
  });

  it("nulo não conta como autorização", () => {
    expect(
      conversaEhAtendimento({ liberadoPorPalavraChave: false, clienteConhecido: null }),
    ).toBe(false);
  });

  /*
   * A quarta porta: a IA JÁ atendeu esta conversa alguma vez (0106).
   *
   * Sem ela, o retravamento — que acontece a cada fala do corretor que não é
   * a palavra-chave, e ele manda ~373 por semana do próprio celular — fazia a
   * conversa VOLTAR a perder texto depois de já ter sido atendida. Medido:
   * 2.431 falas gravadas em branco, e o buraco é de um lado só, porque a fala
   * do bot nunca fica em branco.
   */
  it("conversa que a IA já atendeu continua guardando texto, mesmo retravada", () => {
    expect(
      conversaEhAtendimento({
        liberadoPorPalavraChave: false,
        clienteConhecido: false,
        origem: "organica",
        atendidaEm: "2026-09-01T12:00:00Z",
      }),
    ).toBe(true);
  });

  it("nunca atendida continua sem guardar", () => {
    expect(
      conversaEhAtendimento({
        liberadoPorPalavraChave: false,
        clienteConhecido: false,
        origem: "organica",
        atendidaEm: null,
      }),
    ).toBe(false);
  });
});

/**
 * A guarda CENTRAL desta correção: o par que prova a separação.
 *
 * Fato e permissão são coisas diferentes, e só podem discordar se morarem em
 * campos diferentes. A opção que o usuário DESCARTOU era reusar
 * `cliente_conhecido` — que desligaria o retravamento junto, deixando a IA
 * assumir a conversa da família do corretor (o caso real da conversa da mãe
 * dele).
 *
 * Um teste só de um dos lados não distingue esta correção daquela.
 */
describe("fato e permissão discordam, e é isso que o recurso é", () => {
  const jaAtendidaERetravada = {
    liberadoPorPalavraChave: false,
    clienteConhecido: false,
    origem: "organica" as const,
    atendidaEm: "2026-09-01T12:00:00Z",
  };

  it("o FATO é reconhecido: o texto volta a ser guardado", () => {
    expect(conversaEhAtendimento(jaAtendidaERetravada)).toBe(true);
  });

  it("a PERMISSÃO segue trancada: quem decide se a IA fala não lê atendida_em", () => {
    /*
     * `exigeLiberacaoExplicita` é quem responde "a IA pode falar?". Ela não
     * recebe nem lê `atendidaEm` — e é este teste que impede alguém de
     * "simplificar" a separação juntando as duas de novo.
     */
    const codigo = readFileSync("src/lib/whatsapp/modoBot.ts", "utf8");
    const inicio = codigo.indexOf("export function exigeLiberacaoExplicita");
    const fim = codigo.indexOf("\n}", inicio);
    const corpo = codigo.slice(inicio, fim);

    expect(corpo).not.toMatch(/atendidaEm|atendida_em/);
    expect(
      exigeLiberacaoExplicita({ origemConversa: "organica", jaEraDoCrm: false }),
    ).toBe(true);
  });
});
