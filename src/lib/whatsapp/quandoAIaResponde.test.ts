import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decidirSeAIaResponde,
  fraseDaDecisao,
  podeEnviarPorIniciativa,
  registroDoSilencio,
  silencioDaConversa,
  type ConfigDoNumero,
  type SituacaoDaConversa,
} from "./quandoAIaResponde";

function semComentariosDe(arquivo: string): string {
  return readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
}

/** Datas fixas em UTC; o módulo converte para America/Sao_Paulo (UTC-3). */
const QUARTA_14H_BRT = new Date("2026-08-19T17:00:00Z");
const QUARTA_22H_BRT = new Date("2026-08-20T01:00:00Z");

const livre: SituacaoDaConversa = { botAtivo: true };
const sempre: ConfigDoNumero = { modo: "24_7", expediente: { inicioHora: 9, fimHora: 18 } };
const noturno: ConfigDoNumero = { modo: "noturno_e_fds", expediente: { inicioHora: 9, fimHora: 18 } };

describe("decidirSeAIaResponde — a decisão inteira num lugar só", () => {
  it("conversa livre, número 24/7: responde", () => {
    expect(decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT })).toEqual({
      responde: true,
      motivo: "sempre_ativa",
    });
  });

  it("cada motivo da conversa cala, com o motivo certo", () => {
    const agora = QUARTA_14H_BRT;
    const casos: [SituacaoDaConversa, string][] = [
      [{ ...livre, leadDeOutroCorretor: true }, "lead_de_outro_corretor"],
      [{ ...livre, naoContatar: true }, "lead_pediu_para_sair"],
      [{ ...livre, botAtivo: false }, "ia_desligada_na_conversa"],
    ];
    for (const [conversa, motivo] of casos) {
      const d = decidirSeAIaResponde({ conversa, numero: sempre, agora });
      expect(d.responde, motivo).toBe(false);
      expect(d.motivo).toBe(motivo);
    }
  });

  it("conversa desligada não tem prazo: só a ativação religa (03/10/2026)", () => {
    // Era uma pausa de 3h que vencia sozinha. Agora não existe "volta em".
    const d = decidirSeAIaResponde({ conversa: { ...livre, botAtivo: false }, numero: sempre });
    expect(d).toEqual({ responde: false, motivo: "ia_desligada_na_conversa", voltaEm: null });
  });

  it("a conversa ganha do número: o que o cliente pediu vem antes da configuração", () => {
    const d = decidirSeAIaResponde({
      conversa: { ...livre, naoContatar: true },
      numero: { ...sempre, modo: "desativado" },
      agora: QUARTA_14H_BRT,
    });
    expect(d.motivo).toBe("lead_pediu_para_sair");
  });

  it("a precedência dentro da conversa é estável", () => {
    // Sem ordem fixa, a soma por motivo em ia_interacoes deixaria de fechar.
    const d = decidirSeAIaResponde({
      conversa: { botAtivo: false, naoContatar: true, leadDeOutroCorretor: true },
      numero: sempre,
      agora: QUARTA_14H_BRT,
    });
    expect(d.motivo).toBe("lead_de_outro_corretor");
  });

  it("o número cala por modo: desligada, expediente, co-piloto", () => {
    expect(
      decidirSeAIaResponde({ conversa: livre, numero: { ...sempre, modo: "desativado" }, agora: QUARTA_14H_BRT })
        .motivo,
    ).toBe("ia_desligada_no_numero");
    expect(decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_14H_BRT }).motivo).toBe(
      "dentro_do_expediente",
    );
    expect(decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_22H_BRT })).toEqual({
      responde: true,
      motivo: "fora_do_expediente",
    });
    const copiloto: ConfigDoNumero = { ...sempre, modo: "co_piloto_3min" };
    const falouAgora = new Date(QUARTA_14H_BRT.getTime() - 60_000).toISOString();
    const d = decidirSeAIaResponde({
      conversa: livre,
      numero: copiloto,
      ultimaFalaCorretorEm: falouAgora,
      agora: QUARTA_14H_BRT,
    });
    expect(d.motivo).toBe("corretor_respondendo");
    expect(d.responde === false && d.voltaEm?.toISOString()).toBe(
      new Date(QUARTA_14H_BRT.getTime() + 2 * 60_000).toISOString(),
    );
  });

  it("sem a configuração do número, só a conversa decide", () => {
    expect(decidirSeAIaResponde({ conversa: livre, numero: null }).responde).toBe(true);
    expect(decidirSeAIaResponde({ conversa: { ...livre, botAtivo: false }, numero: null }).responde).toBe(false);
  });

  it("silencioDaConversa concorda com a decisão em toda combinação da conversa", () => {
    for (const botAtivo of [true, false])
      for (const naoContatar of [true, false])
        for (const leadDeOutroCorretor of [true, false]) {
          const conversa = { botAtivo, naoContatar, leadDeOutroCorretor };
          const d = decidirSeAIaResponde({ conversa, numero: sempre, agora: QUARTA_14H_BRT });
          expect(d.responde).toBe(silencioDaConversa(conversa) === null);
        }
  });
});

