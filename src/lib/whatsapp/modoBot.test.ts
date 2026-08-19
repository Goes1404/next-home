import { describe, expect, it } from "vitest";
import { pareceRecusaDeTranscricao } from "./audioTranscriber";
import { MINUTOS_COPILOTO, decidirPorModo, dentroDoExpediente } from "./modoBot";

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
