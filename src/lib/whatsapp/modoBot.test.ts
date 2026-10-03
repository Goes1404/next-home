import { describe, expect, it } from "vitest";
import { pareceRecusaDeTranscricao } from "./audioTranscriber";
import {
  MINUTOS_COPILOTO,
  contemPalavraChave,
  decidirPorModo,
  dentroDoExpediente,
  decidirPorFalaDoCorretor,
  listarPalavrasChave,
  clienteTrouxeFraseDeEntrada,
} from "./modoBot";

/** Datas fixas em UTC; o módulo converte para America/Sao_Paulo (UTC-3). */
const QUARTA_14H_BRT = new Date("2026-08-19T17:00:00Z");
const QUARTA_21H_BRT = new Date("2026-08-20T00:00:00Z");
const QUARTA_07H_BRT = new Date("2026-08-19T10:00:00Z");
const SABADO_14H_BRT = new Date("2026-08-22T17:00:00Z");

describe("Modo do bot — expediente", () => {
  it("reconhece dia útil dentro do horário comercial", () => {
    expect(dentroDoExpediente(QUARTA_14H_BRT)).toBe(true);
  });

  it("reconhece a noite e a madrugada como fora do expediente", () => {
    expect(dentroDoExpediente(QUARTA_21H_BRT)).toBe(false);
    expect(dentroDoExpediente(QUARTA_07H_BRT)).toBe(false);
  });

  it("trata sábado como fora do expediente mesmo às 14h", () => {
    expect(dentroDoExpediente(SABADO_14H_BRT)).toBe(false);
  });

  it("usa o fuso de São Paulo, não o do servidor", () => {
    // 23h UTC de uma quarta é 20h em São Paulo: fora do expediente. Se a
    // conta usasse UTC, daria "23h" e passaria pelo mesmo caminho — o teste
    // que pega o erro é o oposto: 11h UTC = 8h BRT, ainda fechado.
    expect(dentroDoExpediente(new Date("2026-08-19T11:00:00Z"))).toBe(false);
    expect(dentroDoExpediente(new Date("2026-08-19T12:00:00Z"))).toBe(true);
  });
});

describe("Modo do bot — decisão por modo", () => {
  it("24/7 responde a qualquer hora", () => {
    expect(decidirPorModo("24_7", { agora: QUARTA_14H_BRT }).pode).toBe(true);
    expect(decidirPorModo("24_7", { agora: QUARTA_21H_BRT }).pode).toBe(true);
  });

  it("desativado nunca responde", () => {
    const decisao = decidirPorModo("desativado", { agora: QUARTA_21H_BRT });
    expect(decisao.pode).toBe(false);
    expect(decisao.motivo).toBe("desativado");
  });

  it("noturno e fds cala durante o expediente e fala fora dele", () => {
    expect(decidirPorModo("noturno_e_fds", { agora: QUARTA_14H_BRT })).toEqual({
      pode: false,
      motivo: "dentro_do_expediente",
    });
    expect(decidirPorModo("noturno_e_fds", { agora: QUARTA_21H_BRT })).toEqual({
      pode: true,
      motivo: "fora_do_expediente",
    });
    expect(decidirPorModo("noturno_e_fds", { agora: SABADO_14H_BRT }).pode).toBe(true);
  });

  it("co-piloto fica quieto enquanto o corretor está respondendo", () => {
    const agora = new Date("2026-08-19T17:00:00Z");
    const umMinutoAtras = new Date(agora.getTime() - 60_000).toISOString();

    expect(decidirPorModo("co_piloto_3min", { agora, ultimaFalaCorretorEm: umMinutoAtras })).toEqual({
      pode: false,
      motivo: "corretor_respondendo",
    });
  });

  it("co-piloto assume depois da janela de silêncio", () => {
    const agora = new Date("2026-08-19T17:00:00Z");
    const passouDaJanela = new Date(agora.getTime() - (MINUTOS_COPILOTO + 1) * 60_000).toISOString();

    expect(decidirPorModo("co_piloto_3min", { agora, ultimaFalaCorretorEm: passouDaJanela }).pode).toBe(
      true,
    );
  });

  it("co-piloto responde quando o corretor nunca falou na conversa", () => {
    expect(decidirPorModo("co_piloto_3min", { ultimaFalaCorretorEm: null })).toEqual({
      pode: true,
      motivo: "corretor_ausente",
    });
  });

  it("data inválida não deixa o bot mudo", () => {
    expect(decidirPorModo("co_piloto_3min", { ultimaFalaCorretorEm: "nem-data" }).pode).toBe(true);
  });
});

describe("Ativação por palavra-chave", () => {
  it("reconhece a palavra-chave sem se importar com maiúscula ou acento", () => {
    expect(contemPalavraChave("Pode Continuar, obrigado!", "pode continuar")).toBe(true);
    expect(contemPalavraChave("já pôde continuar com o atendimento", "PODE CONTINUAR")).toBe(true);
  });

  it("não reconhece quando a frase não está presente", () => {
    expect(contemPalavraChave("Vou almoçar, já volto", "pode continuar")).toBe(false);
  });

  it("nunca ativa quando não há palavra-chave cadastrada", () => {
    expect(contemPalavraChave("pode continuar", null)).toBe(false);
    expect(contemPalavraChave("pode continuar", undefined)).toBe(false);
    expect(contemPalavraChave("pode continuar", "   ")).toBe(false);
  });
});

