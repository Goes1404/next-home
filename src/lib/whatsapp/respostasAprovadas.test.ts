import { describe, expect, it } from "vitest";
import { escolherAprovadas, extrairAprovadas, formatarAprovadas } from "./respostasAprovadas";
import { escolherExemplos, type ConversaCandidata } from "./recuperacao";

describe("respostas aprovadas com 👍 viram exemplo", () => {
  const conversa = [
    { remetente: "cliente", texto: "tem apartamento de 2 dormitórios na Aldeia?", interacaoId: null },
    { remetente: "bot", texto: "Tenho sim, algumas opções na Aldeia.", interacaoId: "i1" },
    { remetente: "bot", texto: "Você prefere pronto ou na planta?", interacaoId: "i1" },
    { remetente: "cliente", texto: "na planta", interacaoId: null },
    { remetente: "bot", texto: "Oi Matheus, tudo bem?", interacaoId: "i2" },
  ];

  it("junta os balões da mesma resposta e pega a fala do cliente de antes", () => {
    expect(extrairAprovadas(conversa, new Set(["i1"]))).toEqual([
      {
        falaCliente: "tem apartamento de 2 dormitórios na Aldeia?",
        resposta: "Tenho sim, algumas opções na Aldeia.\nVocê prefere pronto ou na planta?",
      },
    ]);
  });

  it("resposta sem 👍 não entra", () => {
    expect(extrairAprovadas(conversa, new Set())).toEqual([]);
  });

  it("escolhe pelo assunto, e sem assunto em comum não entra nenhuma", () => {
    const lista = extrairAprovadas(conversa, new Set(["i1"]));
    expect(escolherAprovadas(lista, "vocês têm algo na aldeia?")).toHaveLength(1);
    expect(escolherAprovadas(lista, "qual o horário do plantão?")).toHaveLength(0);
  });

  it("o bloco avisa que os dados de imóvel vêm do catálogo", () => {
    const b = formatarAprovadas(extrairAprovadas(conversa, new Set(["i1"])));
    expect(b).toMatch(/APROVOU/);
    expect(b).toMatch(/só do catálogo/);
    expect(formatarAprovadas([])).toBe("");
  });
});

describe("few-shot usa o que o corretor achou", () => {
  const base = (id: string, extra: Partial<ConversaCandidata> = {}): ConversaCandidata => ({
    conversaId: id,
    leadEtapa: "novo",
    texto: "conversa",
    falasDoCliente: 3,
    atualizadaEm: new Date().toISOString(),
    ...extra,
  });

  it("conversa com resposta reprovada não vira exemplo", () => {
    const escolhidas = escolherExemplos([base("ruim", { respostasReprovadas: 1 }), base("ok")], []);
    expect(escolhidas.map((c) => c.conversaId)).toEqual(["ok"]);
  });

  it("conversa com resposta aprovada passa na frente", () => {
    const escolhidas = escolherExemplos([base("comum"), base("aprovada", { respostasAprovadas: 2 })], [], 1);
    expect(escolhidas[0].conversaId).toBe("aprovada");
  });
});