describe("podeEnviarPorIniciativa — o lembrete de visita", () => {
  it("respeita a conversa inteira", () => {
    expect(
      podeEnviarPorIniciativa({ conversa: { ...livre, naoContatar: true }, numero: sempre }).responde,
    ).toBe(false);
  });

  it("o modo 'fora do expediente' NÃO barra: o lembrete sai dentro do expediente", () => {
    /*
     * O defeito que isto corrige (04/10/2026): o runner aplicava
     * `decidirPorModo` ao lembrete. Para quem usa "noturno e fds" ele só
     * podia sair DENTRO do expediente (janela do corretor) e o modo dizia
     * "não" justamente lá — o lembrete nunca saía.
     */
    expect(
      podeEnviarPorIniciativa({ conversa: livre, numero: noturno }).responde,
    ).toBe(true);
  });

  it("IA desligada no número barra", () => {
    expect(
      podeEnviarPorIniciativa({ conversa: livre, numero: { ...sempre, modo: "desativado" } }).responde,
    ).toBe(false);
  });
});

describe("fraseDaDecisao — a tela tira a frase da mesma decisão", () => {
  it("tem frase para todo motivo de silêncio", () => {
    const motivos = [
      "lead_de_outro_corretor",
      "lead_pediu_para_sair",
      "ia_desligada_na_conversa",
      "ia_desligada_no_numero",
      "dentro_do_expediente",
      "corretor_respondendo",
      "cota_do_grupo",
      "grupo_suspenso",
    ] as const;
    for (const motivo of motivos) {
      const frase = fraseDaDecisao({ responde: false, motivo, voltaEm: null }, noturno);
      expect(frase.length, motivo).toBeGreaterThan(5);
    }
  });

  it("expediente diz a hora em que a IA volta", () => {
    expect(fraseDaDecisao({ responde: false, motivo: "dentro_do_expediente", voltaEm: null }, noturno)).toContain(
      "18h",
    );
  });

  it("o registro do silêncio leva o motivo e o que o explica", () => {
    const r = registroDoSilencio({ responde: false, motivo: "dentro_do_expediente", voltaEm: null }, noturno);
    expect(r).toEqual({
      motivo: "dentro_do_expediente",
      volta_em: null,
      modo: "noturno_e_fds",
      expediente: { inicioHora: 9, fimHora: 18 },
    });
  });
});

describe("a fala do corretor desliga a IA, sem prazo (03/10/2026)", () => {
  it("a fala comum do corretor desliga, não pausa", () => {
    const codigo = semComentariosDe("src/lib/whatsapp/repositorio.ts");
    const inicio = codigo.indexOf("export async function desligarIaPorFalaDoCorretor");
    expect(inicio).toBeGreaterThan(-1);
    const corpo = codigo.slice(inicio, codigo.indexOf("\n}", inicio));
    expect(corpo).toContain("bot_ativo: false");
  });

  it("mandar uma lista de transmissão ativa a IA na conversa (03/10/2026)", () => {
    // O lead que responde à lista tem de ser atendido, mesmo que o corretor
    // tenha falado com ele antes. Ativar DEPOIS de gravar o envio: só a
    // mensagem que saiu entrega a conversa.
    const codigo = semComentariosDe("src/lib/whatsapp/campaignDispatcher.ts");
    const grava = codigo.indexOf('remetente: "bot"');
    const ativa = codigo.indexOf("ativarIaNaConversa(conversa.id)");
    expect(grava).toBeGreaterThan(-1);
    expect(ativa).toBeGreaterThan(grava);
  });

  it("ninguém mais grava pausa com prazo", () => {
    for (const arquivo of [
      "src/lib/whatsapp/repositorio.ts",
      "src/app/api/webhooks/whatsapp/route.ts",
      "src/app/corretor/(painel)/conversas/acoes.ts",
    ]) {
      expect(semComentariosDe(arquivo)).not.toMatch(/pausarBotPorAtendimentoHumano|HORAS_PAUSA_HUMANA/);
    }
  });
});

/*
 * As guardas que LEEM O CÓDIGO: a regressão aqui falha calada. O webhook
 * segue respondendo 200 e o cliente segue sendo pulado — ou atendido por cima
 * do corretor — e só uma consulta no banco revelaria que alguém voltou a
 * decidir por conta própria.
 */