describe("Transcrição de áudio — recusa do modelo", () => {
  it("reconhece a recusa que foi parar no banco em produção", () => {
    expect(
      pareceRecusaDeTranscricao(
        "Nenhum áudio fornecido. Por favor, forneça o texto do áudio do cliente para que eu possa transcrever.",
      ),
    ).toBe(true);
  });

  it("reconhece outras formas de o modelo dizer que não transcreveu", () => {
    expect(pareceRecusaDeTranscricao("Não consigo transcrever este arquivo.")).toBe(true);
    expect(pareceRecusaDeTranscricao("Não tenho acesso ao áudio enviado.")).toBe(true);
    expect(pareceRecusaDeTranscricao("Sou um modelo de linguagem e não processo áudio.")).toBe(true);
    expect(pareceRecusaDeTranscricao("O áudio está corrompido.")).toBe(true);
    expect(pareceRecusaDeTranscricao("   ")).toBe(true);
  });

  it("não descarta transcrição legítima de cliente", () => {
    expect(
      pareceRecusaDeTranscricao(
        "Oi, tudo bem? Queria saber o preço do três suítes no Reserva Alphaville e se dá pra visitar sábado.",
      ),
    ).toBe(false);
    // Cliente reclamando que não recebeu material continua sendo fala real.
    expect(pareceRecusaDeTranscricao("Não recebi a planta que você falou, pode mandar?")).toBe(false);
  });
});

describe("Fala do corretor — a palavra-chave liga, qualquer outra fala desliga a IA na conversa", () => {
  const CHAVE = "ativar lia agora";

  it("ativa a IA quando a mensagem traz a palavra-chave", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "pronto, ativar lia agora",
        palavraChaveConfigurada: CHAVE,
      }),
    ).toEqual({ acao: "ativar_ia", marcarComoTeste: false });
  });

  it("desliga a IA em qualquer outra fala do corretor", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "oi mãe, vamos no cinema?",
        palavraChaveConfigurada: CHAVE,
      }),
    ).toEqual({ acao: "desligar_ia" });
  });

  /*
   * Desde 03/10/2026 a fala do corretor DESLIGA a IA na conversa, sem prazo:
   * ela só volta com a palavra-chave ou "IA assume agora".
   */
  it("fala comum do corretor sempre desliga, nunca liga", () => {
    const decisao = decidirPorFalaDoCorretor({
      mensagem: "Teste",
      palavraChaveConfigurada: "pode continuar",
    });
    expect(decisao).toEqual({ acao: "desligar_ia" });
  });

  it("desliga mesmo sem palavra-chave cadastrada", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "qualquer coisa",
        palavraChaveConfigurada: null,
      }),
    ).toEqual({ acao: "desligar_ia" });
  });

  it("conversa de campanha também desliga", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "vou assumir daqui",
        palavraChaveConfigurada: CHAVE,
      }),
    ).toEqual({ acao: "desligar_ia" });
  });
});

describe("Transcrição de áudio — o modelo aguardando em vez de transcrever", () => {
  /*
   * Este texto foi para o banco de PRODUÇÃO como se fosse fala de quem
   * mandou o áudio. Nenhum dos padrões anteriores pegava: não há negação
   * nem pedido de arquivo, é o modelo anunciando que está pronto.
   */
  it("reconhece o 'aguardando a fala do cliente' que foi gravado como mensagem", () => {
    expect(pareceRecusaDeTranscricao("Aguardando a fala do cliente para transcrever.")).toBe(true);
    expect(
      pareceRecusaDeTranscricao("Pronto para transcrever e resumir a intenção do cliente."),
    ).toBe(true);
  });

  it("continua aceitando fala de verdade sobre imóvel", () => {
    expect(
      pareceRecusaDeTranscricao(
        "Oi, vi o anúncio da casa com cinco suítes, queria saber se ainda está disponível.",
      ),
    ).toBe(false);
    expect(pareceRecusaDeTranscricao("Pode me mandar a planta do três dormitórios?")).toBe(false);
  });
});

