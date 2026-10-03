import { describe, expect, it } from "vitest";
import { lerHistoricoDoChat, LIMITE_DO_HISTORICO } from "./historicoDoChat";

const agora = new Date("2026-10-03T12:00:00Z");
const seg = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function registro(id: string, iso: string, message: Record<string, unknown>, fromMe = false) {
  return { key: { id, fromMe, remoteJid: "5511999990000@s.whatsapp.net" }, message, messageTimestamp: seg(iso) };
}

describe("lerHistoricoDoChat", () => {
  it("aceita os três formatos da Evolution", () => {
    const r = [registro("a", "2026-10-02T10:00:00Z", { conversation: "oi" })];
    expect(lerHistoricoDoChat(r, { agora })).toHaveLength(1);
    expect(lerHistoricoDoChat({ records: r }, { agora })).toHaveLength(1);
    expect(lerHistoricoDoChat({ messages: { total: 1, records: r } }, { agora })).toHaveLength(1);
  });

  it("vazio ou torto vira lista vazia, sem lançar", () => {
    expect(lerHistoricoDoChat(null, { agora })).toEqual([]);
    expect(lerHistoricoDoChat({ messages: { records: [{ lixo: true }] } }, { agora })).toEqual([]);
  });

  it("ordena da mais antiga para a mais recente e tira a mensagem atual", () => {
    const lidas = lerHistoricoDoChat(
      [
        registro("c", "2026-10-03T11:00:00Z", { conversation: "palavra" }, true),
        registro("b", "2026-10-02T11:00:00Z", { extendedTextMessage: { text: "quero ver o apê" } }),
        registro("a", "2026-10-01T11:00:00Z", { conversation: "oi" }),
      ],
      { agora, excluirId: "c" },
    );
    expect(lidas.map((m) => m.providerMessageId)).toEqual(["a", "b"]);
    expect(lidas[1].texto).toBe("quero ver o apê");
  });

  it("descarta o que passou da janela de dias e respeita o teto", () => {
    const antigos = [registro("x", "2026-08-01T10:00:00Z", { conversation: "velha" })];
    expect(lerHistoricoDoChat(antigos, { agora })).toEqual([]);

    const muitos = Array.from({ length: LIMITE_DO_HISTORICO + 10 }, (_, i) =>
      registro(`m${i}`, new Date(agora.getTime() - (i + 1) * 60_000).toISOString(), { conversation: `m${i}` }),
    );
    expect(lerHistoricoDoChat(muitos, { agora })).toHaveLength(LIMITE_DO_HISTORICO);
  });

  it("áudio fica sem texto (precisa de transcrição) e mídia vira anotação", () => {
    const lidas = lerHistoricoDoChat(
      [
        registro("a", "2026-10-02T10:00:00Z", { audioMessage: { seconds: 5 } }),
        registro("b", "2026-10-02T10:01:00Z", { imageMessage: { caption: "fachada" } }),
        registro("c", "2026-10-02T10:02:00Z", { reactionMessage: { text: "👍" } }),
      ],
      { agora },
    );
    expect(lidas.map((m) => [m.tipo, m.texto])).toEqual([
      ["audio", null],
      ["imagem", '[cliente enviou uma imagem: "fachada"]'],
    ]);
  });
});