const semComentarios = (arquivo: string) =>
  readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");

describe("todo lugar que decide responder pergunta à mesma função", () => {
  const LUGARES = [
    "src/app/api/webhooks/whatsapp/route.ts",
    "src/app/api/cron/followups/route.ts",
    "src/app/corretor/(painel)/conversas/chatModelo.ts",
  ];

  it.each(LUGARES)("%s chama decidirSeAIaResponde", (arquivo) => {
    expect(semComentarios(arquivo)).toContain("decidirSeAIaResponde(");
  });

  it.each([...LUGARES, "src/lib/whatsapp/aberturaPelaIA.ts", "src/lib/crm/avisoDeNovidade.ts"])(
    "%s não reimplementa a regra (sem decidirPorModo nem leitura crua da pausa para decidir)",
    (arquivo) => {
      const codigo = semComentarios(arquivo);
      expect(codigo).not.toContain("decidirPorModo(");
      expect(codigo).not.toMatch(/liberado_por_palavra_chave|liberadoPorPalavraChave/);
    },
  );

  it('o webhook não carimba motivo de silêncio à mão', () => {
    const codigo = semComentarios("src/app/api/webhooks/whatsapp/route.ts");
    expect(codigo).toContain("acao: decisaoIA.motivo");
    expect(codigo).not.toMatch(/acao:\s*"(pausada_por_humano|silenciada_por_modo|bot_desligado)"/);
  });

  it("o áudio não entendido também obedece à decisão inteira", () => {
    // Antes ele olhava só a conversa e respondia mesmo com o modo mandando calar.
    expect(semComentarios("src/app/api/webhooks/whatsapp/route.ts")).toContain(
      "audioFalhou && decisaoIA.responde",
    );
  });
});

describe("uma resposta por vez em cada conversa", () => {
  /*
   * Medido em 03/10/2026: a palavra-chave do corretor e a mensagem do cliente
   * chegaram no mesmo segundo, e o cliente recebeu DUAS respostas da IA — a
   * do caminho da palavra-chave e a do webhook. Todo caminho que responde
   * pega a mesma trava `resposta:<conversa>`.
   */
  it.each([
    "src/app/api/webhooks/whatsapp/route.ts",
    "src/lib/whatsapp/aberturaPelaIA.ts",
    "src/app/api/cron/followups/route.ts",
  ])("%s pega a trava de resposta da conversa", (arquivo) => {
    expect(semComentarios(arquivo)).toMatch(/`resposta:\$\{[^}]+\}`/);
  });

  it("o webhook, já com a trava, não fala se a vez passou", () => {
    expect(semComentarios("src/app/api/webhooks/whatsapp/route.ts")).toContain('action: "ja_respondida"');
  });
});

describe("cota de respostas da IA do grupo (fase 2B)", () => {
  it("cota esgotada cala com o motivo próprio e diz quando volta (dia 1º, em São Paulo)", () => {
    const d = decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT, cotaEsgotada: true });
    expect(d).toEqual({ responde: false, motivo: "cota_do_grupo", voltaEm: new Date("2026-09-01T03:00:00.000Z") });
  });

  it("o que já calaria cala pelo motivo de antes: a cota só entra quando a IA responderia", () => {
    expect(
      decidirSeAIaResponde({ conversa: { ...livre, botAtivo: false }, numero: sempre, agora: QUARTA_14H_BRT, cotaEsgotada: true }).motivo,
    ).toBe("ia_desligada_na_conversa");
    expect(
      decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_14H_BRT, cotaEsgotada: true }).motivo,
    ).toBe("dentro_do_expediente");
  });

  it("sem a informação da cota (ou com cota livre), nada muda", () => {
    expect(decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_22H_BRT }).responde).toBe(true);
    expect(
      decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_22H_BRT, cotaEsgotada: false }).responde,
    ).toBe(true);
  });

  it("a cota não é motivo da conversa (o selo da lista não a mostra)", () => {
    expect(silencioDaConversa(livre)).toBeNull();
  });

  it("a frase diz que o corretor atende e que nada se perdeu", () => {
    const frase = fraseDaDecisao({ responde: false, motivo: "cota_do_grupo", voltaEm: null }, sempre);
    expect(frase).toMatch(/respostas da IA/);
    expect(frase).toMatch(/você/i);
  });

  it.each([
    "src/app/api/webhooks/whatsapp/route.ts",
    "src/app/api/cron/followups/route.ts",
    "src/lib/whatsapp/aberturaPelaIA.ts",
  ])("%s consulta a cota antes de a IA falar", (arquivo) => {
    expect(semComentarios(arquivo)).toContain("lerCotaDaIa(");
  });
});