describe("Palavra-chave de TESTE", () => {
  const CHAVE = "ativar lia agora";
  const TESTE = "modo teste agora";

  /*
   * A 0038 limpou 46 conversas e 891 interações de teste que estavam sendo
   * ensinadas ao agente como few-shot. Esta palavra existe para isso não se
   * repetir: o corretor continua testando pela linha de verdade durante o
   * piloto, e essas conversas nasceriam como REAIS.
   */
  it("liga a IA e marca a conversa como teste", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "modo teste agora",
        palavraChaveConfigurada: CHAVE,
        palavraChaveTeste: TESTE,
      }),
    ).toEqual({ acao: "ativar_ia", marcarComoTeste: true });
  });

  it("a palavra normal continua ligando sem marcar", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "ativar lia agora",
        palavraChaveConfigurada: CHAVE,
        palavraChaveTeste: TESTE,
      }),
    ).toEqual({ acao: "ativar_ia", marcarComoTeste: false });
  });

  /*
   * Se as duas casarem, marcar teste é o desfecho seguro: uma conversa real
   * marcada como teste custa um exemplo a menos; uma de teste marcada como
   * real envenena o prompt.
   */
  it("na dúvida, teste vence", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "ativar lia agora em modo teste agora",
        palavraChaveConfigurada: CHAVE,
        palavraChaveTeste: TESTE,
      }),
    ).toEqual({ acao: "ativar_ia", marcarComoTeste: true });
  });

  it("qualquer outra fala do corretor continua desligando", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "oi mãe",
        palavraChaveConfigurada: CHAVE,
        palavraChaveTeste: TESTE,
      }),
    ).toEqual({ acao: "desligar_ia" });
  });

  it("fala comum do corretor desliga mesmo só com a palavra de teste cadastrada", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "qualquer coisa",
        palavraChaveConfigurada: null,
        palavraChaveTeste: TESTE,
      }),
    ).toEqual({ acao: "desligar_ia" });
  });

  it("sem palavra de teste cadastrada, nada é marcado", () => {
    expect(
      decidirPorFalaDoCorretor({
        mensagem: "ativar lia agora",
        palavraChaveConfigurada: CHAVE,
        palavraChaveTeste: null,
      }),
    ).toEqual({ acao: "ativar_ia", marcarComoTeste: false });
  });
});

describe("Várias palavras-chave no mesmo campo (26/08/2026)", () => {
  const CHAVES = "pode assumir, sofia entra, assume ai";

  it("qualquer uma das chaves cadastradas ativa a IA", () => {
    for (const msg of [
      "pode assumir aí",
      "Sofia entra nessa",
      "assume ai que eu tô dirigindo",
    ]) {
      expect(contemPalavraChave(msg, CHAVES), msg).toBe(true);
    }
  });

  it("fala comum do corretor continua não ativando", () => {
    for (const msg of ["te ligo já", "bom dia, tudo bem?", "vou passar aí"]) {
      expect(contemPalavraChave(msg, CHAVES), msg).toBe(false);
    }
  });

  it("chave curta demais é descartada — 'a' não pode ligar a IA em toda mensagem", () => {
    expect(contemPalavraChave("bom dia", "a, ok")).toBe(false);
    expect(listarPalavrasChave("a, ok, pode assumir")).toEqual(["pode assumir"]);
  });

  it("uma chave só continua funcionando como antes", () => {
    expect(contemPalavraChave("pode assumir", "pode assumir")).toBe(true);
    expect(contemPalavraChave("outra coisa", "pode assumir")).toBe(false);
  });

  it("espaço e caixa não importam na lista", () => {
    expect(contemPalavraChave("PODE ASSUMIR", "  pode assumir ,  sofia entra ")).toBe(true);
  });
});

describe("Porta de entrada do CLIENTE (0056)", () => {
  const FRASES = "vim pelo anuncio, quero informacoes, vi no instagram";

  it("quem chega com uma das frases é atendido na hora", () => {
    for (const msg of [
      "Oi, vim pelo anúncio de vocês",
      "Boa tarde, quero informações sobre apartamentos",
      "vi no Instagram e queria saber mais",
    ]) {
      expect(
        clienteTrouxeFraseDeEntrada({ mensagem: msg, palavrasEntradaCliente: FRASES }),
        msg,
      ).toBe(true);
    }
  });

  /*
   * O que o porteiro existe para proteger: a instância roda no WhatsApp
   * PESSOAL do corretor, e a IA já assumiu a conversa da mãe dele uma vez.
   * Conversa comum NÃO pode abrir a porta.
   */
  it("conversa pessoal não abre a porta", () => {
    for (const msg of [
      "oi, tudo bem?",
      "filho, você vem jantar hoje?",
      "bom dia! me liga quando puder",
    ]) {
      expect(
        clienteTrouxeFraseDeEntrada({ mensagem: msg, palavrasEntradaCliente: FRASES }),
        msg,
      ).toBe(false);
    }
  });

  it("sem frases cadastradas, ninguém entra por frase", () => {
    expect(
      clienteTrouxeFraseDeEntrada({ mensagem: "vim pelo anúncio", palavrasEntradaCliente: null }),
    ).toBe(false);
    expect(
      clienteTrouxeFraseDeEntrada({ mensagem: "vim pelo anúncio", palavrasEntradaCliente: "" }),
    ).toBe(false);
  });

  it("frase curta demais é descartada — senão qualquer 'oi' abriria a porta", () => {
    expect(clienteTrouxeFraseDeEntrada({ mensagem: "oi", palavrasEntradaCliente: "oi, ok" })).toBe(
      false,
    );
  });

  it("acento e caixa não decidem nada", () => {
    expect(
      clienteTrouxeFraseDeEntrada({
        mensagem: "VIM PELO ANÚNCIO!!",
        palavrasEntradaCliente: "vim pelo anuncio",
      }),
    ).toBe(true);
  });
});