describe("grupo suspenso por cobrança (fase 2C)", () => {
  it("grupo suspenso cala com o motivo próprio, sem dizer quando volta", () => {
    const d = decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT, grupoSuspenso: true });
    expect(d).toEqual({ responde: false, motivo: "grupo_suspenso", voltaEm: null });
  });

  it("suspenso vence a cota: o que explica o silêncio é o pagamento", () => {
    const d = decidirSeAIaResponde({
      conversa: livre,
      numero: sempre,
      agora: QUARTA_14H_BRT,
      grupoSuspenso: true,
      cotaEsgotada: true,
    });
    expect(d.motivo).toBe("grupo_suspenso");
  });

  it("o que já calaria cala pelo motivo de antes", () => {
    expect(
      decidirSeAIaResponde({ conversa: { ...livre, botAtivo: false }, numero: sempre, agora: QUARTA_14H_BRT, grupoSuspenso: true })
        .motivo,
    ).toBe("ia_desligada_na_conversa");
    expect(
      decidirSeAIaResponde({ conversa: livre, numero: noturno, agora: QUARTA_14H_BRT, grupoSuspenso: true }).motivo,
    ).toBe("dentro_do_expediente");
  });

  it("sem a informação (ou com o grupo em dia), nada muda", () => {
    expect(decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT }).responde).toBe(true);
    expect(
      decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT, grupoSuspenso: false }).responde,
    ).toBe(true);
  });

  it("não é motivo da conversa, e o registro do silêncio leva o motivo sem data de volta", () => {
    expect(silencioDaConversa(livre)).toBeNull();
    const d = decidirSeAIaResponde({ conversa: livre, numero: sempre, agora: QUARTA_14H_BRT, grupoSuspenso: true });
    if (d.responde) throw new Error("devia calar");
    expect(registroDoSilencio(d, sempre)).toMatchObject({ motivo: "grupo_suspenso", volta_em: null });
  });

  it("a frase diz que o corretor atende e por que a IA parou", () => {
    const frase = fraseDaDecisao({ responde: false, motivo: "grupo_suspenso", voltaEm: null }, sempre);
    expect(frase).toMatch(/mensalidade/i);
    expect(frase).toMatch(/você/i);
  });

  // O defeito recorrente deste projeto: a tela e o webhook fazerem contas diferentes.
  it.each([
    ["src/app/api/webhooks/whatsapp/route.ts", "grupoSuspenso: suspenso"],
    ["src/app/api/cron/followups/route.ts", "grupoSuspenso: await grupoSuspenso("],
  ])("%s passa a cobrança para decidirSeAIaResponde", (arquivo, trecho) => {
    const codigo = semComentarios(arquivo);
    expect(codigo).toContain("grupoSuspenso(");
    expect(codigo.includes(trecho), trecho).toBe(true);
  });

  it("o cabeçalho da conversa leva a cobrança para a mesma decisão", () => {
    expect(semComentarios("src/app/corretor/(painel)/conversas/chatModelo.ts")).toContain(
      "grupoSuspenso: ia?.grupoSuspenso",
    );
  });

  it.each([
    "src/app/corretor/(painel)/conversas/page.tsx",
    "src/app/corretor/(painel)/pessoas/page.tsx",
  ])("%s entrega a cobrança ao cabeçalho da conversa", (arquivo) => {
    expect(semComentarios(arquivo)).toContain("grupoSuspenso: suspenso");
  });

  it.each([
    ["src/app/api/cron/followups/route.ts", /if \(await grupoSuspenso\(instancia\.grupo_id\)\) return "pulado"/],
    ["src/lib/whatsapp/campaignDispatcher.ts", /if \(await grupoSuspenso\(instancia\.grupo_id\)\)\s*\{\s*return vazio\(\s*"grupo_suspenso"/],
    ["src/lib/whatsapp/aberturaPelaIA.ts", /grupoSuspenso\(data\.grupo_id\)/],
    ["src/app/api/imagens/gerar/route.ts", /await grupoSuspenso\(corretor\.grupoId\)[\s\S]*MENSAGEM_DE_ARTES_PAUSADAS/],
    ["src/app/corretor/(painel)/marketing/video/acoes.ts", /await grupoSuspenso\(corretor\.grupoId\)\) return \{ erro: MENSAGEM_DE_VIDEOS_PAUSADOS/],
  ])("%s respeita a suspensão", (arquivo, regra) => {
    expect(semComentarios(arquivo)).toMatch(regra);
  });
});
